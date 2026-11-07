"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "./db";
import {
  archiveProduct,
  BULK_PRODUCT_ACTIONS,
  bulkUpdateProducts,
  catalogueQuery,
  createProduct,
  deleteProduct,
  duplicateProduct,
  publishProduct,
  setProductListed,
  setProductStatus,
  skuTakenByAnother,
  updateProduct,
  type BulkProductAction,
} from "./admin";
import { setUserRole, updateUserPassword } from "./auth";
import { requirePermission, requireUser } from "./guard";
import { can } from "./roles";
import { MESSAGE_STATUSES, type MessageStatus } from "./contact";
import { applyOrderStatus, ORDER_STATUSES, type OrderStatus } from "./orders";
import {
  adjustStock,
  resolveStockCheck,
  setLowStockThreshold,
} from "./inventory";
import { ensureBrand, resolveSubcategory } from "./taxonomy-admin";
import {
  PRODUCT_STATUSES,
  parseProductStatus,
  type ProductStatus,
} from "./product-status";
import { normalizeSku, skuFromSlug, uniqueSku } from "./sku";
import { getProducts } from "./queries";
import type { CatalogueFilters } from "./types";

export type PanelState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Where the change landed, when there is somewhere to go. */
  href?: string;
};

const empty: PanelState = { ok: false };

/* --------------------------------------------------------------- products */

/**
 * The number fields on the product form.
 *
 * A blank box means "not filled in", not zero, so an empty value is turned
 * into nothing before the number is read. A number that is not a number is
 * left alone, and the message below says what is wrong with it.
 */
const blankToNothing = (v: unknown) =>
  v === null || v === undefined || String(v).trim() === "" ? undefined : v;

const money = (label: string) =>
  z.preprocess(
    blankToNothing,
    z.coerce
      .number({ error: `Enter the ${label}.` })
      .int(`${label} must be a whole number of rupees.`)
      .min(0, `${label} cannot be negative.`)
  );

const optionalMoney = (label: string) =>
  z.preprocess(
    blankToNothing,
    z.coerce
      .number({ error: `Enter the ${label} as a number.` })
      .int(`${label} must be a whole number of rupees.`)
      .min(0, `${label} cannot be negative.`)
      .optional()
  );

const optionalCount = (label: string) =>
  z.preprocess(
    blankToNothing,
    z.coerce
      .number({ error: `Enter the ${label} as a number.` })
      .int(`${label} must be a whole number.`)
      .min(0, `${label} cannot be negative.`)
      .optional()
  );

const productSchema = z
  .object({
    slug: z.string().trim().min(2, "Give the product an address."),
    name: z.string().trim().min(2, "Give the product a name."),
    brand: z.string().trim().optional(),
    category: z.string().trim().min(1, "Pick a category."),
    subcategory: z.string().trim().optional(),
    modelNumber: z.string().trim().optional(),
    sku: z.string().trim().optional(),
    condition: z.enum(["new", "open-box", "refurbished"], {
      error: "Pick a condition.",
    }),
    shortDesc: z.string().trim().optional(),
    description: z.string().trim().optional(),
    price: money("selling price"),
    mrp: money("MRP"),
    salePrice: optionalMoney("sale price"),
    purchaseCost: optionalMoney("purchase cost"),
    stock: money("stock"),
    lowStockThreshold: z.preprocess(
      blankToNothing,
      z.coerce
        .number({ error: "Enter the low-stock threshold." })
        .int("The low-stock threshold must be a whole number.")
        .min(0, "The low-stock threshold cannot be negative.")
        .optional()
    ),
    badge: z.string().trim().optional(),
    weightGrams: optionalCount("weight"),
    packageLength: optionalCount("package length"),
    packageWidth: optionalCount("package width"),
    packageHeight: optionalCount("package height"),
    warranty: z.string().trim().optional(),
    returns: z.string().trim().optional(),
    seoTitle: z
      .string()
      .trim()
      .max(70, "Keep the SEO title under 70 characters.")
      .optional(),
    metaDescription: z
      .string()
      .trim()
      .max(160, "Keep the meta description under 160 characters.")
      .optional(),
    imageAlt: z.string().trim().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mrp < d.price) {
      ctx.addIssue({
        code: "custom",
        path: ["mrp"],
        message: "The MRP cannot be lower than the selling price.",
      });
    }
    if (d.salePrice !== undefined && d.salePrice > d.mrp) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "The sale price cannot be above the MRP.",
      });
    }
    if (d.salePrice !== undefined && d.salePrice > d.price) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "The sale price cannot be above the selling price.",
      });
    }
  });

