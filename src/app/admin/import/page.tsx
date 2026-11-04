import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { PRODUCT_COLUMNS } from "@/lib/product-import";
import { ImportPanel } from "@/components/admin/ImportPanel";

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
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Import &amp; export</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          Take the catalogue out as a spreadsheet, change it, and bring it
          back — one product at a time, or a whole new range at once.
        </p>
      </header>

      <ImportPanel columns={columns} canManage={canManage} />
    </div>
  );
}
