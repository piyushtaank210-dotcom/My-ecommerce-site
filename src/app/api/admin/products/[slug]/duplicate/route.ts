import { duplicateProduct } from "@/lib/admin";
import { fail, json, requireApiPermission } from "@/lib/api";

/**
 * POST /api/admin/products/[slug]/duplicate — copy a product and its
 * variants.
 *
 * The copy is a draft: it stays out of the shop until somebody publishes
 * it. The slug and the SKU are both made unique.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  const result = (await duplicateProduct(slug));

  if (!result.ok) {
    return fail(result.reason ?? "That product could not be copied.", 404);
  }

  return json({ duplicated: result.slug, status: "draft" }, 201);
}
