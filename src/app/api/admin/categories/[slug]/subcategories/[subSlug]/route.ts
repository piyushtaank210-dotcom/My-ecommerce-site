import { json, fail, requireApiPermission } from "@/lib/api";
import {
  deleteSubcategory,
  listCategories,
  updateSubcategory,
} from "@/lib/taxonomy-admin";

type Params = { params: Promise<{ slug: string; subSlug: string }> };

/**
 * PATCH /api/admin/categories/[slug]/subcategories/[subSlug] — rename one.
 *
 * The products that carry it follow the new name.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug, subSlug } = await params;

  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = (await updateSubcategory(slug, subSlug, String(body.name ?? "")));
  if (!result.ok) {
    return fail(result.reason ?? "That subcategory could not be changed.", 409);
  }

  return json((await listCategories()).find((c) => c.slug === slug));
}

/**
 * DELETE /api/admin/categories/[slug]/subcategories/[subSlug] — remove one.
 *
 * A subcategory that products still carry cannot be removed.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug, subSlug } = await params;
  const result = (await deleteSubcategory(slug, subSlug));
  if (!result.ok) {
    return fail(result.reason ?? "That subcategory could not be removed.", 409);
  }

  return json((await listCategories()).find((c) => c.slug === slug));
}
