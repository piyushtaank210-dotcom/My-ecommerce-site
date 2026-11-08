import { requireApiPermission } from "@/lib/api";
import { exportCatalogue } from "@/lib/product-import";

/**
 * GET /api/admin/products/export — the catalogue as a spreadsheet.
 *
 * Every product the back office can see, drafts and archived ones
 * included, so the file is a backup as well as a way to edit.
 *
 * The purchase cost is only in the file for an administrator. For anybody
 * else the column is not written at all, so the cost is not in it to find.
 */
export async function GET() {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const isAdmin = guard.user.role === "admin";
  const csv = (await exportCatalogue(isAdmin));

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="consoleseller-catalogue.csv"`,
      "cache-control": "no-store",
    },
  });
}
