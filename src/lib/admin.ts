import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { getDb, parseJson, withTransaction } from "./db";
import { parseRole, type Role } from "./roles";
import type { ProductStatus } from "./product-status";
import {
  adjustStock,
  listStockBuckets,
  recordOpeningBalance,
} from "./inventory";
import { worstStockLevel, type StockLevel } from "./stock";
import { isOwnUpload } from "./uploads";
import { normalizeSku, skuFromSlug, uniqueSku } from "./sku";
import {
  cleanAttributes,
  combinationKey,
  type ProductAttributes,
} from "./variations";
import { getProducts, type ProductQuery } from "./queries";
import type {
  AdminStats,
  CatalogueFilters,
  ContactMessage,
  CustomerSummary,
  OrderSummary,
  ProductCondition,
  ProductImage,
  ProductWithVariants,
  Variant,
} from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

/** Orders that were cancelled did not earn anything. */
const EARNING = "status != 'cancelled'";

/* ------------------------------------------------------------------ stats */

export async function getAdminStats(): Promise<AdminStats> {
  const db = getDb();
  const one = async (sql: string, ...params: (string | number)[]) => {
    const row = (await db.prepare(sql).get(...params)) as Row | undefined;
    return row ?? {};
  };

  const revenue = num((await one(`SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE ${EARNING}`)).n);
  const orders = num((await one("SELECT COUNT(*) AS n FROM orders")).n);
  const customers = num((await one("SELECT COUNT(*) AS n FROM users")).n);
  const products = num((await one("SELECT COUNT(*) AS n FROM products WHERE listed = 1")).n);
  const delisted = num((await one("SELECT COUNT(*) AS n FROM products WHERE listed = 0")).n);
  const openMessages = num(
    (await one("SELECT COUNT(*) AS n FROM contact_messages WHERE status IN ('new','open')")).n
  );

  const revenueLast30 = num(
    (await one(
      `SELECT COALESCE(SUM(total), 0) AS n FROM orders
       WHERE ${EARNING} AND created_at >= datetime('now','-30 days')`
    )).n
  );
  const ordersLast30 = num(
    (await one(
      "SELECT COUNT(*) AS n FROM orders WHERE created_at >= datetime('now','-30 days')"
    )).n
  );
  const customersLast30 = num(
    (await one(
      "SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-30 days')"
    )).n
  );

  const byStatus = (
    (await db
      .prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status")
      .all()) as Row[]
  ).map((r) => ({ status: str(r.status), count: num(r.count) }));

  // The catalogue, counted properly: every product, and how many of them
  // are on sale, still a draft, or have been retired.
  const totalProducts = num((await one("SELECT COUNT(*) n FROM products")).n);
  const publishedProducts = num(
    (await one("SELECT COUNT(*) n FROM products WHERE status = 'published'")).n
  );
  const draftProducts = num(
    (await one("SELECT COUNT(*) n FROM products WHERE status = 'draft'")).n
  );
  const archivedProducts = num(
    (await one("SELECT COUNT(*) n FROM products WHERE status = 'archived'")).n
  );

  // The stock, counted the way the catalogue counts it: a product with
  // options is counted by its options, and its level is the worst of them.
  const buckets = (await listStockBuckets());
  const byProduct = new Map<string, typeof buckets>();
  for (const bucket of buckets) {
    byProduct.set(bucket.product_slug, [
      ...(byProduct.get(bucket.product_slug) ?? []),
      bucket,
    ]);
  }

  const levelOf = new Map<string, StockLevel>();
  for (const [slug, list] of byProduct) {
    levelOf.set(slug, worstStockLevel(list.map((b) => b.level)));
  }

  const lowStock = [...levelOf.values()].filter((l) => l === "low").length;
  const outOfStock = [...levelOf.values()].filter((l) => l === "out").length;

  // The products that need reordering, one line each — the option that is
  // worst is the one worth naming.
  const runningLow = [...byProduct.entries()]
    .filter(([, list]) => {
      const level = levelOf.get(list[0]?.product_slug ?? "");
      return level === "low" || level === "out";
    })
    .map(([slug, list]) => {
      const worst = [...list].sort((a, b) => a.stock - b.stock)[0];
      return {
        slug,
        name: worst.product_name,
        variant_name: worst.variant_name,
        stock: worst.stock,
        threshold: worst.threshold,
        level: levelOf.get(slug) ?? "in",
      };
    })
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

  return {
    revenue,
    orders,
    customers,
    products,
    delisted,
    openMessages,
    lowStock,
    outOfStock,
    totalProducts,
    publishedProducts,
    draftProducts,
    archivedProducts,
    revenueLast30,
    ordersLast30,
    customersLast30,
    byStatus,
    recentOrders: (await listOrders({ limit: 6 })),
    lowStockProducts: runningLow.slice(0, 6),
    topProducts: (
      (await db
        .prepare(
          `SELECT oi.product_slug AS slug, oi.name AS name,
                  SUM(oi.quantity) AS units,
                  SUM(oi.quantity * oi.price) AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.status != 'cancelled'
           GROUP BY oi.product_slug, oi.name
           ORDER BY units DESC, revenue DESC LIMIT 6`
        )
        .all()) as Row[]
    ).map((r) => ({
      slug: str(r.slug),
      name: str(r.name),
      units: num(r.units),
      revenue: num(r.revenue),
    })),
  };
}

/* --------------------------------------------------------------- customers */

export type CustomerQuery = {
  q?: string;
  role?: Role | "all" | string;
  limit?: number;
  offset?: number;
};

function customerWhere(query: CustomerQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    where.push("(u.name LIKE ? OR u.email LIKE ?)");
    const like = `%${query.q}%`;
    params.push(like, like);
  }
  if (query.role && query.role !== "all") {
    where.push("u.role = ?");
    params.push(query.role);
  }

  return { where, params };
}