/**
 * The specifications on the form.
 *
 * They arrive in two lists: the category's own fields, whose names the
 * category carries, and the free-form table, where the administrator
 * writes the name of each one. A row with no name is dropped — a blank
 * line in a specification table is not a specification — and so is a row
 * with nothing in it, because a field nobody has answered is not a
 * specification either.
 */
function readSpecs(formData: FormData): Record<string, string> {
  const specs: Record<string, string> = {};

  const labels = formData.getAll("specLabel").map((v) => String(v).trim());
  const values = formData.getAll("specValue").map((v) => String(v).trim());
  labels.forEach((label, i) => {
    if (!label) return;
    const value = values[i] ?? "";
    if (!value) return;
    specs[label] = value;
  });

  const categoryLabels = formData
    .getAll("categorySpecLabel")
    .map((v) => String(v).trim());
  const categoryValues = formData
    .getAll("categorySpecValue")
    .map((v) => String(v).trim());
  categoryLabels.forEach((label, i) => {
    if (!label) return;
    const value = categoryValues[i] ?? "";
    if (!value) return;
    specs[label] = value;
  });

  return specs;
}

export async function saveProductAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  const parsed = productSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    brand: formData.get("brand") ?? undefined,
    category: formData.get("category"),
    subcategory: formData.get("subcategory") ?? undefined,
    modelNumber: formData.get("modelNumber") ?? undefined,
    sku: formData.get("sku") ?? undefined,
    condition: formData.get("condition") ?? "new",
    shortDesc: formData.get("shortDesc") ?? undefined,
    description: formData.get("description") ?? undefined,
    price: formData.get("price"),
    mrp: formData.get("mrp"),
    salePrice: formData.get("salePrice") ?? undefined,
    purchaseCost: formData.get("purchaseCost") ?? undefined,
    stock: formData.get("stock"),
    lowStockThreshold: formData.get("lowStockThreshold") ?? undefined,
    badge: formData.get("badge") ?? undefined,
    weightGrams: formData.get("weightGrams") ?? undefined,
    packageLength: formData.get("packageLength") ?? undefined,
    packageWidth: formData.get("packageWidth") ?? undefined,
    packageHeight: formData.get("packageHeight") ?? undefined,
    warranty: formData.get("warranty") ?? undefined,
    returns: formData.get("returns") ?? undefined,
    seoTitle: formData.get("seoTitle") ?? undefined,
    metaDescription: formData.get("metaDescription") ?? undefined,
    imageAlt: formData.get("imageAlt") ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const d = parsed.data;
  const slug = d.slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT p.slug, p.stock,
              (SELECT COUNT(*) FROM variants v WHERE v.product_slug = p.slug) AS option_count
       FROM products p WHERE p.slug = ?`
    )
    .get(slug) as
    | { slug?: string; stock?: number; option_count?: number }
    | undefined;

  const specs = readSpecs(formData);

  // The subcategory and the brand are kept in lists the back office
  // manages. A name the administrator typed that is not in the list yet is
  // added to it, so the list never falls behind the catalogue.
  const subcategory = resolveSubcategory(d.category, d.subcategory);
  const brand = ensureBrand(d.brand);

  // The purchase cost is what the store paid for the thing. Only an
  // administrator ever sets it, and nobody else can read it.
  const purchaseCost =
    user.role === "admin" ? (d.purchaseCost ?? null) : undefined;

  if (existing) {
    // The SKU. Left blank, it is generated from the slug; typed in, it is
    // normalised and checked against every other product.
    let sku = normalizeSku(d.sku ?? "");
    if (sku && skuTakenByAnother(sku, slug)) {
      return {
        ok: false,
        errors: { sku: "Another product already uses this SKU." },
        message: "That SKU is already taken.",
      };
    }
    if (!sku) {
      sku = uniqueSku(skuFromSlug(slug), (candidate) =>
        skuTakenByAnother(candidate, slug)
      );
    }

    updateProduct(slug, {
      name: d.name,
      brand: brand || null,
      subcategory: subcategory || null,
      modelNumber: d.modelNumber || null,
      price: d.price,
      mrp: d.mrp,
      salePrice: d.salePrice ?? null,
      purchaseCost,
      condition: d.condition,
      badge: d.badge || null,
      shortDesc: d.shortDesc || null,
      description: d.description || null,
      specs,
      sku,
      categorySlug: d.category,
      imageAlt: d.imageAlt || null,
      seoTitle: d.seoTitle || null,
      metaDescription: d.metaDescription || null,
      weightGrams: d.weightGrams ?? null,
      packageLength: d.packageLength ?? null,
      packageWidth: d.packageWidth ?? null,
      packageHeight: d.packageHeight ?? null,
      warranty: d.warranty || null,
      returns: d.returns || null,
    });

    // A product with options is stocked by its options, each counted
    // separately, so its own count is left alone here. The options are
    // managed on the inventory page.
    const hasOptions = (existing.option_count ?? 0) > 0;
    if (!hasOptions && d.stock !== (existing.stock ?? 0)) {
      const moved = adjustStock({
        productSlug: slug,
        variantId: null,
        mode: "set",
        quantity: d.stock,
        reason: "Stock set in the product editor",
        userId: user.id,
      });
      if (!moved.ok) {
        return {
          ok: false,
          errors: { stock: moved.reason },
          message: moved.reason,
        };
      }
    }
  } else {
    const created = createProduct({
      slug,
      name: d.name,
      brand: brand || null,
      subcategory: subcategory || null,
      modelNumber: d.modelNumber || null,
      categorySlug: d.category,
      condition: d.condition,
      price: d.price,
      mrp: d.mrp,
      salePrice: d.salePrice ?? null,
      purchaseCost: purchaseCost ?? null,
      stock: d.stock,
      userId: user.id,
      badge: d.badge || null,
      shortDesc: d.shortDesc || null,
      description: d.description || null,
      specs,
      sku: d.sku || null,
      imageAlt: d.imageAlt || null,
      seoTitle: d.seoTitle || null,
      metaDescription: d.metaDescription || null,
      weightGrams: d.weightGrams ?? null,
      packageLength: d.packageLength ?? null,
      packageWidth: d.packageWidth ?? null,
      packageHeight: d.packageHeight ?? null,
      warranty: d.warranty || null,
      returns: d.returns || null,
    });

    if (!created.ok) {
      return {
        ok: false,
        errors: created.field ? { [created.field]: created.reason ?? "" } : {},
        message: created.reason ?? "The product could not be created.",
      };
    }
  }

  // The number at or below which this counts as low. It changes no stock,
  // so it writes no history.
  if (d.lowStockThreshold !== undefined) {
    setLowStockThreshold(slug, null, d.lowStockThreshold);
  }

  // What the form asked for. "draft" keeps it off the shop, "publish" puts
  // it on sale, and "keep" leaves the product where it was.
  const intent = String(formData.get("intent") ?? "").trim();
  if (intent === "draft") {
    setProductStatus(slug, "draft");
  } else if (intent === "publish") {
    publishProduct(slug);
  } else if (!existing) {
    // A brand new product with no instruction is a draft until somebody
    // says otherwise.
    setProductStatus(slug, "draft");
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${slug}`);

  const published = intent === "publish";
  return {
    ok: true,
    message: existing
      ? published
        ? "Product updated and published."
        : intent === "draft"
          ? "Product updated and kept as a draft."
          : "Product updated."
      : published
        ? "Product created and published."
        : "Product created as a draft.",
    href: `/admin/products/${slug}`,
  };
}

