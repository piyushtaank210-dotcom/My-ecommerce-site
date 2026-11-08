import { json, fail, requireApiPermission } from "@/lib/api";
import { getVariant, updateVariant } from "@/lib/admin";
import { saveUpload } from "@/lib/uploads";

type Params = { params: Promise<{ slug: string; variantId: string }> };

/**
 * POST /api/admin/products/[slug]/variants/[variantId]/image — an option's
 * own photograph.
 *
 * The body is a form with the file under `files`.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug, variantId } = await params;
  if (!(await getVariant(slug, variantId))) return fail("No such option.", 404);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Send the photograph as a form.", 400);
  }

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a photograph.", 400);
  }

  const saved = await saveUpload(`${slug}/variants`, file);
  if (!saved.ok) return fail(saved.reason, 415);

  const result = (await updateVariant(slug, variantId, { image: saved.path }, guard.user.id));
  if (!result.ok) return fail(result.reason ?? "That option could not be changed.", 409);

  return json(result.variant);
}