export async function listCustomers(query: CustomerQuery = {}): Promise<CustomerSummary[]> {
  const { where, params } = customerWhere(query);
  const bind = [...params];
  let limit = "";
  let offset = "";
  if (typeof query.limit === "number") {
    limit = "LIMIT ?";
    bind.push(query.limit);
  }
  if (typeof query.offset === "number") {
    offset = "OFFSET ?";
    bind.push(query.offset);
  }

  return (
    (await getDb()
      .prepare(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
                (SELECT COALESCE(SUM(o.total), 0) FROM orders o
                  WHERE o.user_id = u.id AND o.status != 'cancelled') AS total_spent
         FROM users u
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY u.created_at DESC ${limit} ${offset}`
      )
      .all(...bind)) as Row[]
  ).map((r) => ({
    id: num(r.id),
    name: str(r.name),
    email: str(r.email),
    phone: strOrNull(r.phone),
    role: parseRole(r.role),
    created_at: str(r.created_at),
    order_count: num(r.order_count),
    total_spent: num(r.total_spent),
  }));
}

export async function countCustomers(query: CustomerQuery = {}): Promise<number> {
  const { where, params } = customerWhere(query);
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM users u ${
        where.length ? `WHERE ${where.join(" AND ")}` : ""
      }`
    )
    .get(...params)) as Row | undefined;
  return num(row?.n);
}

/* ------------------------------------------------------------------ orders */

export type OrderQuery = {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

function orderWhere(query: OrderQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    where.push("(o.id LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ?)");
    const like = `%${query.q}%`;
    params.push(like, like, like, like);
  }
  if (query.status && query.status !== "all") {
    where.push("o.status = ?");
    params.push(query.status);
  }

  return { where, params };
}

export async function listOrders(query: OrderQuery = {}): Promise<OrderSummary[]> {
  const { where, params } = orderWhere(query);
  const bind = [...params];
  let limit = "";
  let offset = "";
  if (typeof query.limit === "number") {
    limit = "LIMIT ?";
    bind.push(query.limit);
  }
  if (typeof query.offset === "number") {
    offset = "OFFSET ?";
    bind.push(query.offset);
  }

  return (
    (await getDb()
      .prepare(
        `SELECT o.id, o.created_at, o.name, o.email, o.city, o.state, o.total,
                o.payment_method, o.status, o.user_id,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY o.created_at DESC ${limit} ${offset}`
      )
      .all(...bind)) as Row[]
  ).map((r) => ({
    id: str(r.id),
    created_at: str(r.created_at),
    name: str(r.name),
    email: str(r.email),
    city: str(r.city),
    state: str(r.state),
    total: num(r.total),
    item_count: num(r.item_count),
    payment_method: str(r.payment_method),
    status: str(r.status),
    user_id: r.user_id === null ? null : num(r.user_id),
  }));
}

export async function countOrders(query: OrderQuery = {}): Promise<number> {
  const { where, params } = orderWhere(query);
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM orders o ${
        where.length ? `WHERE ${where.join(" AND ")}` : ""
      }`
    )
    .get(...params)) as Row | undefined;
  return num(row?.n);
}

/* ---------------------------------------------------------------- messages */

export type MessageQuery = {
  q?: string;
  status?: string;
  subject?: string;
  limit?: number;
  offset?: number;
};

function messageWhere(query: MessageQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    where.push("(m.name LIKE ? OR m.email LIKE ? OR m.message LIKE ? OR m.order_id LIKE ?)");
    const like = `%${query.q}%`;
    params.push(like, like, like, like);
  }
  if (query.status && query.status !== "all") {
    where.push("m.status = ?");
    params.push(query.status);
  }
  if (query.subject && query.subject !== "all") {
    where.push("m.subject = ?");
    params.push(query.subject);
  }

  return { where, params };
}

export async function listMessages(query: MessageQuery = {}): Promise<ContactMessage[]> {
  const { where, params } = messageWhere(query);
  const bind = [...params];
  let limit = "";
  let offset = "";
  if (typeof query.limit === "number") {
    limit = "LIMIT ?";
    bind.push(query.limit);
  }
  if (typeof query.offset === "number") {
    offset = "OFFSET ?";
    bind.push(query.offset);
  }

  return (
    (await getDb()
      .prepare(
        `SELECT m.*, u.name AS handled_by_name
         FROM contact_messages m
         LEFT JOIN users u ON u.id = m.handled_by
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY m.created_at DESC ${limit} ${offset}`
      )
      .all(...bind)) as Row[]
  ).map((r) => ({
    id: num(r.id),
    name: str(r.name),
    email: str(r.email),
    subject: str(r.subject),
    order_id: strOrNull(r.order_id),
    message: str(r.message),
    status: str(r.status),
    handled_by: r.handled_by === null ? null : num(r.handled_by),
    handled_by_name: strOrNull(r.handled_by_name),
    email_status: strOrNull(r.email_status),
    email_sent_at: strOrNull(r.email_sent_at),
    handled_at: strOrNull(r.handled_at),
    created_at: str(r.created_at),
  }));
}

export async function countMessages(query: MessageQuery = {}): Promise<number> {
  const { where, params } = messageWhere(query);
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM contact_messages m ${
        where.length ? `WHERE ${where.join(" AND ")}` : ""
      }`
    )
    .get(...params)) as Row | undefined;
  return num(row?.n);
}

/* ---------------------------------------------------------------- products */

/**
 * Turns the back office's filters into a catalogue query.
 *
 * One place, so the listing, the counts and a bulk action over "everything
 * matching" always agree on what the filters mean.
 */
export function catalogueQuery(filters: CatalogueFilters): ProductQuery {
  return {
    q: filters.q?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    brands: filters.brand?.trim() ? [filters.brand.trim()] : undefined,
    stockStatus: filters.stock && filters.stock !== "all" ? filters.stock : "all",
    status: filters.status?.trim() || "all",
    listed: filters.listed?.trim() || "all",
    includeUnlisted: true,
    // The catalogue counts the stock a product can really sell.
    stockBasis: "sellable",
  };
}

