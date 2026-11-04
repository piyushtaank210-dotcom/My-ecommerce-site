import { json, fail, requireApiPermission } from "@/lib/api";
import { createVariant, listAdminProducts } from "@/lib/admin";
import type { VariantInput } from "@/lib/admin";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/admin/products/[slug]/variants — the product's options.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const product = listAdminProducts().find((p) => p.slug === slug);
  if (!product) return fail("No such product.", 404);

  return json({
    attributes: product.attributes,
    variants: product.variants,
  });
}

/**
 * POST /api/admin/products/[slug]/variants — add an option.
 *
 * Body: `{name?, attributes?, sku?, price, mrp, stock?, lowStockThreshold?,
 * image?, barcode?}`. The values of the attributes become the option's
 * name, and two options of the same product may not have the same values.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

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
    sku: typeof body.sku === "string" ? body.sku : null,
    price: typeof body.price === "number" ? body.price : undefined,
    mrp: typeof body.mrp === "number" ? body.mrp : undefined,
    stock: typeof body.stock === "number" ? body.stock : undefined,
    lowStockThreshold:
      typeof body.lowStockThreshold === "number"
        ? body.lowStockThreshold
        : undefined,
    image: typeof body.image === "string" ? body.image : null,
    barcode: typeof body.barcode === "string" ? body.barcode : null,
  };

  const result = createVariant(slug, input, guard.user.id);
  if (!result.ok) {
    return fail(result.reason ?? "That option could not be added.", 409);
  }

  return json(result.variant, 201);
}
