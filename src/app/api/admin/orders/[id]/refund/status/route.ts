import { fail, json, requireApiPermission } from "@/lib/api";
import { refreshRefundStatus } from "@/lib/order-dispatch";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/refund/status — ask Razorpay where a
 * refund has got to.
 *
 * A refund takes time to reach the customer's original payment method,
 * and the shop does not guess how long. This asks Razorpay, and answers
 * with what Razorpay says.
 */
export async function POST(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const result = await refreshRefundStatus({ orderId: id, userId: guard.user.id });
  if (!result.ok) return fail(result.message, 400);

  return json({
    ok: true,
    message: result.message,
    refundId: result.refundId ?? null,
    refundStatus: result.refundStatus ?? null,
    order: result.order,
  });
}