export async function toggleProductListingAction(
  slug: string,
  listed: boolean
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  setProductListed(slug, listed);
  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  return {
    ok: true,
    message: listed ? "Product is back in the shop." : "Product delisted.",
  };
}

/**
 * Moves a product through the catalogue's workflow.
 *
 * Publishing also un-delists it, because a product that is published but
 * still switched off would stay invisible and the change would look like it
 * had done nothing.
 */
export async function setProductStatusAction(
  slug: string,
  status: string
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  const next = parseProductStatus(status);
  if (!(PRODUCT_STATUSES as readonly string[]).includes(next)) {
    return { ok: false, message: "That is not a status the catalogue knows." };
  }

  if (next === "published") {
    publishProduct(slug);
  } else {
    setProductStatus(slug, next as ProductStatus);
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${slug}`);
  return { ok: true, message: `Product is now ${next}.` };
}

/**
 * Takes a product off sale.
 *
 * Archiving is the default way to retire a product: it hides it from the
 * shop but keeps its data, its stock and its order history, and it can be
 * undone at any time.
 */
export async function archiveProductAction(
  slug: string
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  if (!archiveProduct(slug)) {
    return { ok: false, message: "That product no longer exists." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${slug}`);
  return {
    ok: true,
    message: "Product archived. It is off sale and can be restored.",
  };
}

