import { json, fail, requireApiPermission } from "@/lib/api";
import { setProductAttributes } from "@/lib/admin";
import { cleanAttributes } from "@/lib/variations";

type Params = { params: Promise<{ slug: string }> };

/**
 * PATCH /api/admin/products/[slug]/attributes — what this product varies by.
 *
 * Body: `{"attributes":{"Colour":["White","Midnight Blue"]}}`.
 *
 * This is the list the back office offers — it does not change the options
 * the product already has.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let body: { attributes?: unknown };
  try {
    body = (await request.json()) as { attributes?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const attributes = cleanAttributes(body.attributes);
  if (!(await setProductAttributes(slug, attributes))) {
    return fail("No such product.", 404);
  }

  return json({ attributes });
}
