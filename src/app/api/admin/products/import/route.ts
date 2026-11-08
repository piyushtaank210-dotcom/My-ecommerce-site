import { fail, json, requireApiPermission } from "@/lib/api";
import { previewImport } from "@/lib/product-import";

/**
 * POST /api/admin/products/import — read a file and say what it would do.
 *
 * The body is a form with the file under `file`. Nothing is written: the
 * answer is a preview — every row, what it would do, and what is wrong with
 * the rows that cannot be used.
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
  const preview = (await previewImport(
    file.name || "catalogue.csv",
    text,
    guard.user.role === "admin"
  ));

  return json(preview);
}
