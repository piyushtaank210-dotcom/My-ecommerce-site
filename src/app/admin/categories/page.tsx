import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export const metadata = { title: "Categories" };

/**
 * The shape of the catalogue: categories, the categories inside them, and
 * the brands the store sells.
 */
export default async function AdminCategoriesPage() {
  const user = await requirePermission("catalog.view");
  const canManage = can(user.role, "catalog.manage");

  return (
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Categories &amp; brands</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          What the catalogue is divided into, what each category asks its
          products about, and the makers the store sells.
        </p>
      </header>

      <TaxonomyManager
        categories={(await listCategories())}
        brands={(await listBrands())}
        canManage={canManage}
      />
    </div>
  );
}
