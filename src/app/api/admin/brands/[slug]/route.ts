import { json, fail, requireApiPermission } from "@/lib/api";
import { deleteBrand, listBrands, updateBrand } from "@/lib/taxonomy-admin";

type Params = { params: Promise<{ slug: string }> };

/**
 * PATCH /api/admin/brands/[slug] — change a brand.
 *
 * The products that carry it follow a new name.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let body: { name?: unknown; blurb?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; blurb?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = updateBrand(slug, {
    name: body.name !== undefined ? String(body.name) : undefined,
    blurb: body.blurb !== undefined ? String(body.blurb ?? "") : undefined,
  });
  if (!result.ok) {
    return fail(result.reason ?? "That brand could not be changed.", 409);
  }

  return json(listBrands().find((b) => b.slug === slug));
}

/**
 * DELETE /api/admin/brands/[slug] — remove a brand.
 *
 * A brand that products still carry cannot be removed.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const result = deleteBrand(slug);
  if (!result.ok) {
    return fail(result.reason ?? "That brand could not be removed.", 409);
  }

  return json({ deleted: slug });
}
