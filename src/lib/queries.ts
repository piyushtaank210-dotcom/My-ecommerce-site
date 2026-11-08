import { getDb, parseJson } from "./db";
import { parseProductStatus, type ProductStatus } from "./product-status";
import { parseProductCondition } from "./types";
import type {
  Brand,
  Category,
  GalleryImage,
  HeroSlide,
  Product,
  ProductWithVariants,
  SortKey,
  Subcategory,
  Variant,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

function mapCategory(r: Row): Category {
  return {
    slug: str(r.slug),
    name: str(r.name),
    icon: strOrNull(r.icon),
    blurb: strOrNull(r.blurb),
    spec_fields: parseJson<string[]>(r.spec_fields, []),
    position: num(r.position),
  };
}

/** Turns a product row into a product. Shared, so every reader agrees. */
export function mapProduct(r: Row): Product {
  return {
    slug: str(r.slug),
    sku: strOrNull(r.sku),
    name: str(r.name),
    brand: strOrNull(r.brand),
    category_slug: strOrNull(r.category_slug),
    subcategory: strOrNull(r.subcategory),
    model_number: strOrNull(r.model_number),
    price: num(r.price),
    mrp: num(r.mrp),
    sale_price: r.sale_price === null ? null : num(r.sale_price),
    purchase_cost: r.purchase_cost === null ? null : num(r.purchase_cost),
    rating: num(r.rating),
    reviews: num(r.reviews),
    stock: num(r.stock),
    low_stock_threshold: num(r.low_stock_threshold),
    /** The stock the shop can really sell â€” the options' added up. */
    sellable_stock:
      r.sellable_stock === undefined ? num(r.stock) : num(r.sellable_stock),
    /** How many options this product has. */
    option_count: num(r.option_count),
    condition: parseProductCondition(r.condition),
    badge: strOrNull(r.badge),
    short_desc: strOrNull(r.short_desc),
    description: strOrNull(r.description),
    specs: parseJson<Record<string, string>>(r.specs, {}),
    attributes: parseJson<Record<string, string[]>>(r.attributes, {}),
    image: strOrNull(r.image),
    image_alt: strOrNull(r.image_alt),
    seo_title: strOrNull(r.seo_title),
    meta_description: strOrNull(r.meta_description),
    weight_grams: r.weight_grams === null ? null : num(r.weight_grams),
    package_length: r.package_length === null ? null : num(r.package_length),
    package_width: r.package_width === null ? null : num(r.package_width),
    package_height: r.package_height === null ? null : num(r.package_height),
    warranty: strOrNull(r.warranty),
    returns: strOrNull(r.returns),
    listed: num(r.listed) !== 0,
    status: parseProductStatus(r.status),
    position: num(r.position),
  };
}

function mapVariant(r: Row): Variant {
  return {
    id: str(r.id),
    product_slug: str(r.product_slug),
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
  };
}

function mapHeroSlide(r: Row): HeroSlide {
  const link = (label: unknown, href: unknown): HeroSlide["primary"] =>
    strOrNull(label) && strOrNull(href) ? { label: str(label), href: str(href) } : null;

  return {
    id: str(r.id),
    image: str(r.image),
    video: strOrNull(r.video),
    video_poster: strOrNull(r.video_poster),
    alt: str(r.alt),
    image_position: str(r.image_position) || "50% 50%",
    eyebrow: strOrNull(r.eyebrow),
    title: str(r.title),
    body: strOrNull(r.body),
    primary: link(r.primary_label, r.primary_href),
    secondary: link(r.secondary_label, r.secondary_href),
    note: strOrNull(r.note),
    side: str(r.side) === "right" ? "right" : "left",
    position: num(r.position),
  };
}

/* ----------------------------------------------------------------- queries */

export async function getHeroSlides(): Promise<HeroSlide[]> {
  return (
    (await getDb().prepare("SELECT * FROM hero_slides ORDER BY position").all()) as Row[]
  ).map(mapHeroSlide);
}

export async function getCategories(): Promise<Category[]> {
  return (
    (await getDb().prepare("SELECT * FROM categories ORDER BY position").all()) as Row[]
  ).map(mapCategory);
}

export async function getCategory(slug: string): Promise<Category | null> {
  const row = (await getDb().prepare("SELECT * FROM categories WHERE slug = ?").get(slug)) as
    | Row
    | undefined;
  return row ? mapCategory(row) : null;
}

export async function getBrands(
  categorySlug?: string,
  options: { includeUnlisted?: boolean } = {}
): Promise<string[]> {
  const db = getDb();
  // The shop only offers brands it actually has on sale; the back office
  // wants every brand in the catalogue, including archived ones.
  const visibility = options.includeUnlisted
    ? ""
    : " AND listed = 1 AND status = 'published'";
  const rows = categorySlug
    ? ((await db
        .prepare(
          `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND category_slug = ?${visibility} ORDER BY brand`
        )
        .all(categorySlug)) as Row[])
    : ((await db
        .prepare(
          `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL${visibility} ORDER BY brand`
        )
        .all()) as Row[]);
  return rows.map((r) => str(r.brand));
}

export type ProductQuery = {
  category?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  inStockOnly?: boolean;
  sort?: SortKey;
  limit?: number;
  offset?: number;
  /** The back office wants every product. The shop wants only the ones on sale. */
  includeUnlisted?: boolean;
  /** The back office filters the catalogue by workflow state. */
  status?: ProductStatus | "all" | string;
  /** The back office filters the catalogue by the older delist flag. */
  listed?: "all" | "true" | "false" | string;
  /** The back office filters the catalogue by how much stock is left. */
  stockStatus?: "all" | "in" | "low" | "out" | string;
  /**
   * Which stock number the catalogue counts.
   *
   * `product` is the product's own stock column. `sellable` is what can
   * really be bought â€” a product with variants sells through them, so their
   * stock added up is the number that matters. The back office counts on
   * `sellable` so the Stock column and the Stock filter agree with each
   * other and with the shop.
   */
  stockBasis?: "product" | "sellable";
};

/**
 * The stock a product can actually sell, as SQL.
 *
 * A product with variants sells through them, so its own stock column is
 * not what reaches a customer â€” the variants' stock added up is.
 */
const SELLABLE_STOCK_SQL = `(CASE
   WHEN EXISTS (SELECT 1 FROM variants sv WHERE sv.product_slug = p.slug)
     THEN (SELECT COALESCE(SUM(sv2.stock), 0) FROM variants sv2 WHERE sv2.product_slug = p.slug)
   ELSE p.stock END)`;

/** How many options a product has â€” zero means it is stocked as itself. */
const OPTION_COUNT_SQL = `(SELECT COUNT(*) FROM variants sv WHERE sv.product_slug = p.slug)`;

/** The two numbers, ready to be put in a SELECT list. */
export const PRODUCT_STOCK_COLUMNS_SQL = `${SELLABLE_STOCK_SQL} AS sellable_stock, ${OPTION_COUNT_SQL} AS option_count`;

/**
 * When a product counts as low.
 *
 * It counts as low when the stock it can sell has reached the product's
 * own threshold, or when one of its options has reached that option's own
 * threshold â€” an option that has run out makes the product low even when
 * the other options are still on the shelf.
 */
function lowStockSql(basis: "product" | "sellable"): string {
  if (basis === "product") return `(p.stock <= p.low_stock_threshold)`;
  return `(${SELLABLE_STOCK_SQL} <= p.low_stock_threshold
     OR EXISTS (
       SELECT 1 FROM variants v3
       WHERE v3.product_slug = p.slug AND v3.stock <= v3.low_stock_threshold
     ))`;
}

/** The level of a product â€” out, low or in â€” as SQL. */
function stockLevelSql(basis: "product" | "sellable"): string {
  const stock = basis === "sellable" ? SELLABLE_STOCK_SQL : "p.stock";
  return `(CASE
     WHEN ${stock} <= 0 THEN 'out'
     WHEN ${lowStockSql(basis)} THEN 'low'
     ELSE 'in' END)`;
}

/**
 * Units sold, counted from the order lines. Cancelled orders never earned
 * anything, so they do not count.
 */
const UNITS_SOLD_SQL = `(SELECT COALESCE(SUM(oi.quantity), 0)
   FROM order_items oi JOIN orders o ON o.id = oi.order_id
   WHERE oi.product_slug = p.slug AND o.status != 'cancelled')`;

const SORT_SQL: Record<SortKey, string> = {
  featured: "p.position ASC",
  newest: "p.position DESC",
  "price-asc": "p.price ASC",
  "price-desc": "p.price DESC",
  rating: "p.rating DESC, p.reviews DESC",
  discount: "(CAST(p.mrp - p.price AS REAL) / p.mrp) DESC",
  "best-selling": `${UNITS_SOLD_SQL} DESC, p.position ASC`,
};

/** True when the store has sold anything, so best-selling means something. */
export async function hasSalesData(): Promise<boolean> {
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) n FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'`
    )
    .get()) as Row | undefined;
  return num(row?.n) > 0;
}

