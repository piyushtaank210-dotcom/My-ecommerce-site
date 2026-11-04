import { json, fail, requireApiPermission } from "@/lib/api";
import { createSubcategory, listCategories } from "@/lib/taxonomy-admin";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/admin/categories/[slug]/subcategories — the categories inside
 * this category.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const category = listCategories().find((c) => c.slug === slug);
  if (!category) return fail("No such category.", 404);

  return json({ subcategories: category.subcategories });
}

/**
 * POST /api/admin/categories/[slug]/subcategories — add one.
 *
 * Body: `{name}`.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = createSubcategory(slug, String(body.name ?? ""));
  if (!result.ok) {
    return fail(result.reason ?? "That subcategory could not be added.", 409);
  }

  return json(listCategories().find((c) => c.slug === slug), 201);
}
