import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { PRODUCT_COLUMNS } from "@/lib/product-import";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { PageHeader } from "@/components/admin/ui/PageHeader";

export const metadata = { title: "Import & export" };

/**
 * The catalogue, in and out as a spreadsheet.
 *
 * Reading a file changes nothing — the administrator sees what it would do
 * before anything is written.
 */
export default async function AdminImportPage() {
  const user = await requirePermission("catalog.view");
  const canManage = can(user.role, "catalog.manage");

  // The purchase cost is only in the columns an administrator may see.
  const columns = PRODUCT_COLUMNS.filter(
    (c) => !c.adminOnly || user.role === "admin"
  );

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Import and export"
        description="Take the catalogue out as a spreadsheet, change it, and bring it back — one product at a time, or a whole new range at once."
      />

      <ImportPanel columns={columns} canManage={canManage} />
    </>
  );
}
