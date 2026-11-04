import { json, fail, requireApiPermission } from "@/lib/api";
import { deleteVariant, getVariant, updateVariant } from "@/lib/admin";
import type { VariantInput } from "@/lib/admin";

type Params = { params: Promise<{ slug: string; variantId: string }> };

/**
 * GET /api/admin/products/[slug]/variants/[variantId] — one option.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug, variantId } = await params;
  const variant = getVariant(slug, variantId);
  if (!variant) return fail("No such option.", 404);

  return json(variant);
}

/**
 * PATCH /api/admin/products/[slug]/variants/[variantId] — change an option.
 *
 * The stock goes through the inventory, so the change is written down with
 * its reason.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug, variantId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const input: VariantInput = {
    name: typeof body.name === "string" ? body.name : undefined,
    attributes:
      body.attributes && typeof body.attributes === "object"
        ? (body.attributes as Record<string, string>)
        : undefined,
    sku: typeof body.sku === "string" ? body.sku : undefined,
    price: typeof body.price === "number" ? body.price : undefined,
    mrp: typeof body.mrp === "number" ? body.mrp : undefined,
    stock: typeof body.stock === "number" ? body.stock : undefined,
    lowStockThreshold:
      typeof body.lowStockThreshold === "number"
        ? body.lowStockThreshold
        : undefined,
    image: typeof body.image === "string" ? body.image : undefined,
    barcode: typeof body.barcode === "string" ? body.barcode : undefined,
  };

  const result = updateVariant(slug, variantId, input, guard.user.id);
  if (!result.ok) {
    return fail(result.reason ?? "That option could not be changed.", 409);
  }

  return json(result.variant);
}

/**
 * DELETE /api/admin/products/[slug]/variants/[variantId] — remove an option.
 *
 * An option that is in somebody's basket cannot be removed. One that has
 * been ordered can: the order keeps its own copy of the name and the price.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug, variantId } = await params;
  const result = deleteVariant(slug, variantId);
  if (!result.ok) {
    return fail(result.reason ?? "That option could not be removed.", 409);
  }

  return json({ deleted: variantId });
}
