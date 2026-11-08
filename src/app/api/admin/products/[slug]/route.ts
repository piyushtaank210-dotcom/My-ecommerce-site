import { getProduct } from "@/lib/queries";
import {
  deleteProduct,
  publishProduct,
  setProductListed,
  setProductStatus,
  skuTakenByAnother,
  updateProduct,
} from "@/lib/admin";
import { getDb, withTransaction } from "@/lib/db";
import {
  InventoryError,
  adjustStock,
  setLowStockThreshold,
} from "@/lib/inventory";
import { fail, json, requireApiPermission } from "@/lib/api";
import { parseProductStatus } from "@/lib/product-status";
import { parseProductCondition } from "@/lib/types";
import { normalizeSku } from "@/lib/sku";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/admin/products/[slug] — one product with its variants. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const product = (await getProduct(slug));
  if (!product) return fail("No such product.", 404);

  return json(product);
}

/**
 * PATCH /api/admin/products/[slug] — edit a product.
 *
 * Body may carry any of: name, brand, price, mrp, stock, badge, shortDesc,
 * sku, category, image, listed, status. `listed` is the delist switch and
 * `status` moves the product through draft / published / archived.
 *
 * The stock is changed through the inventory, so that every change is
 * written down:
 *
 * - `{"stock":14}` sets a product's own count. A product with options is
 *   stocked by those options, so it is refused.
 * - `{"variants":[{"id":"…::1tb-disc","stock":14}]}` sets an option's count.
 * - `{"lowStockThreshold":5}` sets the number at or below which the
 *   product counts as low.
 *
 * Everything is applied together: a change that cannot be made leaves the
 * product exactly as it was.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const product = (await getProduct(slug));
  if (!product) return fail("No such product.", 404);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  try {
    (await withTransaction(async () => {
      if (typeof body.listed === "boolean") {
        (await setProductListed(slug, body.listed));
      }

      if (typeof body.status === "string") {
        const status = parseProductStatus(body.status);
        if (status === "published") (await publishProduct(slug));
        else (await setProductStatus(slug, status));
      }

      const patch: Parameters<typeof updateProduct>[1] = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (typeof body.brand === "string" || body.brand === null) {
        patch.brand = body.brand as string | null;
      }
      if (typeof body.price === "number") patch.price = Math.round(body.price);
      if (typeof body.mrp === "number") patch.mrp = Math.round(body.mrp);
      if (typeof body.salePrice === "number" || body.salePrice === null) {
        patch.salePrice =
          body.salePrice === null ? null : Math.round(body.salePrice as number);
      }
      // What the store paid is an administrator's business alone.
      if (guard.user.role === "admin") {
        if (typeof body.purchaseCost === "number" || body.purchaseCost === null) {
          patch.purchaseCost =
            body.purchaseCost === null
              ? null
              : Math.round(body.purchaseCost as number);
        }
      }
      if (typeof body.badge === "string" || body.badge === null) {
        patch.badge = body.badge as string | null;
      }
      if (typeof body.shortDesc === "string" || body.shortDesc === null) {
        patch.shortDesc = body.shortDesc as string | null;
      }
      if (typeof body.description === "string" || body.description === null) {
        patch.description = body.description as string | null;
      }
      if (typeof body.subcategory === "string" || body.subcategory === null) {
        patch.subcategory = body.subcategory as string | null;
      }
      if (typeof body.modelNumber === "string" || body.modelNumber === null) {
        patch.modelNumber = body.modelNumber as string | null;
      }
      if (typeof body.condition === "string") {
        patch.condition = parseProductCondition(body.condition);
      }
      if (typeof body.specs === "object" && body.specs !== null) {
        patch.specs = body.specs as Record<string, string>;
      }
      if (typeof body.sku === "string") {
        const sku = normalizeSku(body.sku);
        if (sku && (await skuTakenByAnother(sku, slug))) {
          throw new InventoryError("Another product already uses that SKU.");
        }
        patch.sku = sku || null;
      }
      if (typeof body.category === "string") patch.categorySlug = body.category;
      if (typeof body.image === "string" || body.image === null) {
        patch.image = body.image as string | null;
      }
      if (typeof body.imageAlt === "string" || body.imageAlt === null) {
        patch.imageAlt = body.imageAlt as string | null;
      }
      if (typeof body.seoTitle === "string" || body.seoTitle === null) {
        patch.seoTitle = body.seoTitle as string | null;
      }
      if (typeof body.metaDescription === "string" || body.metaDescription === null) {
        patch.metaDescription = body.metaDescription as string | null;
      }
      if (typeof body.weightGrams === "number" || body.weightGrams === null) {
        patch.weightGrams =
          body.weightGrams === null ? null : Math.round(body.weightGrams);
      }
      if (typeof body.packageLength === "number" || body.packageLength === null) {
        patch.packageLength =
          body.packageLength === null ? null : Math.round(body.packageLength);
      }
      if (typeof body.packageWidth === "number" || body.packageWidth === null) {
        patch.packageWidth =
          body.packageWidth === null ? null : Math.round(body.packageWidth);
      }
      if (typeof body.packageHeight === "number" || body.packageHeight === null) {
        patch.packageHeight =
          body.packageHeight === null ? null : Math.round(body.packageHeight);
      }
      if (typeof body.warranty === "string" || body.warranty === null) {
        patch.warranty = body.warranty as string | null;
      }
      if (typeof body.returns === "string" || body.returns === null) {
        patch.returns = body.returns as string | null;
      }

      // The stock. It goes through the inventory, so the change is written
      // down with its reason.
      if (typeof body.stock === "number") {
        if (product.variants.length > 0) {
          throw new InventoryError(
            "This product is stocked by its options — set the stock on the option itself."
          );
        }
        const moved = (await adjustStock({
          productSlug: slug,
          variantId: null,
          mode: "set",
          quantity: Math.max(0, Math.round(body.stock)),
          reason: "Stock set from the back office",
          userId: guard.user.id,
        }));
        if (!moved.ok) throw new InventoryError(moved.reason);
      }

      // The number at or below which the product counts as low.
      if (
        typeof body.lowStockThreshold === "number" &&
        Number.isInteger(body.lowStockThreshold) &&
        body.lowStockThreshold >= 0
      ) {
        (await setLowStockThreshold(slug, null, body.lowStockThreshold));
      }

      // The options carry their own stock, which is what a product with
      // options actually sells from. Each option is counted separately.
      if (Array.isArray(body.variants)) {
        for (const v of body.variants as {
          id?: unknown;
          stock?: unknown;
          lowStockThreshold?: unknown;
        }[]) {
          if (!v || typeof v.id !== "string") continue;

          if (typeof v.stock === "number") {
            const moved = (await adjustStock({
              productSlug: slug,
              variantId: v.id,
              mode: "set",
              quantity: Math.max(0, Math.round(v.stock)),
              reason: "Stock set from the back office",
              userId: guard.user.id,
            }));
            if (!moved.ok) throw new InventoryError(moved.reason);
          }

          if (
            typeof v.lowStockThreshold === "number" &&
            Number.isInteger(v.lowStockThreshold) &&
            v.lowStockThreshold >= 0
          ) {
            (await setLowStockThreshold(slug, v.id, v.lowStockThreshold));
          }
        }
      }

      (await updateProduct(slug, patch));
    }));
  } catch (err) {
    if (err instanceof InventoryError) return fail(err.message, 409);
    throw err;
  }

  return json((await getProduct(slug)));
}

/**
 * DELETE /api/admin/products/[slug] — remove a product for good.
 *
 * Deleting is the last resort and administrators only. A product that has
 * been ordered cannot be deleted, because the order lines point at it;
 * archiving hides it instead and keeps everything about it.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  if (guard.user.role !== "admin") {
    return fail("Only an administrator can delete a product for good.", 403);
  }

  const { slug } = await params;
  const result = (await deleteProduct(slug));

  if (!result.deleted) {
    return fail(result.reason ?? "That product could not be deleted.", 409);
  }

  return json({ deleted: slug });
}
