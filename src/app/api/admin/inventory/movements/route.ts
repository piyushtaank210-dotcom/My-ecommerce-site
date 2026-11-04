import { json, paged, pageParams, requireApiPermission } from "@/lib/api";
import { countMovements, listMovements } from "@/lib/inventory";
import { MOVEMENT_TYPES } from "@/lib/stock";

/**
 * GET /api/admin/inventory/movements — the inventory history.
 *
 * What the stock was, what it became, and why it moved.
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("inventory.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const q = url.searchParams.get("q") ?? undefined;
  const productSlug = url.searchParams.get("product") ?? undefined;
  const requested = url.searchParams.get("type") ?? "all";
  const type = (MOVEMENT_TYPES as readonly string[]).includes(requested)
    ? requested
    : "all";

  const query = { q, productSlug, type, limit, offset };
  const rows = listMovements(query);

  return json(paged(rows, countMovements({ q, productSlug, type }), page, limit));
}
