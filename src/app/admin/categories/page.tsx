import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import {
  TaxonomyManager,
  type TaxonomyTab,
} from "@/components/admin/TaxonomyManager";

export const metadata = { title: "Categories" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/**
 * The shape of the catalogue: the categories, the categories inside them,
 * and the brands the store sells.
 *
 * The two lists are read one at a time — the categories here, and the
 * brands under their own tab — so neither is laid out all at once.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("catalog.view");
  const canManage = can(user.role, "catalog.manage");
  const sp = await searchParams;
  const tab: TaxonomyTab = one(sp.tab) === "brands" ? "brands" : "categories";

  // Both lists are asked for together, so the page waits on the one
  // round trip rather than on the two in turn.
  const [categories, brands] = await Promise.all([
    listCategories(),
    listBrands(),
  ]);

  return (
    <TaxonomyManager
      categories={categories}
      brands={brands}
      canManage={canManage}
      tab={tab}
    />
  );
}