/** The catalogue with each product's variants attached. */
export async function listAdminProducts(
  query: ProductQuery = {}
): Promise<ProductWithVariants[]> {
  // The back office always sees the whole catalogue — drafts, archived
  // products and delisted ones included — and narrows it with the filters
  // it is given.
  const products = (await getProducts({ ...query, includeUnlisted: true }));
  if (!products.length) return [];

  const placeholders = products.map(() => "?").join(",");
  const rows = (await getDb()
    .prepare(
      `SELECT * FROM variants WHERE product_slug IN (${placeholders}) ORDER BY position`
    )
    .all(...products.map((p) => p.slug))) as Row[];

  const bySlug = new Map<string, Variant[]>();
  for (const r of rows) {
    const slug = str(r.product_slug);
    const list = bySlug.get(slug) ?? [];
    list.push({
      id: str(r.id),
      product_slug: slug,
      name: str(r.name),
      sku: strOrNull(r.sku),
      price: num(r.price),
      mrp: num(r.mrp),
      stock: num(r.stock),
      low_stock_threshold: num(r.low_stock_threshold),
      image: strOrNull(r.image),
      barcode: strOrNull(r.barcode),
      attributes: parseJson<Record<string, string>>(r.attributes, {}),
      position: num(r.position),
    });
    bySlug.set(slug, list);
  }

  return products.map((p) => ({ ...p, variants: bySlug.get(p.slug) ?? [] }));
}

/** Everything a new product needs. */
export type NewProduct = {
  slug: string;
  name: string;
  brand: string | null;
  subcategory: string | null;
  modelNumber: string | null;
  categorySlug: string;
  condition: ProductCondition;
  price: number;
  mrp: number;
  salePrice: number | null;
  purchaseCost: number | null;
  stock: number;
  /** Who put the product there, for the opening balance in the history. */
  userId?: number | null;
  badge: string | null;
  shortDesc: string | null;
  description: string | null;
  /** The specifications. */
  specs: Record<string, string>;
  /** What the product varies by. */
  attributes?: ProductAttributes;
  sku: string | null;
  imageAlt: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  weightGrams: number | null;
  packageLength: number | null;
  packageWidth: number | null;
  packageHeight: number | null;
  warranty: string | null;
  returns: string | null;
};

/**
 * Puts a new product in the catalogue.
 *
 * The SKU is worked out here rather than by the caller: one that was typed
 * in is normalised and checked against every other product, and one that was
 * left blank is generated from the slug. A new product starts as a draft —
 * publishing it is a separate, deliberate act.
 *
 * The product is written with no stock. Its opening count is put on the
 * shelf by the inventory afterwards, so that the first movement in its
 * history is the opening balance rather than a number with nothing behind
 * it.
 */
export async function createProduct(
  p: NewProduct
): Promise<{ ok: boolean; slug?: string; reason?: string; field?: string }> {
  const db = getDb();

  const exists = (await db
    .prepare("SELECT slug FROM products WHERE slug = ?")
    .get(p.slug));
  if (exists) {
    return {
      ok: false,
      reason: "That address is already taken by another product.",
      field: "slug",
    };
  }

  let sku = normalizeSku(p.sku ?? "");
  if (sku && (await skuTakenByAnother(sku, p.slug))) {
    return {
      ok: false,
      reason: "Another product already uses this SKU.",
      field: "sku",
    };
  }
  if (!sku) {
    sku = (await uniqueSku(skuFromSlug(p.slug), async (candidate) =>
      (await skuTakenByAnother(candidate, p.slug))
    ));
  }

  const position = num(
    (
      (await db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM products").get()) as {
        n: number;
      }
    ).n
  );

  (await db.prepare(
    `INSERT INTO products
       (slug, sku, name, brand, category_slug, subcategory, model_number,
        price, mrp, sale_price, purchase_cost, rating, reviews, stock, condition,
        badge, short_desc, description, specs, image, attributes, image_alt,
        seo_title, meta_description, weight_grams,
        package_length, package_width, package_height, warranty, returns,
        listed, status, position)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'draft',?)`
  ).run(
    p.slug,
    sku,
    p.name,
    p.brand,
    p.categorySlug,
    p.subcategory,
    p.modelNumber,
    p.price,
    p.mrp,
    p.salePrice,
    p.purchaseCost,
    p.condition,
    p.badge,
    p.shortDesc,
    p.description,
    JSON.stringify(p.specs),
    null,
    JSON.stringify(cleanAttributes(p.attributes ?? {})),
    p.imageAlt,
    p.seoTitle,
    p.metaDescription,
    p.weightGrams,
    p.packageLength,
    p.packageWidth,
    p.packageHeight,
    p.warranty,
    p.returns,
    position
  ));

  // The product is written with no stock, and the count is put on by the
  // inventory — so the first movement in its history is the opening
  // balance rather than a number with nothing behind it.
  (await recordOpeningBalance(p.slug, p.stock, p.userId ?? null));

  return { ok: true, slug: p.slug };
}

/** Every product photograph already in the catalogue, for the image picker. */
export async function listProductImages(): Promise<string[]> {
  return (
    (await getDb()
      .prepare(
        "SELECT DISTINCT image FROM products WHERE image IS NOT NULL ORDER BY image"
      )
      .all()) as Row[]
  ).map((r) => str(r.image));
}

/* --------------------------------------------------------------- variants */

/**
 * Everything an option may carry.
 *
 * The stock is written through the inventory rather than straight to the
 * row, so that every change to it is written down with its reason.
 */
export type VariantInput = {
  name?: string;
  attributes?: Record<string, string>;
  sku?: string | null;
  price?: number;
  mrp?: number;
  stock?: number;
  lowStockThreshold?: number;
  image?: string | null;
  barcode?: string | null;
};

export type VariantResult = {
  ok: boolean;
  variant?: Variant;
  reason?: string;
  field?: string;
};

/** The name an option's values give it, falling back to the name given. */
function labelFor(input: VariantInput): string {
  const attributes = input.attributes ?? {};
  const values = Object.entries(attributes)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([, value]) => String(value).trim());
  return values.length ? values.join(" / ") : (input.name ?? "").trim();
}

