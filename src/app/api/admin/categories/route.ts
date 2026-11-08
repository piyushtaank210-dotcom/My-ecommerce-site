import { json, fail, requireApiPermission } from "@/lib/api";
import { createCategory, listCategories } from "@/lib/taxonomy-admin";

/**
 * GET /api/admin/categories — every category, with its subcategories and
 * the specification fields it asks about.
 */
export async function GET() {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  return json({ categories: (await listCategories()) });
}

/**
 * POST /api/admin/categories — add a category.
 *
 * Body: `{name, slug?, blurb?, icon?, specFields?}`.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let body: {
    name?: unknown;
    slug?: unknown;
    blurb?: unknown;
    icon?: unknown;
    specFields?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const name = String(body.name ?? "").trim();
  if (name.length < 2) return fail("Give the category a name.", 400);

  const result = (await createCategory({
    name,
    slug: body.slug ? String(body.slug) : undefined,
    blurb: body.blurb ? String(body.blurb) : null,
    icon: body.icon ? String(body.icon) : null,
    specFields: Array.isArray(body.specFields)
      ? body.specFields.map((f) => String(f))
      : [],
  }));

  if (!result.ok) {
    return fail(result.reason ?? "That category could not be added.", 409);
  }

  return json(
    (await listCategories()).find((c) => c.slug === result.slug),
    201
  );
}