/** Puts an archived product back on sale. */
export async function restoreProductAction(
  slug: string
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  if (!publishProduct(slug)) {
    return { ok: false, message: "That product no longer exists." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${slug}`);
  return { ok: true, message: "Product is back on sale." };
}

/**
 * Copies a product and its variants.
 *
 * The copy is a draft until somebody publishes it, so a duplicate never
 * sneaks into the shop unreviewed.
 */
export async function duplicateProductAction(
  slug: string
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  const result = duplicateProduct(slug);
  if (!result.ok) {
    return { ok: false, message: result.reason ?? "That product could not be copied." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${result.slug}`);
  return {
    ok: true,
    message: "Product duplicated as a draft. Publish it when it is ready.",
    // The copy is a draft at the end of the catalogue, so it is handed back
    // to the caller rather than left to be looked for.
    href: `/admin/products/${result.slug}`,
  };
}

/**
 * Applies one action to several products at once.
 *
 * The form carries the chosen slugs and the action. There is no bulk
 * delete — each product that should go needs its own look first, and a
 * mistake here would remove order history.
 *
 * `scope` decides what the action reaches. `page` is the products that were
 * ticked. `all` is every product matching the filters the admin is looking
 * at, worked out again here on the server so the action can never reach a
 * product the admin was not looking at.
 */
export async function bulkProductAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }

  const action = String(formData.get("bulkAction") ?? "");
  if (!(BULK_PRODUCT_ACTIONS as string[]).includes(action)) {
    return { ok: false, message: "That is not an action the catalogue knows." };
  }

  const scope = String(formData.get("scope") ?? "page");
  let slugs: string[];

  if (scope === "all") {
    const filters: CatalogueFilters = {
      q: String(formData.get("q") ?? ""),
      category: String(formData.get("category") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      stock: String(formData.get("stock") ?? ""),
      status: String(formData.get("status") ?? ""),
      listed: String(formData.get("listed") ?? ""),
    };
    slugs = getProducts(catalogueQuery(filters)).map((p) => p.slug);
  } else {
    slugs = formData
      .getAll("slugs")
      .map((s) => String(s).trim())
      .filter(Boolean);
  }

  if (!slugs.length) {
    return { ok: false, message: "Choose at least one product." };
  }

  const { changed, missing } = bulkUpdateProducts(
    slugs,
    action as BulkProductAction
  );

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/category/consoles");
  revalidatePath("/category/controllers");

  const verb =
    action === "publish" ? "published" : action === "delist" ? "delisted" : "archived";
  const every =
    scope === "all"
      ? ` All ${slugs.length} product${slugs.length === 1 ? "" : "s"} matching these filters were included.`
      : "";
  return {
    ok: true,
    message: missing.length
      ? `${changed} product${changed === 1 ? "" : "s"} ${verb}. ${missing.length} could not be found.${every}`
      : `${changed} product${changed === 1 ? "" : "s"} ${verb}.${every}`,
  };
}