/** True when another option of the same product already has these values. */
async function combinationTaken(
  slug: string,
  key: string,
  exceptVariantId: string | null
): Promise<boolean> {
  const rows = (await getDb()
    .prepare("SELECT id, name, attributes FROM variants WHERE product_slug = ?")
    .all(slug)) as { id: string; name: string; attributes: string | null }[];

  return rows.some((r) => {
    if (exceptVariantId && r.id === exceptVariantId) return false;
    const attributes = parseJson<Record<string, string>>(r.attributes, {});
    return combinationKey(attributes, r.name) === key;
  });
}

/** True when another product or option already uses this code. */
async function variantSkuTaken(sku: string, exceptVariantId: string | null): Promise<boolean> {
  const db = getDb();
  const product = (await db
    .prepare("SELECT slug FROM products WHERE sku = ? LIMIT 1")
    .get(sku));
  if (product) return true;
  const variant = (await db
    .prepare("SELECT id FROM variants WHERE sku = ? AND id IS DISTINCT FROM ? LIMIT 1")
    .get(sku, exceptVariantId));
  return Boolean(variant);
}

/** True when another option already uses this barcode. */
async function variantBarcodeTaken(
  barcode: string,
  exceptVariantId: string | null
): Promise<boolean> {
  const row = (await getDb()
    .prepare("SELECT id FROM variants WHERE barcode = ? AND id IS DISTINCT FROM ? LIMIT 1")
    .get(barcode, exceptVariantId));
  return Boolean(row);
}

/**
 * Sets what a product varies by.
 *
 * "Colour" with White and Midnight Blue, "Storage" with 1TB and 2TB. The
 * options already on the product keep their own values — this is the list
 * the back office offers, not a rewrite of the options themselves.
 */
export async function setProductAttributes(
  slug: string,
  attributes: ProductAttributes
): Promise<boolean> {
  const info = (await getDb()
    .prepare("UPDATE products SET attributes = ? WHERE slug = ?")
    .run(JSON.stringify(cleanAttributes(attributes)), slug));
  return info.changes > 0;
}

/**
 * Adds an option to a product.
 *
 * Two options of the same product may not have the same values — the second
 * one is refused, because it would be the same thing twice under a
 * different name.
 */
export async function createVariant(
  slug: string,
  input: VariantInput,
  userId: number | null = null
): Promise<VariantResult> {
  const db = getDb();

  const product = (await db
    .prepare("SELECT slug FROM products WHERE slug = ?")
    .get(slug)) as { slug?: string } | undefined;
  if (!product) return { ok: false, reason: "That product no longer exists." };

  const attributes = cleanVariantAttributes(input.attributes);
  const label = labelFor({ ...input, attributes });
  if (!label) {
    return { ok: false, reason: "Give the option a name.", field: "name" };
  }

  const key = combinationKey(attributes, label);
  if ((await combinationTaken(slug, key, null))) {
    return {
      ok: false,
      reason: "This product already has an option with those values.",
      field: "attributes",
    };
  }

  const wantedSku = normalizeSku(input.sku ?? "");
  if (wantedSku && (await variantSkuTaken(wantedSku, null))) {
    return {
      ok: false,
      reason: "Another product or option already uses that code.",
      field: "sku",
    };
  }

  const barcode = input.barcode?.trim() || null;
  if (barcode && (await variantBarcodeTaken(barcode, null))) {
    return {
      ok: false,
      reason: "Another option already uses that barcode.",
      field: "barcode",
    };
  }

  // The option's own id. It never changes once it is made, so the baskets
  // and the orders that point at it keep pointing at it.
  const base = `${slug}::${slugifyPart(label)}`;
  let id = base;
  let n = 2;
  while ((await db.prepare("SELECT id FROM variants WHERE id = ?").get(id))) {
    id = `${base}-${n}`;
    n++;
  }

  const sku = wantedSku
    ? wantedSku
    : (await uniqueSku(skuFromSlug(`${slug}-${label}`), async (candidate) =>
        (await variantSkuTaken(candidate, null))
      ));

  const position = num(
    (
      (await db
        .prepare(
          "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM variants WHERE product_slug = ?"
        )
        .get(slug)) as { n: number }
    ).n
  );

  (await db.prepare(
    `INSERT INTO variants
       (id, product_slug, name, sku, price, mrp, stock, low_stock_threshold,
        image, barcode, attributes, position)
     VALUES (?,?,?,?,?,?,0,?,?,?,?,?)`
  ).run(
    id,
    slug,
    label,
    sku,
    Math.max(0, Math.round(input.price ?? 0)),
    Math.max(0, Math.round(input.mrp ?? input.price ?? 0)),
    Math.max(0, Math.round(input.lowStockThreshold ?? 5)),
    input.image?.trim() || null,
    barcode,
    JSON.stringify(attributes),
    position
  ));

  // The opening count is put on the shelf by the inventory, so the option's
  // history starts at zero rather than at a number with nothing behind it.
  (await recordOpeningBalance(slug, Math.max(0, Math.round(input.stock ?? 0)), userId, id));

  return { ok: true, variant: (await getVariant(slug, id)) ?? undefined };
}

/**
 * Changes an option.
 *
 * The stock is not set here — it goes through the inventory, so the change
 * is written down with its reason.
 */
