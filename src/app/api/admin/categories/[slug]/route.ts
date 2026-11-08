import { json, fail, requireApiPermission } from "@/lib/api";
import { deleteCategory, listCategories, updateCategory } from "@/lib/taxonomy-admin";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/admin/categories/[slug] — one category.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const category = (await listCategories()).find((c) => c.slug === slug);
  if (!category) return fail("No such category.", 404);

  return json(category);
}

/**
 * PATCH /api/admin/categories/[slug] — change a category.
 *
 * Body: `{name?, blurb?, icon?, specFields?}`. The specification fields are
 * what the category asks its products about.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let body: {
    name?: unknown;
    blurb?: unknown;
    icon?: unknown;
    specFields?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = (await updateCategory(slug, {
    name: body.name !== undefined ? String(body.name) : undefined,
    blurb: body.blurb !== undefined ? String(body.blurb ?? "") : undefined,
    icon: body.icon !== undefined ? String(body.icon ?? "") : undefined,
    specFields: Array.isArray(body.specFields)
      ? body.specFields.map((f) => String(f))
      : undefined,
  }));

  if (!result.ok) {
    return fail(result.reason ?? "That category could not be changed.", 409);
  }

  return json((await listCategories()).find((c) => c.slug === slug));
}

/**
 * DELETE /api/admin/categories/[slug] — remove a category.
 *
 * A category that products are in cannot be removed.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const result = (await deleteCategory(slug));
  if (!result.ok) {
    return fail(result.reason ?? "That category could not be removed.", 409);
  }

  return json({ deleted: slug });
}
