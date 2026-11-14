/**
 * The gateway's webhooks.
 *
 * A webhook is the gateway saying "this happened", sent to the shop's
 * own address so that the shop hears about it whether or not the
 * customer's browser was still open. It matters most when the browser
 * was not: a customer on a train loses signal halfway through a
 * payment, the payment goes through anyway, and without a webhook the
 * shop would never know.
 *
 * A webhook is not trusted because it arrived. It is trusted because it
 * carries a signature made with a secret that only the shop and the
 * gateway know — the same idea as the signature on a payment, but over
 * the whole body rather than over two ids, and made with a *different*
 * secret, the webhook secret.
 *
 * That secret is separate from the key secret on purpose. The key secret
 * signs payments; the webhook secret signs webhooks. A secret that does
 * one job should not be able to do the other, and Razorpay issues them
 * separately for that reason.
 *
 * The comparison is made in constant time, so that it cannot be worked
 * out one character at a time by watching how long it takes.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The secret the gateway signs its webhooks with.
 *
 * It comes from the environment and from nowhere else. When the shop
 * has not been given one, webhooks are refused: a webhook that cannot
 * be checked is not one the shop should act on.
 */
export function gatewayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET || null;
}

/** Whether the shop is ready to receive webhooks. */
export function gatewayWebhooksConfigured(): boolean {
  return Boolean(gatewayWebhookSecret());
}

/**
 * Checks the signature the gateway put on a webhook.
 *
 * The signature is an HMAC-SHA256 of the raw body, made with the webhook
 * secret, and it is compared with the one in the `x-razorpay-signature`
 * header. The raw body is what is signed, so it has to be the bytes
 * that arrived — a body that has been parsed and put back together is
 * not necessarily the same bytes, and the signature would not match.
 */
export function verifyWebhookSignature(input: {
  /** The body exactly as it arrived. */
  body: string;
  /** The signature from the header. */
  signature: string | null;
}): boolean {
  const secret = gatewayWebhookSecret();
  if (!secret) return false;
  if (!input.signature) return false;

  const expected = createHmac("sha256", secret)
    .update(input.body, "utf8")
    .digest("hex");

  return sameBytes(expected, input.signature);
}

/**
 * Two strings, compared without letting the time give them away.
 */
function sameBytes(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The webhook's payload, as the shop reads it.
 *
 * Only the parts the shop acts on are named. The gateway sends more
 * than this, and the rest is kept as it arrived rather than guessed at.
 */
export type GatewayWebhookEvent = {
  /** The event's own id, which is what makes a delivery unique. */
  eventId: string;
  /** What happened — `payment.captured`, `payment.failed` and so on. */
  event: string;
  /** The gateway's order the event is about. */
  gatewayOrderId: string | null;
  /** The gateway's payment the event is about. */
  paymentId: string | null;
  /** What was paid, in paise, when the event carries it. */
  amount: number | null;
  currency: string | null;
  /** The gateway's own account of the payment's state. */
  paymentStatus: string | null;
  /** How the customer paid, when the event carries it. */
  method: string | null;
  /** The shop's own order id, when the gateway has been told it. */
  receipt: string | null;
};

/**
 * Reads a webhook's body.
 *
 * Returns nothing when the body is not a webhook the shop understands.
 * A body it cannot read is a body it must not act on.
 */
export function readWebhookEvent(input: {
  body: string;
  /** The event id from the `x-razorpay-event-id` header. */
  eventId: string | null;
}): GatewayWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as Record<string, unknown>;
  const payload = (root.payload ?? {}) as Record<string, unknown>;
  const payment = (payload.payment ?? {}) as Record<string, unknown>;
  const order = (payload.order ?? {}) as Record<string, unknown>;
  const entity = (payload.entity ?? {}) as Record<string, unknown>;

  const event =
    typeof root.event === "string"
      ? root.event
      : typeof entity.event === "string"
        ? entity.event
        : "";

  const eventId =
    input.eventId?.trim() ||
    (typeof root.id === "string" ? root.id : "") ||
    // A body with no id of its own is still unique if it is the same
    // body — the same event arrives as the same bytes.
    createHmac("sha256", gatewayWebhookSecret() ?? "")
      .update(input.body, "utf8")
      .digest("hex");

  const notes = (order.notes ?? {}) as Record<string, unknown>;
  const receipt =
    typeof order.receipt === "string"
      ? order.receipt
      : typeof notes.shop_order_id === "string"
        ? notes.shop_order_id
        : null;

  const amountRaw = payment.amount ?? order.amount;

  return {
    eventId,
    event,
    gatewayOrderId:
      typeof payment.order_id === "string"
        ? payment.order_id
        : typeof order.id === "string"
          ? order.id
          : null,
    paymentId:
      typeof payment.id === "string"
        ? payment.id
        : typeof entity.id === "string"
          ? entity.id
          : null,
    amount:
      typeof amountRaw === "number" && Number.isFinite(amountRaw)
        ? amountRaw
        : null,
    currency:
      typeof payment.currency === "string"
        ? payment.currency
        : typeof order.currency === "string"
          ? order.currency
          : null,
    paymentStatus:
      typeof payment.status === "string"
        ? payment.status
        : typeof entity.status === "string"
          ? entity.status
          : null,
    method: typeof payment.method === "string" ? payment.method : null,
    receipt,
  };
}
