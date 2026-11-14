import { fail, json } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import { GATEWAY_NAME } from "@/lib/checkout";
import { getDb } from "@/lib/db";
import {
  claimEvent,
  claimPaymentAndMarkOrderPaid,
  recordEventOutcome,
} from "@/lib/gateway-records";
import {
  gatewayWebhooksConfigured,
  readWebhookEvent,
  verifyWebhookSignature,
} from "@/lib/gateway-webhook";
import { notifyOrderPlaced } from "@/lib/orders";
import {
  fetchGatewayOrder,
  fetchGatewayPayment,
} from "@/lib/payment-gateway";

/**
 * POST /api/webhooks/razorpay — the gateway saying what happened.
 *
 * A webhook is the gateway's own account of a payment, sent to the shop
 * so that the shop hears about it even when the customer's browser is
 * not there to report it. That is the case it exists for: a customer on a
 * train who loses signal halfway through a payment. The money still
 * moves; without this the shop would never know, and the customer would
 * have paid for nothing.
 *
 * The order of the work matters.
 *
 * First the signature is checked. The body is signed with the webhook
 * secret, and only the shop and the gateway know it, so a signature that
 * checks out is proof the gateway sent this. A body that cannot be
 * checked is not acted on at all.
 *
 * Then the delivery is claimed. Every webhook carries an id of its own,
 * and the gateway sends it again if it does not hear back — so the same
 * webhook can arrive two or three times. The claim is a row whose key is
 * that id: the first delivery wins, and the later ones do nothing.
 *
 * Then, and only then, the payment is checked against the gateway's own
 * API — is it captured, does it belong to this order, is it the amount
 * the order says is owed — and the order is marked as paid. The webhook
 * says what happened; the gateway's API is what proves it.
 */
export async function POST(request: Request) {
  if (!gatewayWebhooksConfigured()) {
    return fail(
      "The shop has not been given its webhook secret, so webhooks are not being accepted.",
      503
    );
  }

  // The body exactly as it arrived. It is signed as it was sent, so it
  // cannot be parsed and put back together first — the bytes have to be
  // the same bytes.
  const body = await request.text();

  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature({ body, signature })) {
    return fail("The webhook signature did not match, so it was not acted on.", 400);
  }

  const eventId = request.headers.get("x-razorpay-event-id");
  const event = readWebhookEvent({ body, eventId });
  if (!event) {
    return fail("The webhook could not be read, so it was not acted on.", 400);
  }

  // The claim. A webhook that has already been dealt with does nothing
  // the second time.
  const claimed = await claimEvent({
    eventId: event.eventId,
    eventType: event.event || "unknown",
    payload: body,
  });
  if (!claimed) {
    return json({ ok: true, outcome: "already_applied", event_id: event.eventId });
  }

  try {
    const outcome = await handleEvent(event);
    await recordEventOutcome(event.eventId, outcome.outcome);
    return json({ ok: true, outcome: outcome.outcome, event_id: event.eventId });
  } catch (err) {
    // The webhook could not be dealt with. The claim is given back, so
    // that the gateway can send it again — which is what it will do, and
    // what it is for.
    await recordEventOutcome(event.eventId, "failed");
    console.error(
      `[webhook] the event ${event.eventId} could not be dealt with:`,
      err
    );
    return fail("The webhook could not be dealt with.", 500);
  }
}

/**
 * What the shop does about a webhook.
 */
async function handleEvent(
  event: ReturnType<typeof readWebhookEvent>
): Promise<{ outcome: string }> {
  if (!event) return { outcome: "ignored" };

  // The events the shop acts on.
  //
  // `payment.captured` is the one that matters: the money is in.
  // `payment.failed` is recorded so that the shop can see a payment that
  // did not go through, but it does not touch the order — the browser
  // tells the customer about that, and the order is put away by the
  // endpoint that cancels it.
  if (event.event !== "payment.captured") {
    return { outcome: "ignored" };
  }

  if (!event.paymentId) return { outcome: "ignored" };

  // The gateway's own account of the payment, and of the order it
  // belongs to. They are asked for together — one wait, not two.
  const [payment, gatewayOrder] = await Promise.all([
    fetchGatewayPayment(event.paymentId),
    event.gatewayOrderId
      ? fetchGatewayOrder(event.gatewayOrderId)
      : Promise.resolve({
          ok: false as const,
          reason: "The webhook did not say which order it was about.",
          status: 400,
        }),
  ]);

  if (!payment.ok) {
    // The gateway does not know about this payment. It may be a test, or
    // it may be one the gateway has not finished writing down. Either
    // way, the shop does not act on it.
    return { outcome: "rejected" };
  }
  if (!gatewayOrder.ok) return { outcome: "rejected" };

  if (payment.payment.status !== "captured") {
    return { outcome: "ignored" };
  }
  if (payment.payment.orderId !== event.gatewayOrderId) {
    return { outcome: "rejected" };
  }

  // The gateway's order carries the shop's own order id as its receipt.
  const shopOrderId = gatewayOrder.order.receipt;
  if (!shopOrderId) return { outcome: "rejected" };

  // The shop's own order, and what it says is owed.
  const order = await getShopOrder(shopOrderId);
  if (!order) return { outcome: "rejected" };

  const expected = Math.round(order.total * 100);
  if (payment.payment.amount !== expected) {
    // The money is not the money that was owed. The shop does not mark
    // the order as paid; this is a thing for a person to look at.
    console.error(
      `[webhook] the payment ${payment.payment.id} was for ${payment.payment.amount} ` +
        `but the order ${shopOrderId} is for ${expected}`
    );
    return { outcome: "rejected" };
  }

  // The claim, and the marking of the order as paid, together. The
  // payment id is the key of the claim, so a payment is applied once.
  const method = payment.payment.method || GATEWAY_NAME;
  const applied = await claimPaymentAndMarkOrderPaid({
    payment: {
      paymentId: payment.payment.id,
      orderId: shopOrderId,
      gatewayOrderId: event.gatewayOrderId,
      amount: payment.payment.amount,
      currency: payment.payment.currency,
      status: payment.payment.status,
      method,
    },
    method,
  });

  if (!applied) {
    // Somebody else got there first — the browser, most likely, which
    // is the better way round. The order is paid for either way.
    const current = await getShopOrder(shopOrderId);
    if (current?.payment_reference === payment.payment.id) {
      return { outcome: "already_applied" };
    }
    return { outcome: "rejected" };
  }

  // The customer is told, and the basket is emptied. The notification is
  // deduplicated, so a customer who was also told by the browser's own
  // call is not told twice.
  await notifyOrderPlaced(shopOrderId);
  await clearCart();

  return { outcome: "applied" };
}

/**
 * The shop's own order, in the shape the webhook needs.
 */
async function getShopOrder(
  orderId: string
): Promise<{ total: number; payment_reference: string | null } | null> {
  const row = (await getDb()
    .prepare("SELECT total, payment_reference FROM orders WHERE id = ?")
    .get(orderId)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    total: Number(row.total),
    payment_reference: row.payment_reference
      ? String(row.payment_reference)
      : null,
  };
}
