import { fail, json, requireApiPermission } from "@/lib/api";
import { cancelOrderWithReason } from "@/lib/order-dispatch";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/cancel — cancel an order, with the reason
 * for it.
 *
 * The reason is required. The order is not cancelled until one has been
 * given, and the reason is written with the cancellation rather than
 * after it.
 *
 * The stock goes back on the shelf exactly once: an order that has
 * already been cancelled is refused, and the lines that have already had
 * their stock returned are not returned a second time.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { reasonCode?: unknown; reasonDetail?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = await cancelOrderWithReason({
    orderId: id,
    reasonCode: body.reasonCode,
    reasonDetail: body.reasonDetail,
    userId: guard.user.id,
  });

  if (!result.ok) {
    return fail(result.message, 400, result.field ? { field: result.field } : undefined);
  }

  return json({ ok: true, message: result.message, order: result.order });
}
