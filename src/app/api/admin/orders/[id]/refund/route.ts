import { fail, json, requireApiPermission } from "@/lib/api";
import { refundCancelledOrder } from "@/lib/order-dispatch";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/refund — refund a cancelled order.
 *
 * The money goes back through Razorpay's own refund API, against the
 * payment the order was paid with. The key secret stays on the server:
 * the credentials are read by the gateway module, and all that comes
 * back here is Razorpay's own refund id and the status it reported.
 *
 * A refund is made once. The claim is a row with a unique key on the
 * order, and Razorpay is asked what it has already done against the
 * payment before any money is sent, so a double tap, a second tab or a
 * retried request cannot send the money back twice.
 *
 * The status that comes back is Razorpay's, not the shop's opinion. A
 * refund it calls `pending` has not reached the customer yet, and the
 * shop does not say that it has.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { amount?: unknown };
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const raw = body.amount === undefined || body.amount === null ? undefined : Number(body.amount);

  const result = await refundCancelledOrder({
    orderId: id,
    amount: raw === undefined || Number.isNaN(raw) ? undefined : raw,
    userId: guard.user.id,
  });

  if (!result.ok) {
    return fail(result.message, 400, result.field ? { field: result.field } : undefined);
  }

  return json({
    ok: true,
    message: result.message,
    refundId: result.refundId ?? null,
    refundStatus: result.refundStatus ?? null,
    order: result.order,
  });
}
