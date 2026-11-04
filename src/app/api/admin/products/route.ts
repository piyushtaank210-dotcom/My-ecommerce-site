import { countProducts, getProduct, getProducts } from "@/lib/queries";
import {
  listAdminProducts,
  bulkUpdateProducts,
  BULK_PRODUCT_ACTIONS,
  catalogueQuery,
  createProduct,
  type BulkProductAction,
} from "@/lib/admin";
import { fail, json, paged, pageParams, requireApiPermission } from "@/lib/api";
import { parseProductCondition } from "@/lib/types";
import type { CatalogueFilters, SortKey } from "@/lib/types";

const SORT_KEYS: SortKey[] = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "rating",
  "discount",
  "best-selling",
];

/**
 * GET /api/admin/products — the whole catalogue, delisted included.
 *
 *   ?q=           search name, brand, description and SKU
 *   ?category=consoles
 *   ?brand=Sony
 *   ?stock=in|low|out
 *   ?status=draft|published|archived
 *   ?listed=true|false        only the listed ones, or only the delisted ones
 *   ?sort=price-asc|price-desc|newest|best-selling
 *   ?page=1&limit=25
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const filters: CatalogueFilters = {
    q: url.searchParams.get("q")?.trim() || undefined,
    category: url.searchParams.get("category")?.trim() || undefined,
    brand: url.searchParams.get("brand")?.trim() || undefined,
    stock: url.searchParams.get("stock")?.trim() || "all",
    status: url.searchParams.get("status")?.trim() || "all",
    listed: url.searchParams.get("listed")?.trim() || "all",
  };

  // The sort key goes into an ORDER BY, so it is checked against the list
  // of known keys rather than passed through.
  const sortParam = url.searchParams.get("sort")?.trim();
  const sort = (SORT_KEYS as string[]).includes(sortParam ?? "")
    ? (sortParam as SortKey)
    : undefined;

  // The back office sees every product — published, draft or archived — and
  // narrows the list with the filters above.
  const query = {
    ...catalogueQuery(filters),
    sort,
    limit,
    offset,
  };

  const rows = listAdminProducts(query);

  return json(paged(rows, countProducts(query), page, limit));
}

/**
 * POST /api/admin/products — create a product, or run a bulk action.
 *
 * To create one:
 *
 *   { "name": "PlayStation 5 Slim", "category": "consoles", "price": 54990, … }
 *
 * To run a bulk action over several products:
 *
 *   { "action": "publish" | "delist" | "archive", "slugs": ["a", "b"] }
 *
 * Or, to act on everything matching a set of filters rather than on a list
 * of slugs:
 *
 *   { "action": "archive", "scope": "all", "filters": { "brand": "Sony" } }
 *
 * There is no bulk delete: deleting is the last resort and each product
 * needs its own look first.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let body: {
    action?: unknown;
    slugs?: unknown;
    scope?: unknown;
    filters?: unknown;
    name?: unknown;
    slug?: unknown;
    brand?: unknown;
    category?: unknown;
    subcategory?: unknown;
    modelNumber?: unknown;
    condition?: unknown;
    sku?: unknown;
    shortDesc?: unknown;
    description?: unknown;
    price?: unknown;
    mrp?: unknown;
    salePrice?: unknown;
    purchaseCost?: unknown;
    stock?: unknown;
    specs?: unknown;
    attributes?: unknown;
    imageAlt?: unknown;
    seoTitle?: unknown;
    metaDescription?: unknown;
    weightGrams?: unknown;
    packageLength?: unknown;
    packageWidth?: unknown;
    packageHeight?: unknown;
    warranty?: unknown;
    returns?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  // A body with a name is a new product; anything else is a bulk action.
  if (typeof body.name === "string" && !body.action) {
    return createProductFromApi(body, guard.user.role, guard.user.id);
  }

  const action = String(body.action ?? "");
  if (!(BULK_PRODUCT_ACTIONS as string[]).includes(action)) {
    return fail("That is not an action the catalogue knows.", 400);
  }

  let slugs: string[];
  if (body.scope === "all") {
    // The list is worked out again here, so the action can never reach a
    // product the caller was not looking at.
    const filters = (body.filters ?? {}) as CatalogueFilters;
    slugs = getProducts(catalogueQuery(filters)).map((p) => p.slug);
  } else {
    slugs = Array.isArray(body.slugs)
      ? body.slugs.map((s) => String(s).trim()).filter(Boolean)
      : [];
  }
  if (!slugs.length) return fail("Choose at least one product.", 400);

  const result = bulkUpdateProducts(slugs, action as BulkProductAction);
  return json({ changed: result.changed, missing: result.missing });
}

/** Puts a new product in the catalogue, the way the editor does. */
function createProductFromApi(
  body: Record<string, unknown>,
  role: "member" | "support" | "admin",
  userId: number
) {
  const name = String(body.name ?? "").trim();
  if (name.length < 2) return fail("Give the product a name.", 400);

  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 2) return fail("Give the product an address.", 400);

  const price = Number(body.price);
  const mrp = Number(body.mrp);
  if (!Number.isFinite(price) || price < 0) {
    return fail("Enter a selling price.", 400);
  }
  if (!Number.isFinite(mrp) || mrp < 0) {
    return fail("Enter an MRP.", 400);
  }

  const created = createProduct({
    slug,
    name,
    brand: body.brand ? String(body.brand) : null,
    subcategory: body.subcategory ? String(body.subcategory) : null,
    modelNumber: body.modelNumber ? String(body.modelNumber) : null,
    categorySlug: String(body.category ?? ""),
    condition: parseProductCondition(body.condition),
    price: Math.round(price),
    mrp: Math.round(mrp),
    salePrice:
      typeof body.salePrice === "number" ? Math.round(body.salePrice) : null,
    purchaseCost:
      role === "admin" && typeof body.purchaseCost === "number"
        ? Math.round(body.purchaseCost)
        : null,
    stock: Number(body.stock) || 0,
    userId,
    badge: null,
    shortDesc: body.shortDesc ? String(body.shortDesc) : null,
    description: body.description ? String(body.description) : null,
    specs: (body.specs ?? {}) as Record<string, string>,
    attributes: (body.attributes ?? {}) as Record<string, string[]>,
    sku: body.sku ? String(body.sku) : null,
    imageAlt: body.imageAlt ? String(body.imageAlt) : null,
    seoTitle: body.seoTitle ? String(body.seoTitle) : null,
    metaDescription: body.metaDescription ? String(body.metaDescription) : null,
    weightGrams:
      typeof body.weightGrams === "number" ? Math.round(body.weightGrams) : null,
    packageLength:
      typeof body.packageLength === "number"
        ? Math.round(body.packageLength)
        : null,
    packageWidth:
      typeof body.packageWidth === "number" ? Math.round(body.packageWidth) : null,
    packageHeight:
      typeof body.packageHeight === "number"
        ? Math.round(body.packageHeight)
        : null,
    warranty: body.warranty ? String(body.warranty) : null,
    returns: body.returns ? String(body.returns) : null,
  });

  if (!created.ok) {
    return fail(created.reason ?? "The product could not be created.", 409);
  }
  return json(getProduct(created.slug!), 201);
}