export async function updateVariant(
  slug: string,
  variantId: string,
  input: VariantInput,
  userId: number | null = null
): Promise<VariantResult> {
  const db = getDb();

  const existing = (await db
    .prepare("SELECT * FROM variants WHERE id = ? AND product_slug = ?")
    .get(variantId, slug)) as Row | undefined;
  if (!existing) {
    return { ok: false, reason: "That option no longer exists." };
  }

  const attributes =
    input.attributes !== undefined
      ? cleanVariantAttributes(input.attributes)
      : parseJson<Record<string, string>>(existing.attributes, {});

  const label = labelFor({
    ...input,
    name: input.name ?? str(existing.name),
    attributes,
  });
  if (!label) {
    return { ok: false, reason: "Give the option a name.", field: "name" };
  }

  const key = combinationKey(attributes, label);
  if ((await combinationTaken(slug, key, variantId))) {
    return {
      ok: false,
      reason: "This product already has an option with those values.",
      field: "attributes",
    };
  }

  const wantedSku =
    input.sku !== undefined
      ? normalizeSku(input.sku ?? "") || null
      : strOrNull(existing.sku);
  if (wantedSku && (await variantSkuTaken(wantedSku, variantId))) {
    return {
      ok: false,
      reason: "Another product or option already uses that code.",
      field: "sku",
    };
  }

  const barcode =
    input.barcode !== undefined
      ? input.barcode?.trim() || null
      : strOrNull(existing.barcode);
  if (barcode && (await variantBarcodeTaken(barcode, variantId))) {
    return {
      ok: false,
      reason: "Another option already uses that barcode.",
      field: "barcode",
    };
  }

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  sets.push("name = ?");
  params.push(label);
  sets.push("attributes = ?");
  params.push(JSON.stringify(attributes));
  if (wantedSku) {
    sets.push("sku = ?");
    params.push(wantedSku);
  }
  if (input.price !== undefined) {
    sets.push("price = ?");
    params.push(Math.max(0, Math.round(input.price)));
  }
  if (input.mrp !== undefined) {
    sets.push("mrp = ?");
    params.push(Math.max(0, Math.round(input.mrp)));
  }
  if (input.lowStockThreshold !== undefined) {
    sets.push("low_stock_threshold = ?");
    params.push(Math.max(0, Math.round(input.lowStockThreshold)));
  }
  if (input.image !== undefined) {
    sets.push("image = ?");
    params.push(input.image?.trim() || null);
  }
  if (input.barcode !== undefined) {
    sets.push("barcode = ?");
    params.push(barcode);
  }

  params.push(variantId);
  (await db.prepare(`UPDATE variants SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params
  ));

  // The stock goes through the inventory, so the change is written down.
  if (input.stock !== undefined) {
    const wanted = Math.max(0, Math.round(input.stock));
    const moved = (await adjustStock({
      productSlug: slug,
      variantId,
      mode: "set",
      quantity: wanted,
      reason: "Stock set in the variation editor",
      userId,
    }));
    if (!moved.ok) return { ok: false, reason: moved.reason, field: "stock" };
  }

  return { ok: true, variant: (await getVariant(slug, variantId)) ?? undefined };
}

/**
 * Removes an option.
 *
 * An option that is in somebody's basket cannot be removed — the basket
 * would be left holding something that is not there. An option that has
 * been ordered can be: the order keeps its own copy of the name and the
 * price, so the order history is not touched.
 */
export async function deleteVariant(
  slug: string,
  variantId: string
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();

  const existing = (await db
    .prepare("SELECT id FROM variants WHERE id = ? AND product_slug = ?")
    .get(variantId, slug));
  if (!existing) {
    return { ok: false, reason: "That option no longer exists." };
  }

  const inBaskets = num(
    (
      (await db
        .prepare("SELECT COUNT(*) AS n FROM cart_items WHERE variant_id = ?")
        .get(variantId)) as { n: number }
    ).n
  );
  if (inBaskets > 0) {
    return {
      ok: false,
      reason: `This option is in ${inBaskets} shopping basket${
        inBaskets === 1 ? "" : "s"
      }. Take it out of the basket first.`,
    };
  }

  const info = (await db
    .prepare("DELETE FROM variants WHERE id = ? AND product_slug = ?")
    .run(variantId, slug));
  return info.changes > 0
    ? { ok: true }
    : { ok: false, reason: "That option no longer exists." };
}

/** One option, as the back office sees it. */
export async function getVariant(slug: string, variantId: string): Promise<Variant | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM variants WHERE id = ? AND product_slug = ?")
    .get(variantId, slug)) as Row | undefined;
  if (!row) return null;
  return {
    id: str(row.id),
    product_slug: str(row.product_slug),
    name: str(row.name),
    sku: strOrNull(row.sku),
    price: num(row.price),
    mrp: num(row.mrp),
    stock: num(row.stock),
    low_stock_threshold: num(row.low_stock_threshold),
    image: strOrNull(row.image),
    barcode: strOrNull(row.barcode),
    attributes: parseJson<Record<string, string>>(row.attributes, {}),
    position: num(row.position),
  };
}

/** Tidies an option's values: blank ones go, and only the attributes the
 * product actually has are kept. */
function cleanVariantAttributes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = String(name ?? "").trim();
    const v = String(value ?? "").trim();
    if (label && v) out[label] = v;
  }
  return out;
}

/** Turns a name into the part of an id that follows the product's slug. */
function slugifyPart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* --------------------------------------------------------------- gallery */

/** A product's photographs, in the order the back office left them. */
export async function listProductGallery(slug: string): Promise<ProductImage[]> {
  return (
    (await getDb()
      .prepare(
        "SELECT id, product_slug, path, alt, position FROM product_images WHERE product_slug = ? ORDER BY position, id"
      )
      .all(slug)) as Row[]
  ).map((r) => ({
    id: str(r.id),
    product_slug: str(r.product_slug),
    path: str(r.path),
    alt: strOrNull(r.alt),
    position: num(r.position),
  }));
}

/** Adds a photograph to a product's gallery, at the end. */
export async function addProductImage(
  slug: string,
  path: string,
  alt: string | null
): Promise<ProductImage | null> {
  const db = getDb();
  const exists = (await db
    .prepare("SELECT slug FROM products WHERE slug = ?")
    .get(slug));
  if (!exists) return null;

  const position = num(
    (
      (await db
        .prepare(
          "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM product_images WHERE product_slug = ?"
        )
        .get(slug)) as { n: number }
    ).n
  );
  const id = `${slug}::img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  (await db.prepare(
    "INSERT INTO product_images (id, product_slug, path, alt, position) VALUES (?,?,?,?,?)"
  ).run(id, slug, path, alt, position));

  // The first picture a product has is its main one, so a product that has
  // never had a photograph still has one to show.
  const count = num(
    ((await db
      .prepare("SELECT COUNT(*) n FROM product_images WHERE product_slug = ?")
      .get(slug)) as { n: number }).n
  );
  if (count === 1) {
    (await db.prepare("UPDATE products SET image = ? WHERE slug = ?").run(path, slug));
  }

  return { id, product_slug: slug, path, alt, position };
}

/**
 * Removes a photograph from a product's gallery.
 *
 * The path comes back so the file can be deleted too — but only when it is
 * one of ours. A picture that shipped with the catalogue lives in
 * public/products and is left where it is.
 */
export async function removeProductImage(
  slug: string,
  id: string
): Promise<{ removed: boolean; path?: string }> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT path FROM product_images WHERE id = ? AND product_slug = ?")
    .get(id, slug)) as Row | undefined;
  if (!row) return { removed: false };

  const path = str(row.path);
  (await db.prepare("DELETE FROM product_images WHERE id = ? AND product_slug = ?").run(
    id,
    slug
  ));

  // If the main picture was the one that went, the next one takes over.
  const product = (await db
    .prepare("SELECT image FROM products WHERE slug = ?")
    .get(slug)) as Row | undefined;
  if (product && str(product.image) === path) {
    const next = (await db
      .prepare(
        "SELECT path FROM product_images WHERE product_slug = ? ORDER BY position, id LIMIT 1"
      )
      .get(slug)) as Row | undefined;
    (await db.prepare("UPDATE products SET image = ? WHERE slug = ?").run(
      next ? str(next.path) : null,
      slug
    ));
  }

  return { removed: true, path };
}

