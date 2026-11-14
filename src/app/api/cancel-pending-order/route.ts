import { fail, json } from "@/lib/api";
import { applyOrderStatus, getOrder } from "@/lib/orders";
import { pendingOrderIsOurs } from "@/lib/pending-order";
import { readSessionId } from "@/lib/session";

/**
 * POST /api/cancel-pending-order — put away an order that was not paid for.
 *
 * When the customer closes the payment window without paying, the order
 * the shop wrote for them is not a real order: nothing was paid, nothing
 * should be sent, and the stock has to go back on the shelf. This says
 * so.
 *
 * The order id alone is not enough to do it — an order id is a receipt,
 * and anyone who has seen one can write it down. The request has to come
 * from the same browser that started the payment, and it has to carry
 * the token that says so.
 *
 * An order that has been paid for is never touched here: a payment that
 * went through is settled, and money that has been taken is not this
 * endpoint's to give back.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Send the order details as JSON.", 400);
  }

  const orderId = String((body as { order_id?: unknown })?.order_id ?? "").trim();
  const token = String((body as { pending_token?: unknown })?.pending_token ?? "").trim();
  if (!orderId) return fail("Which order?", 400);

  const sessionId = await readSessionId();
  if (!sessionId || !pendingOrderIsOurs({ orderId, sessionId, token })) {
    return fail("That order cannot be cancelled from here.", 403);
  }

  const order = await getOrder(orderId);
  if (!order) return fail("That order no longer exists.", 404);
  if (order.payment_reference) {
    return fail("This order has been paid for, so it cannot be cancelled here.", 409);
  }
  if (order.status !== "confirmed") {
    return fail("That order is no longer waiting for a payment.", 409);
  }

  // Cancelling gives the stock back, because the goods never left.
  const result = await applyOrderStatus(orderId, "cancelled", null, {
    // Nobody is told: they were told on the screen that no order was
    // placed, and an email about an order they never paid for is only
    // noise.
    notify: false,
  });
  if (!result.ok) {
    return fail(result.message ?? "That order could not be cancelled.", 409);
  }

  return json({ ok: true, order_id: orderId });
}
