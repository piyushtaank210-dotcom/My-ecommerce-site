import { requireApiPermission } from "@/lib/api";
import { importTemplate } from "@/lib/product-import";

/**
 * GET /api/admin/products/import/template — the columns a file must have.
 *
 * The template is the header row and nothing else, so it cannot be
 * imported by accident. What goes in each column is written beside it on
 * the import page.
 */
export async function GET() {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const isAdmin = guard.user.role === "admin";
  const csv = importTemplate(isAdmin);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="consoleseller-import-template.csv"`,
      "cache-control": "no-store",
    },
  });
}
