/**
 * Taking a payment.
 *
 * The shop takes payment through Razorpay's Standard Checkout. The
 * browser opens Razorpay's own checkout, the customer pays there — UPI,
 * card, netbanking, wallet, EMI — and Razorpay hands back three things:
 * the order it made, the payment it took, and a signature over the two.
 *
 * The signature is what makes the payment real. It is an HMAC-SHA256 of
 * the order id and the payment id, made with the key secret, and only the
 * shop and the gateway know the secret. A signature that checks out is
 * therefore proof that the gateway really took this payment for this
 * order. Nothing is marked as paid until that check has passed, and the
 * check is made in constant time so that it cannot be worked out by
 * timing it.
 *
 * The key secret never leaves this module's callers. It is read from the
 * environment, used to sign, and never sent to the browser.
 *
 * The gateway's own API is written in paise — five hundred rupees is
 * 50000 — while the shop keeps its money in rupees throughout. The
 * conversion happens here, at the edge, and nowhere else.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import {
  gatewayApiBase,
  gatewayCurrency,
  gatewayKeyId,
  gatewayKeySecret,
} from "./gateway-config";

/**
 * The gateway client.
 *
 * It is made once and kept: the credentials do not change while the
 * shop is running, and making a client per request would be waste.
 */
let client: Razorpay | null = null;

function gateway(): Razorpay | null {
  const key_id = gatewayKeyId();
  const key_secret = gatewayKeySecret();
  if (!key_id || !key_secret) return null;
  if (!client) {
    client = new Razorpay({ key_id, key_secret });

    // The SDK fixes the address it talks to and does not read one from
    // the caller, so the address is put on the request itself. It is
    // the same call, only pointed somewhere else — which is how the
    // shop is pointed at a mock of the gateway when it is being tested.
    const request = client.api as unknown as {
      rq: { defaults: { baseURL: string } };
    };
    request.rq.defaults.baseURL = gatewayApiBase();
  }
  return client;
}

/** The smallest amount the gateway will take, in paise. */
export const MINIMUM_AMOUNT = 100;

export type GatewayOrder = {
  /** The gateway's own id for the order. */
  orderId: string;
  /** What is to be paid, in paise. */
  amount: number;
  /** The currency, as the gateway writes it. */
  currency: string;
};

export type GatewayFailure = {
  ok: false;
  /** Why it did not work, in words the customer can be shown. */
  reason: string;
  /** The status to answer with. */
  status: number;
};

/**
 * Asks the gateway for an order to pay against.
 *
 * The amount is in paise, because that is the gateway's own unit. The
 * receipt is the shop's own reference for the payment — the shop's order
 * id — and it is what ties the payment back to the order it belongs to.
 *
 * The receipt is the shop's own reference for the payment — the shop's
 * order id — and it is what ties the payment back to the order it
 * belongs to.
 *
 * There is no idempotency key here, because the gateway's order API has
 * none to give: `POST /v1/orders` makes a new order every time, whatever
 * header is sent with it. The shop stops a repeated request from making
 * a second order itself, before it ever gets here — see
 * `checkout_attempts` in `src/lib/gateway-records.ts`.
 */
export async function createGatewayOrder(input: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ ok: true; order: GatewayOrder } | GatewayFailure> {
  const rzp = gateway();
  if (!rzp) {
    return {
      ok: false,
      reason:
        "The shop has not been given its payment gateway keys, so it cannot take money online.",
      status: 503,
    };
  }

  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount < MINIMUM_AMOUNT) {
    return {
      ok: false,
      reason: "The order total is too small to charge.",
      status: 400,
    };
  }

  try {
    const order = await rzp.orders.create({
      amount,
      currency: gatewayCurrency(),
      receipt: input.receipt,
      ...(input.notes ? { notes: input.notes } : {}),
    });

    return {
      ok: true,
      order: {
        orderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
      },
    };
  } catch (err) {
    return { ok: false, reason: gatewayErrorMessage(err), status: gatewayErrorStatus(err) };
  }
}

/**
 * Checks the signature the gateway gave back.
 *
 * The signature is made over the order id and the payment id, joined by
 * a pipe, and signed with the key secret. It is compared in constant
 * time: a comparison that gives itself away by how long it takes is a
 * comparison that can be worked out one character at a time.
 */
export function verifyGatewaySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = gatewayKeySecret();
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
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
 * Asks the gateway about an order it has already made.
 *
 * This is how the shop finds out which of its own orders a payment
 * belongs to: the receipt on the gateway's order is the shop's order id.
 */
export async function fetchGatewayOrder(
  orderId: string
): Promise<
  | { ok: true; order: { id: string; amount: number; amountPaid: number; currency: string; receipt?: string; status?: string } }
  | GatewayFailure
> {
  const rzp = gateway();
  if (!rzp) {
    return {
      ok: false,
      reason: "The shop has not been given its payment gateway keys.",
      status: 503,
    };
  }

  try {
    const order = await rzp.orders.fetch(orderId);
    return {
      ok: true,
      order: {
        id: order.id,
        amount: Number(order.amount),
        amountPaid: Number(order.amount_paid),
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
      },
    };
  } catch (err) {
    return { ok: false, reason: gatewayErrorMessage(err), status: gatewayErrorStatus(err) };
  }
}

/**
 * Asks the gateway about a payment it has already taken.
 *
 * The answer is what makes the difference between a customer who has
 * paid and one who has only said they would: the gateway's own status
 * says whether the money is in.
 */
export async function fetchGatewayPayment(
  paymentId: string
): Promise<
  | {
      ok: true;
      payment: {
        id: string;
        orderId: string;
        amount: number;
        currency: string;
        status: string;
        method?: string;
      };
    }
  | GatewayFailure
> {
  const rzp = gateway();
  if (!rzp) {
    return {
      ok: false,
      reason: "The shop has not been given its payment gateway keys.",
      status: 503,
    };
  }

  try {
    const payment = await rzp.payments.fetch(paymentId);
    return {
      ok: true,
      payment: {
        id: payment.id,
        orderId: payment.order_id,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
      },
    };
  } catch (err) {
    return { ok: false, reason: gatewayErrorMessage(err), status: gatewayErrorStatus(err) };
  }
}

/**
 * What the gateway said went wrong, in words.
 */
function gatewayErrorMessage(err: unknown): string {
  const e = err as {
    error?: { description?: string; message?: string };
    message?: string;
    response?: { body?: { error?: { description?: string; message?: string } } };
  };
  return (
    e?.error?.description ??
    e?.response?.body?.error?.description ??
    e?.error?.message ??
    e?.response?.body?.error?.message ??
    e?.message ??
    "The payment gateway could not be reached."
  );
}

/**
 * The status to answer the customer with.
 *
 * The gateway refusing the shop's own credentials is a different thing
 * from the gateway being unwell, and the shop needs to be able to tell
 * them apart: one is fixed by changing a key, the other by waiting.
 *
 * Anything else the gateway refuses is the customer's answer rather
 * than a fault in the shop — a payment or an order it has never heard
 * of comes back as 400 or 404, and either way the thing being paid for
 * is not there.
 */
function gatewayErrorStatus(err: unknown): number {
  const e = err as { statusCode?: number; response?: { status?: number } };
  const status = e?.statusCode ?? e?.response?.status ?? 500;
  if (status === 401 || status === 403) return 401;
  if (status >= 400 && status < 500) return 400;
  return 500;
}
