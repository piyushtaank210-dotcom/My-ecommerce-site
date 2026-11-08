import { getDb } from "@/lib/db";
import { getBrands, getCategories } from "@/lib/queries";
import { json, requireApiPermission } from "@/lib/api";
import { MESSAGE_STATUSES } from "@/lib/contact";
import { ORDER_STATUSES } from "@/lib/orders";
import { PRODUCT_STATUSES } from "@/lib/product-status";
import { ROLES } from "@/lib/roles";

/**
 * GET /api/admin/meta — everything a form in the back office needs to
 * render its dropdowns: categories, brands, roles and status vocabularies.
 */
export async function GET() {
  const guard = await requireApiPermission("dashboard.view");
  if ("error" in guard) return guard.error;

  const images = (
    (await getDb()
      .prepare(
        "SELECT DISTINCT image FROM products WHERE image IS NOT NULL ORDER BY image"
      )
      .all()) as { image: string }[]
  ).map((r) => r.image);

  return json({
    categories: (await getCategories()),
    // The back office wants every brand in the catalogue, including the
    // ones that only archived products carry.
    brands: (await getBrands(undefined, { includeUnlisted: true })),
    productImages: images,
    roles: ROLES,
    orderStatuses: ORDER_STATUSES,
    messageStatuses: MESSAGE_STATUSES,
    productStatuses: PRODUCT_STATUSES,
  });
}
