import { countCustomers, listCustomers } from "@/lib/admin";
import { json, paged, pageParams, requireApiPermission } from "@/lib/api";
import { isRole } from "@/lib/roles";

/**
 * GET /api/admin/users — everyone with an account, and what they have spent.
 *
 *   ?q=      name or email
 *   ?role=member|support|admin
 *   ?page=1&limit=25
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("customers.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const roleParam = url.searchParams.get("role")?.trim();
  const role = roleParam && isRole(roleParam) ? roleParam : "all";

  const query = {
    q: url.searchParams.get("q")?.trim() || undefined,
    role,
    limit,
    offset,
  };

  return json(paged((await listCustomers(query)), (await countCustomers(query)), page, limit));
}