/**
 * Removes a product for good.
 *
 * This is deliberately hard to do and deliberately admin-only. A product
 * that has been ordered cannot be deleted — the order lines point at it —
 * and archiving is offered instead.
 */
export async function deleteProductAction(
  slug: string
): Promise<PanelState> {
  const user = await requirePermission("catalog.manage");
  if (!can(user.role, "catalog.manage")) {
    return { ok: false, message: "You cannot change the catalogue." };
  }
  if (user.role !== "admin") {
    return {
      ok: false,
      message: "Only an administrator can delete a product for good.",
    };
  }

  const result = deleteProduct(slug);
  if (!result.deleted) {
    return { ok: false, message: result.reason ?? "That product could not be deleted." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  return { ok: true, message: "Product deleted for good." };
}

/* ----------------------------------------------------------------- orders */

/**
 * Moves an order along its journey.
 *
 * The stock follows the order: cancelling gives the units back when they
 * never left, and holds them for a check when they did.
 */
export async function setOrderStatusAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("orders.update");
  if (!can(user.role, "orders.update")) {
    return { ok: false, message: "You cannot change orders." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!id || !(ORDER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Pick a valid status." };
  }

  const result = applyOrderStatus(id, status as OrderStatus, user.id);
  if (!result.ok) {
    return { ok: false, message: result.message ?? "That order could not be changed." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/account/orders");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  return { ok: true, message: `Order ${id} is now ${status}.` };
}

/* -------------------------------------------------------------- inventory */

const adjustSchema = z.object({
  productSlug: z.string().trim().min(1, "Choose a product."),
  variantId: z.string().trim().optional(),
  mode: z.enum(["set", "add", "remove"], { error: "Pick what the change is." }),
  quantity: z.coerce
    .number({ error: "Enter how many units." })
    .int("Enter a whole number of units.")
    .min(0, "Enter a whole number of units."),
  reason: z.string().trim().min(1, "Give a reason for the change."),
  note: z.string().trim().optional(),
});

/**
 * Changes a stock level by hand.
 *
 * A change without a reason is not allowed: the reason is what the history
 * is made of.
 */
export async function adjustStockAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("inventory.manage");
  if (!can(user.role, "inventory.manage")) {
    return { ok: false, message: "You cannot change stock levels." };
  }

  const parsed = adjustSchema.safeParse({
    productSlug: formData.get("productSlug"),
    variantId: formData.get("variantId") ?? undefined,
    mode: formData.get("mode"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    note: formData.get("note") ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const result = adjustStock({
    productSlug: parsed.data.productSlug,
    variantId: parsed.data.variantId || null,
    mode: parsed.data.mode,
    quantity: parsed.data.quantity,
    reason: parsed.data.reason,
    note: parsed.data.note ?? null,
    userId: user.id,
  });

  if (!result.ok) {
    return { ok: false, message: result.reason };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/", "layout");

  const verb =
    parsed.data.mode === "set"
      ? `set to ${result.stock}`
      : parsed.data.mode === "add"
        ? `increased to ${result.stock}`
        : `reduced to ${result.stock}`;
  return {
    ok: true,
    message: `Stock ${verb} (was ${result.previous}).`,
  };
}

/**
 * Sets the number at or below which a product or option counts as low.
 *
 * The threshold is not a movement — it changes no stock, so it writes no
 * history.
 */
export async function setStockThresholdAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("inventory.manage");
  if (!can(user.role, "inventory.manage")) {
    return { ok: false, message: "You cannot change stock levels." };
  }

  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const variantId = String(formData.get("variantId") ?? "").trim() || null;
  const threshold = Number(formData.get("threshold"));

  if (!productSlug) return { ok: false, message: "Choose a product." };
  if (!Number.isInteger(threshold) || threshold < 0) {
    return { ok: false, message: "Enter a whole number of units." };
  }

  if (!setLowStockThreshold(productSlug, variantId, threshold)) {
    return { ok: false, message: "That product no longer exists." };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Low-stock threshold set to ${threshold}.`,
  };
}

/**
 * Settles a return.
 *
 * "restock" puts the units back on the shelf — they came back and they are
 * fit to sell. "write_off" leaves the stock alone: the goods did not come
 * back, or came back damaged, and either way they are not going back on
 * the shelf.
 */
export async function resolveStockCheckAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("inventory.manage");
  if (!can(user.role, "inventory.manage")) {
    return { ok: false, message: "You cannot settle a return." };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orderId) return { ok: false, message: "Choose an order." };
  if (action !== "restock" && action !== "write_off") {
    return { ok: false, message: "Pick what to do with the returned units." };
  }
  if (!reason) return { ok: false, message: "Say why." };

  const result = resolveStockCheck(orderId, action, reason, user.id);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, message: result.message };
}

/* ------------------------------------------------------------------ users */

export async function setUserRoleAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const actor = await requirePermission("users.manage");
  if (!can(actor.role, "users.manage")) {
    return { ok: false, message: "You cannot change roles." };
  }

  const id = Number(formData.get("id"));
  const role = String(formData.get("role") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That account no longer exists." };
  }
  if (!["member", "support", "admin"].includes(role)) {
    return { ok: false, message: "Pick a valid role." };
  }
  // Don't let the last admin demote themselves and lock everyone out.
  if (id === actor.id && role !== "admin") {
    return { ok: false, message: "You cannot remove your own admin access." };
  }

  await setUserRole(id, role as "member" | "support" | "admin");
  revalidatePath("/admin/users");
  return { ok: true, message: "Role updated." };
}

export async function deleteUserAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const actor = await requirePermission("users.manage");
  if (!can(actor.role, "users.manage")) {
    return { ok: false, message: "You cannot delete accounts." };
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That account no longer exists." };
  }
  if (id === actor.id) {
    return { ok: false, message: "You cannot delete your own account." };
  }

  const info = getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  if (!info.changes) return { ok: false, message: "That account no longer exists." };

  revalidatePath("/admin/users");
  return { ok: true, message: "Account deleted." };
}

export async function resetUserPasswordAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const actor = await requirePermission("users.manage");
  if (!can(actor.role, "users.manage")) {
    return { ok: false, message: "You cannot reset passwords." };
  }

  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That account no longer exists." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Use at least 8 characters." };
  }

  await updateUserPassword(id, password);
  revalidatePath("/admin/users");
  return { ok: true, message: "Password reset." };
}

/* --------------------------------------------------------------- messages */

export async function setMessageStatusAction(
  _prev: PanelState,
  formData: FormData
): Promise<PanelState> {
  const user = await requirePermission("messages.handle");
  if (!can(user.role, "messages.handle")) {
    return { ok: false, message: "You cannot work the enquiries list." };
  }

  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That enquiry no longer exists." };
  }
  if (!(MESSAGE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Pick a valid status." };
  }

  const closed = status === "closed" || status === "answered";
  getDb()
    .prepare(
      `UPDATE contact_messages
       SET status = ?, handled_by = ?, handled_at = ?
       WHERE id = ?`
    )
    .run(
      status as MessageStatus,
      user.id,
      closed ? new Date().toISOString() : null,
      id
    );

  revalidatePath("/admin/messages");
  return { ok: true, message: "Enquiry updated." };
}
