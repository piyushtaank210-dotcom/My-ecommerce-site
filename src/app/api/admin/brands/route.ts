import { json, fail, requireApiPermission } from "@/lib/api";
import { createBrand, listBrands } from "@/lib/taxonomy-admin";

/**
 * GET /api/admin/brands — the brands the store sells.
 */
export async function GET() {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  return json({ brands: listBrands() });
}

/**
 * POST /api/admin/brands — add a brand.
 *
 * Body: `{name, blurb?}`.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let body: { name?: unknown; blurb?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; blurb?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = createBrand({
    name: String(body.name ?? ""),
    blurb: body.blurb ? String(body.blurb) : null,
  });
  if (!result.ok) {
    return fail(result.reason ?? "That brand could not be added.", 409);
  }

  return json(listBrands().find((b) => b.slug === result.slug), 201);
}