/** The filters the catalogue can be narrowed by. Each one can be left out. */
type Facet = "category" | "brand" | "stock" | "status" | "listed";

function buildWhere(query: ProductQuery, omit?: Facet) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.category && omit !== "category") {
    where.push("p.category_slug = ?");
    params.push(query.category);
  }
  if (query.brands?.length && omit !== "brand") {
    where.push(`p.brand IN (${query.brands.map(() => "?").join(",")})`);
    params.push(...query.brands);
  }
  if (typeof query.minPrice === "number") {
    where.push("p.price >= ?");
    params.push(query.minPrice);
  }
  if (typeof query.maxPrice === "number") {
    where.push("p.price <= ?");
    params.push(query.maxPrice);
  }
  if (query.q) {
    const like = `%${query.q}%`;
    where.push(
      "(p.name LIKE ? OR p.brand LIKE ? OR p.short_desc LIKE ? OR p.sku LIKE ?)"
    );
    params.push(like, like, like, like);
  }
  if (query.inStockOnly) where.push(`${SELLABLE_STOCK_SQL} > 0`);
  // The shop shows a product only when it is published and not delisted.
  // The back office asks for everything, and filters it itself.
  if (!query.includeUnlisted) {
    where.push("p.listed = 1");
    where.push("p.status = 'published'");
  }
  if (query.status && query.status !== "all" && omit !== "status") {
    where.push("p.status = ?");
    params.push(query.status);
  }
  if (omit !== "listed") {
    if (query.listed === "true") where.push("p.listed = 1");
    else if (query.listed === "false") where.push("p.listed = 0");
  }

  if (omit !== "stock") {
    const basis = query.stockBasis === "sellable" ? "sellable" : "product";
    const stock = basis === "sellable" ? SELLABLE_STOCK_SQL : "p.stock";
    if (query.stockStatus === "in") {
      where.push(`${stock} > 0 AND NOT ${lowStockSql(basis)}`);
    } else if (query.stockStatus === "low") {
      where.push(`${stock} > 0 AND ${lowStockSql(basis)}`);
    } else if (query.stockStatus === "out") {
      where.push(`${stock} <= 0`);
    }
  }

  return { where, params };
}