/** Puts a product's photographs in a new order. */
export async function reorderProductImages(slug: string, ids: string[]): Promise<boolean> {
  const changed = await withTransaction(async (db) => {
    const update = db.prepare(
      "UPDATE product_images SET position = ? WHERE id = ? AND product_slug = ?"
    );
    let moved = 0;
    for (const [i, id] of ids.entries()) {
      moved += Number((await update.run(i, id, slug)).changes);
    }
    return moved;
  });
  return changed > 0;
}

/**
 * Makes one photograph the main one.
 *
 * The main photograph is what the cards, the search results and the
 * catalogue table show, so choosing it also moves it to the front of the
 * gallery.
 */
export async function setMainProductImage(slug: string, id: string): Promise<boolean> {
  const row = (await getDb()
    .prepare("SELECT path FROM product_images WHERE id = ? AND product_slug = ?")
    .get(id, slug)) as Row | undefined;
  if (!row) return false;

  const path = str(row.path);
  const others = (
    (await getDb()
      .prepare(
        "SELECT id FROM product_images WHERE product_slug = ? AND id != ? ORDER BY position, id"
      )
      .all(slug, id)) as Row[]
  ).map((r) => str(r.id));

  await withTransaction(async (db) => {
    await db.prepare("UPDATE products SET image = ? WHERE slug = ?").run(path, slug);
    const update = db.prepare(
      "UPDATE product_images SET position = ? WHERE id = ? AND product_slug = ?"
    );
    await update.run(0, id, slug);
    for (const [i, other] of others.entries()) {
      await update.run(i + 1, other, slug);
    }
  });
  return true;
}

/** Changes the text a screen reader reads for a photograph. */
export async function setProductImageAlt(
  slug: string,
  id: string,
  alt: string
): Promise<boolean> {
  const info = (await getDb()
    .prepare(
      "UPDATE product_images SET alt = ? WHERE id = ? AND product_slug = ?"
    )
    .run(alt.trim() || null, id, slug));
  return info.changes > 0;
}

/** Pulls a product out of the shop, or puts it back. */
export async function setProductListed(slug: string, listed: boolean): Promise<boolean> {
  const info = (await getDb()
    .prepare("UPDATE products SET listed = ? WHERE slug = ?")
    .run(listed ? 1 : 0, slug));
  return info.changes > 0;
}

/** Moves a product through the catalogue's workflow. */
export async function setProductStatus(
  slug: string,
  status: ProductStatus
): Promise<boolean> {
  const info = (await getDb()
    .prepare("UPDATE products SET status = ? WHERE slug = ?")
    .run(status, slug));
  return info.changes > 0;
}

/**
 * Puts a product back on sale. Publishing is more than a status change:
 * the product also has to be un-delisted, or it would stay invisible.
 */
export async function publishProduct(slug: string): Promise<boolean> {
  const info = (await getDb()
    .prepare("UPDATE products SET status = 'published', listed = 1 WHERE slug = ?")
    .run(slug));
  return info.changes > 0;
}

/** Takes a product off sale without touching its data or its history. */
export async function archiveProduct(slug: string): Promise<boolean> {
  const info = (await getDb()
    .prepare("UPDATE products SET status = 'archived' WHERE slug = ?")
    .run(slug));
  return info.changes > 0;
}

/** True when a different product is already using this SKU. */
export async function skuTakenByAnother(sku: string, exceptSlug: string): Promise<boolean> {
  const row = (await getDb()
    .prepare("SELECT slug FROM products WHERE sku = ? AND slug != ? LIMIT 1")
    .get(sku, exceptSlug));
  return Boolean(row);
}

/**
 * Copies a product and its variants.
 *
 * The copy starts as a draft: a duplicate is usually the first step towards
 * a slightly different product, and it should not go on sale before anyone
 * has looked at it. The slug and the SKU are both made unique.
 */
