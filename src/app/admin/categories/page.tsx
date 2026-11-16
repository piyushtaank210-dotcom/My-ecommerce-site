import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";
import { PageHeader } from "@/components/admin/ui/PageHeader";

export const metadata = { title: "Categories" };

/**
 * The shape of the catalogue: categories, the categories inside them, and
 * the brands the store sells.
 */
export default async function AdminCategoriesPage() {
  const user = await requirePermission("catalog.view");
  const canManage = can(user.role, "catalog.manage");

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Categories and brands"
        description="What the catalogue is divided into, what each category asks its products about, and the makers the store sells."
      />

      <TaxonomyManager
        categories={(await listCategories())}
        brands={(await listBrands())}
        canManage={canManage}
      />
    </>
  );
}
