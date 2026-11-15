import { fail, json, requireApiPermission } from "@/lib/api";
import { confirmOrderWithShipping } from "@/lib/order-dispatch";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/ship — confirm an order with its shipping
 * details.
 *
 * The order is not confirmed until the courier, the shipping method and
 * the tracking number are all on file. The details are checked on the
 * server, and the order only moves once they have passed.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: {
    courierPartner?: unknown;
    shippingMethod?: unknown;
    customShippingMethod?: unknown;
    trackingId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = await confirmOrderWithShipping({
    orderId: id,
    courierPartner: body.courierPartner,
    shippingMethod: body.shippingMethod,
    customShippingMethod: body.customShippingMethod,
    trackingId: body.trackingId,
    userId: guard.user.id,
  });

  if (!result.ok) {
    return fail(result.message, 400, result.field ? { field: result.field } : undefined);
  }

  return json({ ok: true, message: result.message, order: result.order });
}
