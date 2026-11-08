import { countOrders, listOrders } from "@/lib/admin";
import { json, paged, pageParams, requireApiPermission } from "@/lib/api";

/**
 * GET /api/admin/orders — every order, newest first.
 *
 *   ?q=      order id, name, email or phone
 *   ?status=confirmed|packed|shipped|delivered|cancelled
 *   ?page=1&limit=25
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("orders.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const query = {
    q: url.searchParams.get("q")?.trim() || undefined,
    status: url.searchParams.get("status")?.trim() || undefined,
    limit,
    offset,
  };

  return json(paged((await listOrders(query)), (await countOrders(query)), page, limit));
}
