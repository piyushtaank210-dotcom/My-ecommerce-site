import { fail, json, requireApiPermission } from "@/lib/api";
import { applyImport } from "@/lib/product-import";

/**
 * POST /api/admin/products/import/apply — do what the preview said.
 *
 * The file is read and checked again here, so a file that has changed
 * since it was previewed cannot slip something past the check. Only the
 * rows that are usable are written; the rest are reported and left alone.
 *
 * A product that is not in the file is not touched.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Send the file as a form.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a file.", 400);
  }

  const text = await file.text();
  const { preview, summary } = applyImport(
    file.name || "catalogue.csv",
    text,
    guard.user.role === "admin",
    guard.user.id
  );

  return json({ preview, summary });
}
