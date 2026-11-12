import { fail, json, requireApiPermission } from "@/lib/api";
import { listReturnRequests, countReturnRequests } from "@/lib/returns";
import { getReturnsOverview } from "@/lib/returns-records";
import { pageParams, paged } from "@/lib/api";

/**
 * GET /api/admin/returns — every request, for the back office.
 *
 * The search, the filters and the dates all work here, so the panel and
 * anything else that wants the same list are reading the same rows.
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const q = url.searchParams.get("q")?.trim() || undefined;
  const status = url.searchParams.get("status") || undefined;
  const type = url.searchParams.get("type") || undefined;
  const from = url.searchParams.get("from")?.trim() || undefined;
  const to = url.searchParams.get("to")?.trim() || undefined;
  const sort = url.searchParams.get("sort") || undefined;

  const query = {
    q,
    status: status && status !== "all" ? status : undefined,
    type: type && type !== "all" ? type : undefined,
    refunds: url.searchParams.get("refunds") === "1" ? true : undefined,
    from,
    to,
    sort,
    limit,
    offset,
  };

  const [rows, total, overview] = await Promise.all([
    listReturnRequests(query),
    countReturnRequests(query),
    getReturnsOverview(),
  ]);

  return json(
    paged(
      rows.map((r) => ({
        id: r.id,
        order_id: r.order_id,
        type: r.type,
        status: r.status,
        reason: r.reason,
        customer_name: r.customer_name,
        customer_email: r.customer_email,
        customer_phone: r.customer_phone,
        delivery_date: r.delivery_date,
        serial_number: r.serial_number,
        customer_notes: r.customer_notes,
        evidence_excused: r.evidence_excused,
        refund_amount: r.refund_amount,
        refund_status: r.refund_status,
        created_at: r.created_at,
        items: r.items,
        evidence_count: r.images.length,
      })),
      total,
      page,
      limit
    ),
    200
  );
}