export async function duplicateProduct(
  slug: string
): Promise<{ ok: boolean; slug?: string; reason?: string }> {
  const db = getDb();
  const source = (await db
    .prepare("SELECT * FROM products WHERE slug = ?")
    .get(slug)) as Row | undefined;
  if (!source) return { ok: false, reason: "That product no longer exists." };

  const slugTaken = async (candidate: string) =>
    Boolean(
      (await db.prepare("SELECT slug FROM products WHERE slug = ? LIMIT 1").get(candidate))
    );

  const baseSlug = `${slug}-copy`;
  let newSlug = baseSlug;
  let n = 2;
  while (await slugTaken(newSlug)) {
    newSlug = `${baseSlug}-${n}`;
    n++;
  }

  const baseSku = `${normalizeSku(str(source.sku) || slug)}-COPY`;
  const newSku = (await uniqueSku(baseSku, async (candidate) => (await skuTakenByAnother(candidate, newSlug))));

  const position = num(
    (
      (await db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM products").get()) as {
        n: number;
      }
    ).n
  );

  await withTransaction(async (db) => {
    await db.prepare(
      `INSERT INTO products
         (slug, sku, name, brand, category_slug, subcategory, model_number,
          price, mrp, sale_price, purchase_cost, rating, reviews, stock, condition,
          badge, short_desc, description, specs, image, image_alt,
          seo_title, meta_description, weight_grams,
          package_length, package_width, package_height, warranty, returns,
          listed, status, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?)`
    ).run(
      newSlug,
      newSku,
      `${str(source.name)} (copy)`,
      strOrNull(source.brand),
      strOrNull(source.category_slug),
      strOrNull(source.subcategory),
      strOrNull(source.model_number),
      num(source.price),
      num(source.mrp),
      source.sale_price === null ? null : num(source.sale_price),
      source.purchase_cost === null ? null : num(source.purchase_cost),
      num(source.rating),
      num(source.reviews),
      str(source.condition) || "new",
      strOrNull(source.badge),
      strOrNull(source.short_desc),
      strOrNull(source.description),
      str(source.specs) || "{}",
      strOrNull(source.image),
      strOrNull(source.image_alt),
      strOrNull(source.seo_title),
      strOrNull(source.meta_description),
      source.weight_grams === null ? null : num(source.weight_grams),
      source.package_length === null ? null : num(source.package_length),
      source.package_width === null ? null : num(source.package_width),
      source.package_height === null ? null : num(source.package_height),
      strOrNull(source.warranty),
      strOrNull(source.returns),
      1,
      position
    );

    const variants = (await db
      .prepare("SELECT * FROM variants WHERE product_slug = ? ORDER BY position")
      .all(slug)) as Row[];
    const insVariant = db.prepare(
      `INSERT INTO variants
         (id, product_slug, name, sku, price, mrp, stock, low_stock_threshold,
          image, barcode, attributes, position)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    );
    const copiedVariants: { id: string; stock: number }[] = [];
    for (const v of variants) {
      const id = `${newSlug}::${str(v.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;

      // The copy's options need codes and barcodes of their own — they are
      // different things, even if they look the same.
      const copiedSku = (await uniqueSku(
        `${normalizeSku(str(v.sku) || `${newSlug}-${str(v.name)}`)}-COPY`,
        async (candidate) => (await variantSkuTaken(candidate, null))
      ));

      await insVariant.run(
        id,
        newSlug,
        str(v.name),
        copiedSku,
        num(v.price),
        num(v.mrp),
        num(v.low_stock_threshold),
        strOrNull(v.image),
        null,
        str(v.attributes) || "{}",
        num(v.position)
      );
      copiedVariants.push({ id, stock: num(v.stock) });
    }

    // The stock comes with it, as an opening balance — so the copy's
    // history starts at zero, like any other product's.
    if (copiedVariants.length === 0) {
      (await recordOpeningBalance(newSlug, num(source.stock), null));
    } else {
      for (const v of copiedVariants) {
        (await recordOpeningBalance(newSlug, v.stock, null, v.id));
      }
    }

    // The photographs come with it, so the copy looks like the original.
    const images = (await db
      .prepare(
        "SELECT path, alt, position FROM product_images WHERE product_slug = ? ORDER BY position"
      )
      .all(slug)) as Row[];
    const insImage = db.prepare(
      `INSERT INTO product_images (id, product_slug, path, alt, position)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const img of images) {
      await insImage.run(
        `${newSlug}::img-${num(img.position)}`,
        newSlug,
        str(img.path),
        strOrNull(img.alt),
        num(img.position)
      );
    }
  });

  return { ok: true, slug: newSlug };
}

/** What a bulk action does. All three are safe and reversible. */
export type BulkProductAction = "publish" | "delist" | "archive";

export const BULK_PRODUCT_ACTIONS: BulkProductAction[] = [
  "publish",
  "delist",
  "archive",
];

/**
 * Applies one action to several products at once.
 *
 * There is no bulk delete: deleting is the last resort and each product
 * needs its own look first.
 */
export async function bulkUpdateProducts(
  slugs: string[],
  action: BulkProductAction
): Promise<{ changed: number; missing: string[] }> {
  const sql =
    action === "publish"
      ? "UPDATE products SET status = 'published', listed = 1 WHERE slug = ?"
      : action === "delist"
        ? "UPDATE products SET listed = 0 WHERE slug = ?"
        : "UPDATE products SET status = 'archived' WHERE slug = ?";

  const result = await withTransaction(async (db) => {
    const update = db.prepare(sql);
    const exists = db.prepare("SELECT slug FROM products WHERE slug = ?");
    let moved = 0;
    const gone: string[] = [];
    for (const slug of slugs) {
      if (!(await exists.get(slug))) {
        gone.push(slug);
        continue;
      }
      moved += Number((await update.run(slug)).changes);
    }
    return { moved, gone };
  });

  return { changed: result.moved, missing: result.gone };
}

/** What still points at a product. */
export type ProductReferences = {
  orderItems: number;
  cartItems: number;
  variants: number;
};

export async function productReferences(slug: string): Promise<ProductReferences> {
  const db = getDb();
  const count = async (sql: string) =>
    num(((await db.prepare(sql).get(slug)) as Row | undefined)?.n);
  return {
    orderItems: await count(
      "SELECT COUNT(*) n FROM order_items WHERE product_slug = ?"
    ),
    cartItems: await count("SELECT COUNT(*) n FROM cart_items WHERE product_slug = ?"),
    variants: await count("SELECT COUNT(*) n FROM variants WHERE product_slug = ?"),
  };
}

/**
 * Removes the files behind a product's uploaded photographs.
 *
 * Only photographs the back office uploaded are deleted. One that came with
 * the catalogue lives in public/products and stays where it is.
 */
function removeUploadedFiles(paths: string[], slug: string) {
  for (const path of paths) {
    // Only the product's own photographs go. A copy carries the original's
    // pictures — their paths are the original's — and deleting the copy
    // must not take them off the shelf.
    if (!isOwnUpload(path, slug)) continue;
    try {
      unlinkSync(join(process.cwd(), "public", path));
    } catch {
      // A file that has already gone is not a problem.
    }
  }
}

/**
 * Removes a product for good.
 *
 * Deleting is the last resort — archiving takes a product off sale and
 * keeps everything about it. A product that has been ordered cannot be
 * deleted at all: the order lines reference it, and removing it would leave
 * orders pointing at a product that no longer exists.
 */
export async function deleteProduct(
  slug: string
): Promise<{ deleted: boolean; reason?: string }> {
  const refs = (await productReferences(slug));

  if (refs.orderItems > 0) {
    return {
      deleted: false,
      reason: `This product is on ${refs.orderItems} order line${
        refs.orderItems === 1 ? "" : "s"
      }. Archive it instead of deleting it.`,
    };
  }
  if (refs.cartItems > 0) {
    return {
      deleted: false,
      reason: `This product is in ${refs.cartItems} shopping basket${
        refs.cartItems === 1 ? "" : "s"
      }. Archive it instead of deleting it.`,
    };
  }

  const db = getDb();
  const uploads = (
    (await db
      .prepare("SELECT path FROM product_images WHERE product_slug = ?")
      .all(slug)) as Row[]
  ).map((r) => str(r.path));

  const info = (await db.prepare("DELETE FROM products WHERE slug = ?").run(slug));
  if (!info.changes) return { deleted: false, reason: "That product no longer exists." };

  removeUploadedFiles(uploads, slug);
  return { deleted: true };
}

export type ProductPatch = {
  name?: string;
  price?: number;
  mrp?: number;
  salePrice?: number | null;
  purchaseCost?: number | null;
  badge?: string | null;
  shortDesc?: string | null;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  categorySlug?: string | null;
  subcategory?: string | null;
  modelNumber?: string | null;
  condition?: ProductCondition;
  specs?: Record<string, string>;
  image?: string | null;
  imageAlt?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  weightGrams?: number | null;
  packageLength?: number | null;
  packageWidth?: number | null;
  packageHeight?: number | null;
  warranty?: string | null;
  returns?: string | null;
};

/**
 * Edits a product.
 *
 * The stock is not one of the fields: a stock level is only ever changed
 * through the inventory, so that every change is written down. `stock` and
 * `lowStockThreshold` are set by `src/lib/inventory.ts` instead.
 */
export async function updateProduct(slug: string, patch: ProductPatch): Promise<boolean> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name.trim());
  }
  if (patch.price !== undefined) {
    sets.push("price = ?");
    params.push(patch.price);
  }
  if (patch.mrp !== undefined) {
    sets.push("mrp = ?");
    params.push(patch.mrp);
  }
  if (patch.salePrice !== undefined) {
    sets.push("sale_price = ?");
    params.push(patch.salePrice);
  }
  if (patch.purchaseCost !== undefined) {
    sets.push("purchase_cost = ?");
    params.push(patch.purchaseCost);
  }
  if (patch.badge !== undefined) {
    sets.push("badge = ?");
    params.push(patch.badge?.trim() || null);
  }
  if (patch.shortDesc !== undefined) {
    sets.push("short_desc = ?");
    params.push(patch.shortDesc?.trim() || null);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(patch.description?.trim() || null);
  }
  if (patch.brand !== undefined) {
    sets.push("brand = ?");
    params.push(patch.brand?.trim() || null);
  }
  if (patch.sku !== undefined) {
    sets.push("sku = ?");
    params.push(patch.sku?.trim() || null);
  }
  if (patch.categorySlug !== undefined) {
    sets.push("category_slug = ?");
    params.push(patch.categorySlug?.trim() || null);
  }
  if (patch.subcategory !== undefined) {
    sets.push("subcategory = ?");
    params.push(patch.subcategory?.trim() || null);
  }
  if (patch.modelNumber !== undefined) {
    sets.push("model_number = ?");
    params.push(patch.modelNumber?.trim() || null);
  }
  if (patch.condition !== undefined) {
    sets.push("condition = ?");
    params.push(patch.condition);
  }
  if (patch.specs !== undefined) {
    sets.push("specs = ?");
    params.push(JSON.stringify(patch.specs));
  }
  if (patch.image !== undefined) {
    sets.push("image = ?");
    params.push(patch.image?.trim() || null);
  }
  if (patch.imageAlt !== undefined) {
    sets.push("image_alt = ?");
    params.push(patch.imageAlt?.trim() || null);
  }
  if (patch.seoTitle !== undefined) {
    sets.push("seo_title = ?");
    params.push(patch.seoTitle?.trim() || null);
  }
  if (patch.metaDescription !== undefined) {
    sets.push("meta_description = ?");
    params.push(patch.metaDescription?.trim() || null);
  }
  if (patch.weightGrams !== undefined) {
    sets.push("weight_grams = ?");
    params.push(patch.weightGrams);
  }
  if (patch.packageLength !== undefined) {
    sets.push("package_length = ?");
    params.push(patch.packageLength);
  }
  if (patch.packageWidth !== undefined) {
    sets.push("package_width = ?");
    params.push(patch.packageWidth);
  }
  if (patch.packageHeight !== undefined) {
    sets.push("package_height = ?");
    params.push(patch.packageHeight);
  }
  if (patch.warranty !== undefined) {
    sets.push("warranty = ?");
    params.push(patch.warranty?.trim() || null);
  }
  if (patch.returns !== undefined) {
    sets.push("returns = ?");
    params.push(patch.returns?.trim() || null);
  }

  if (!sets.length) return false;

  params.push(slug);
  const info = (await getDb()
    .prepare(`UPDATE products SET ${sets.join(", ")} WHERE slug = ?`)
    .run(...params));
  return info.changes > 0;
}