export async function getProducts(query: ProductQuery = {}): Promise<Product[]> {
  const db = getDb();
  const { where, params } = buildWhere(query);
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
    (await db
      .prepare(
        `SELECT p.*, ${PRODUCT_STOCK_COLUMNS_SQL} FROM products p
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY ${SORT_SQL[query.sort ?? "featured"] ?? SORT_SQL.featured} ${limit} ${offset}`
      )
      .all(...bind)) as Row[]
  ).map(mapProduct);
}

export async function countProducts(query: ProductQuery = {}): Promise<number> {
  const db = getDb();
  const { where, params } = buildWhere(query);
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM products p ${
        where.length ? `WHERE ${where.join(" AND ")}` : ""
      }`
    )
    .get(...params)) as Row | undefined;
  return num(row?.n);
}

/** How many products each filter would leave. */
export type CatalogueFacets = {
  category: { total: number; counts: Record<string, number> };
  brand: { total: number; counts: Record<string, number> };
  stock: { total: number; counts: { in: number; low: number; out: number } };
  status: { total: number; counts: Record<string, number> };
  listed: { total: number; counts: { listed: number; delisted: number } };
};

/**
 * The counts shown beside the catalogue's filters.
 *
 * Each facet is counted with the *other* filters applied but its own left
 * out, so the number beside an option answers the question the admin is
 * really asking: "if I pick this, how many will I be left with?". The
 * `total` on each facet is the "All â€¦" option â€” everything that matches
 * once that filter is taken away.
 */
export async function catalogueFacets(query: ProductQuery = {}): Promise<CatalogueFacets> {
  const db = getDb();
  const base: ProductQuery = {
    ...query,
    includeUnlisted: true,
    sort: undefined,
    limit: undefined,
    offset: undefined,
  };

  const group = async (omit: Facet, key: string) => {
    const { where, params } = buildWhere(base, omit);
    const rows = (await db
      .prepare(
        `SELECT ${key} AS k, COUNT(*) AS n FROM products p
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         GROUP BY k`
      )
      .all(...params)) as Row[];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      if (r.k === null || r.k === undefined) continue;
      counts[String(r.k)] = num(r.n);
      total += num(r.n);
    }
    return { total, counts };
  };

  const basis = base.stockBasis === "sellable" ? "sellable" : "product";
  // The five counts are asked for together: the database is a long way off,
  // and asking one at a time makes the page as slow as the sum of them.
  const [stockGroups, category, brand, status, listed] = await Promise.all([
    group("stock", stockLevelSql(basis)),
    group("category", "p.category_slug"),
    group("brand", "p.brand"),
    group("status", "p.status"),
    group("listed", "p.listed"),
  ]);

  return {
    category,
    brand,
    status,
    stock: {
      total: stockGroups.total,
      counts: {
        in: stockGroups.counts.in ?? 0,
        low: stockGroups.counts.low ?? 0,
        out: stockGroups.counts.out ?? 0,
      },
    },
    listed: {
      total: listed.total,
      counts: {
        listed: listed.counts["1"] ?? 0,
        delisted: listed.counts["0"] ?? 0,
      },
    },
  };
}

export async function getProduct(slug: string): Promise<ProductWithVariants | null> {
  const db = getDb();
  // The product and its options are asked for together: the database is a
  // long way off, and asking one at a time makes the page as slow as the
  // sum of them.
  const [row, variantRows] = await Promise.all([
    db
      .prepare(`SELECT p.*, ${PRODUCT_STOCK_COLUMNS_SQL} FROM products p WHERE p.slug = ?`)
      .get(slug) as Promise<Row | undefined>,
    db
      .prepare("SELECT * FROM variants WHERE product_slug = ? ORDER BY position")
      .all(slug) as Promise<Row[]>,
  ]);
  if (!row) return null;
  const variants = variantRows.map(mapVariant);
  return { ...mapProduct(row), variants };
}

/**
 * The photographs of a product, in the order the back office left them.
 *
 * The first one is the main photograph â€” the one the cards and the catalogue
 * table show. A product with no pictures of its own falls back to the
 * picture it carries.
 */
export async function getProductImages(slug: string): Promise<GalleryImage[]> {
  const rows = (await getDb()
    .prepare(
      "SELECT path, alt FROM product_images WHERE product_slug = ? ORDER BY position, id"
    )
    .all(slug)) as Row[];
  return rows.map((r) => ({
    src: str(r.path),
    alt: strOrNull(r.alt) ?? "",
  }));
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  return (
    (await getDb()
      .prepare(
        `SELECT p.* FROM products p
         WHERE p.slug != ? AND p.category_slug IS ? AND p.listed = 1
           AND p.status = 'published'
         ORDER BY p.rating DESC LIMIT ?`
      )
      .all(product.slug, product.category_slug, limit)) as Row[]
  ).map(mapProduct);
}

export async function getDiscountedProducts(limit = 8): Promise<Product[]> {
  return (await getProducts({ sort: "discount", limit }));
}
