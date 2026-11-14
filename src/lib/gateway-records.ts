/**
 * What the shop knows about the payments it has taken.
 *
 * The gateway's API is the truth about whether money moved. This is the
 * shop's own record of what it has already done about it, and it exists
 * for one reason: a payment must be applied to an order once and once
 * only.
 *
 * Two requests can arrive carrying the same payment — the customer
 * double-taps, the browser retries after the network wobbles, the
 * gateway sends the webhook and the browser calls the verification
 * endpoint at the same moment. All three mean the same thing: one
 * payment, one order, one confirmation email.
 *
 * The way that is arranged is by claiming. A payment is claimed by
 * writing its row, and the payment id is the key of that row. The first
 * request to write the row wins; every later request finds the row
 * already there and leaves the order alone. The same goes for a webhook:
 * the event id is the key, so a webhook that arrives twice is acted on
 * once.
 *
 * The claim is made *before* the order is marked as paid, and it is made
 * in the same transaction. If the claim cannot be made, the order is
 * not touched.
 */

import { createHash } from "node:crypto";
import { getDb, withTransaction } from "./db";
import type { Db } from "./db";

/** The gateway the shop pays through. */
export const GATEWAY = "razorpay";

/**
 * The key that makes a repeated checkout attempt the same attempt.
 *
 * The browser sends an id for the attempt — one per visit to the
 * checkout, kept for as long as the attempt lasts. The shop mixes it
 * with the browser's session id and hashes the result, so that the key
 * cannot be guessed from one browser's key to another's, and so that the
 * key says nothing about the customer.
 *
 * Two requests with the same attempt are the same attempt, and the
 * gateway is told so through this key. That is what stops a double tap
 * on "Pay now" from making two orders to pay against.
 */
export function checkoutIdempotencyKey(input: {
  sessionId: string;
  attemptId: string;
}): string {
  return createHash("sha256")
    .update(`${input.sessionId}|${input.attemptId}`, "utf8")
    .digest("hex");
}

/**
 * The shop's own order id for an attempt.
 *
 * It is worked out from the attempt rather than made at random, so that
 * every request for the same attempt comes up with the same id. That is
 * what stops two requests arriving at the same moment from writing two
 * orders: they both try to write the same one, and the second finds it
 * already there.
 *
 * Ten characters is more than the six a random order id carries. A
 * random id of six characters has thirty bits of room in it, and two
 * orders that collided would be one order — which would be a customer's
 * order lost into somebody else's. Ten characters of the same alphabet
 * is fifty bits, and the ids are not random anyway: they come from a
 * hash of a session id and an attempt id, so they are as unlikely to
 * collide as the things they are made from.
 */
export function orderIdForAttempt(idempotencyKey: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const digest = createHash("sha256")
    .update(idempotencyKey, "utf8")
    .digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[digest[i] % alphabet.length];
  return `PF${out}`;
}

/**
 * Claims a checkout attempt.
 *
 * The first request to write the row owns the attempt; every other one
 * is told to wait for it.
 *
 * The row is the claim because Razorpay's order API has no idempotency
 * of its own: without it, four requests arriving at the same moment
 * would each make an order at the gateway, and three of them would be
 * left behind as orphans.
 */
export async function claimCheckoutAttempt(input: {
  attemptKey: string;
  orderId: string;
  amount: number;
  currency: string;
}): Promise<{ won: true } | { won: false; orderId: string }> {
  const claimed = await getDb()
    .prepare(
      `INSERT INTO checkout_attempts
         (attempt_key, order_id, amount, currency)
       VALUES (?,?,?,?)
       ON CONFLICT (attempt_key) DO NOTHING`
    )
    .run(input.attemptKey, input.orderId, input.amount, input.currency);

  if (claimed.changes > 0) return { won: true };

  const row = (await getDb()
    .prepare("SELECT order_id FROM checkout_attempts WHERE attempt_key = ?")
    .get(input.attemptKey)) as Record<string, unknown> | undefined;

  return { won: false, orderId: row ? String(row.order_id) : input.orderId };
}

/**
 * The gateway's order for an attempt, once there is one.
 */
export async function gatewayOrderForAttempt(
  attemptKey: string
): Promise<{ orderId: string; gatewayOrderId: string; amount: number; currency: string } | null> {
  const row = (await getDb()
    .prepare(
      `SELECT attempt_key, order_id, gateway_order_id, amount, currency
         FROM checkout_attempts WHERE attempt_key = ?`
    )
    .get(attemptKey)) as Record<string, unknown> | undefined;
  if (!row || !row.gateway_order_id) return null;
  return {
    orderId: String(row.order_id),
    gatewayOrderId: String(row.gateway_order_id),
    amount: Number(row.amount),
    currency: String(row.currency),
  };
}

/**
 * Says that the attempt is finished, and what it made.
 *
 * The write only lands if the row is still waiting for it, so a request
 * that has taken over an abandoned attempt cannot overwrite the one
 * that finally finished it.
 */
export async function settleCheckoutAttempt(input: {
  attemptKey: string;
  gatewayOrderId: string;
}): Promise<boolean> {
  const updated = await getDb()
    .prepare(
      `UPDATE checkout_attempts SET gateway_order_id = ?
        WHERE attempt_key = ? AND gateway_order_id IS NULL`
    )
    .run(input.gatewayOrderId, input.attemptKey);
  return updated.changes > 0;
}

/**
 * Gives up an attempt, so that the next request for it can start again.
 *
 * Used when the attempt could not be carried out — the gateway was
 * unreachable, or the stock ran out. The attempt is not a failure: it
 * is a thing somebody has to try again.
 */
export async function releaseCheckoutAttempt(attemptKey: string): Promise<void> {
  await getDb()
    .prepare(
      "DELETE FROM checkout_attempts WHERE attempt_key = ? AND gateway_order_id IS NULL"
    )
    .run(attemptKey);
}

export type GatewayOrderRecord = {
  /** The gateway's own id for the order. */
  gatewayOrderId: string;
  /** The shop's own order it was made for. */
  orderId: string;
  /** What is to be paid, in paise. */
  amount: number;
  currency: string;
  status: string;
  idempotencyKey: string | null;
};

export type GatewayPaymentRecord = {
  paymentId: string;
  orderId: string;
  gatewayOrderId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
};

/**
 * The gateway's order for a shop order, if the shop has made one.
 */
export async function findGatewayOrder(
  orderId: string
): Promise<GatewayOrderRecord | null> {
  const row = (await getDb()
    .prepare(
      `SELECT gateway_order_id, order_id, amount, currency, status, idempotency_key
         FROM gateway_orders WHERE order_id = ?`
    )
    .get(orderId)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    gatewayOrderId: String(row.gateway_order_id),
    orderId: String(row.order_id),
    amount: Number(row.amount),
    currency: String(row.currency),
    status: String(row.status),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  };
}

/**
 * The gateway's order made under a given idempotency key.
 *
 * This is how a repeated request for a checkout that has already started
 * is answered with the order it started with, rather than with a second
 * order to pay against.
 */
export async function findGatewayOrderByKey(
  idempotencyKey: string
): Promise<GatewayOrderRecord | null> {
  const row = (await getDb()
    .prepare(
      `SELECT gateway_order_id, order_id, amount, currency, status, idempotency_key
         FROM gateway_orders WHERE idempotency_key = ?`
    )
    .get(idempotencyKey)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    gatewayOrderId: String(row.gateway_order_id),
    orderId: String(row.order_id),
    amount: Number(row.amount),
    currency: String(row.currency),
    status: String(row.status),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  };
}

/**
 * Writes down the gateway's order, so that the shop can find it again.
 *
 * The write is "if it is not there". The row has two unique keys — the
 * gateway's order id and the shop's order id — and a repeated request
 * collides on whichever it happens to be, so the conflict is left
 * unnamed: a conflict on any of them means the same row is already
 * there, which is exactly what was wanted.
 *
 * The row that is actually stored is read back, so that a caller can
 * see what is on file rather than what it tried to write. That matters
 * because a shop order with a *different* gateway order against it
 * would mean the shop had made two orders to pay against for one
 * order — which should never happen, and which is worth saying out
 * loud rather than hiding.
 */
export async function recordGatewayOrder(
  record: GatewayOrderRecord
): Promise<{ ok: true; order: GatewayOrderRecord } | { ok: false; reason: string }> {
  await getDb()
    .prepare(
      `INSERT INTO gateway_orders
         (gateway_order_id, order_id, gateway, idempotency_key, amount, currency, status)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT DO NOTHING`
    )
    .run(
      record.gatewayOrderId,
      record.orderId,
      GATEWAY,
      record.idempotencyKey,
      record.amount,
      record.currency,
      record.status
    );

  const stored = await findGatewayOrder(record.orderId);
  if (!stored) {
    return {
      ok: false,
      reason: "The gateway's order could not be written down.",
    };
  }
  if (stored.gatewayOrderId !== record.gatewayOrderId) {
    return {
      ok: false,
      reason:
        `The shop's order ${record.orderId} is already against the gateway's ` +
        `order ${stored.gatewayOrderId}, not ${record.gatewayOrderId}.`,
    };
  }
  return { ok: true, order: stored };
}

/**
 * Claims a payment for an order.
 *
 * The claim is the payment's own row, and the payment id is its key. A
 * payment that has already been claimed comes back as `false`, and the
 * caller leaves the order alone.
 *
 * It runs inside a transaction so that the claim and the marking of the
 * order as paid are one thing: if the order cannot be marked as paid,
 * the claim is undone with it.
 */
export async function claimPaymentAndMarkOrderPaid(input: {
  payment: GatewayPaymentRecord;
  /** The method the customer paid by, as the gateway writes it. */
  method: string | null;
}): Promise<boolean> {
  return withTransaction(async (db) => {
    // The claim. `ON CONFLICT DO NOTHING` means a payment that is already
    // recorded leaves `changes` at zero, and this returns false.
    const claimed = await db
      .prepare(
        `INSERT INTO gateway_payments
           (payment_id, order_id, gateway_order_id, gateway, amount, currency,
            status, method, captured_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT (payment_id) DO NOTHING`
      )
      .run(
        input.payment.paymentId,
        input.payment.orderId,
        input.payment.gatewayOrderId,
        GATEWAY,
        input.payment.amount,
        input.payment.currency,
        input.payment.status,
        input.method,
        input.payment.status === "captured" ? new Date().toISOString() : null
      );

    if (!claimed.changes) return false;

    // The order is marked as paid only now, and only if it is not
    // already paid for by a different payment. A second payment for an
    // order that has already been paid for is refused rather than
    // quietly overwriting the first.
    const updated = await db
      .prepare(
        `UPDATE orders
            SET payment_gateway = ?, payment_reference = ?, payment_method = ?
          WHERE id = ? AND (payment_reference IS NULL OR payment_reference = ?)`
      )
      .run(
        GATEWAY,
        input.payment.paymentId,
        input.method ?? GATEWAY,
        input.payment.orderId,
        input.payment.paymentId
      );

    // The payment was claimed but the order would not take it — which
    // means the order has already been paid for by another payment. The
    // claim is given back, so the record matches the world.
    if (!updated.changes) {
      const existing = (await db
        .prepare("SELECT payment_reference FROM orders WHERE id = ?")
        .get(input.payment.orderId)) as Record<string, unknown> | undefined;
      if (existing?.payment_reference &&
          String(existing.payment_reference) !== input.payment.paymentId) {
        await db
          .prepare("DELETE FROM gateway_payments WHERE payment_id = ?")
          .run(input.payment.paymentId);
        return false;
      }
    }

    return true;
  });
}

/**
 * The payment recorded for an order, if there is one.
 */
export async function findPayment(
  paymentId: string
): Promise<GatewayPaymentRecord | null> {
  const row = (await getDb()
    .prepare(
      `SELECT payment_id, order_id, gateway_order_id, amount, currency, status, method
         FROM gateway_payments WHERE payment_id = ?`
    )
    .get(paymentId)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    paymentId: String(row.payment_id),
    orderId: String(row.order_id),
    gatewayOrderId: row.gateway_order_id ? String(row.gateway_order_id) : null,
    amount: Number(row.amount),
    currency: String(row.currency),
    status: String(row.status),
    method: row.method ? String(row.method) : null,
  };
}

/**
 * Claims a webhook delivery.
 *
 * The event id is the key. A delivery that has already been claimed
 * comes back as `false`, and nothing is done about it a second time.
 */
export async function claimEvent(input: {
  eventId: string;
  eventType: string;
  payload: string;
}): Promise<boolean> {
  const claimed = await getDb()
    .prepare(
      `INSERT INTO gateway_events (event_id, event_type, gateway, payload, outcome)
       VALUES (?,?,?,?,?)
       ON CONFLICT (event_id) DO NOTHING`
    )
    .run(input.eventId, input.eventType, GATEWAY, input.payload, "claimed");
  return claimed.changes > 0;
}

/**
 * Says what became of a webhook, once it has been dealt with.
 */
export async function recordEventOutcome(
  eventId: string,
  outcome: string
): Promise<void> {
  await getDb()
    .prepare("UPDATE gateway_events SET outcome = ? WHERE event_id = ?")
    .run(outcome, eventId);
}

/**
 * The webhooks the shop has been sent, most recent first.
 *
 * The back office asks for this when a payment is said to have gone
 * missing: the webhook is the gateway's own account of what happened,
 * and it is the first place to look.
 */
export async function recentEvents(
  limit = 50
): Promise<
  {
    eventId: string;
    eventType: string;
    outcome: string;
    receivedAt: string;
  }[]
> {
  const rows = (await getDb()
    .prepare(
      `SELECT event_id, event_type, outcome, received_at
         FROM gateway_events ORDER BY received_at DESC LIMIT ?`
    )
    .all(limit)) as Record<string, unknown>[];
  return rows.map((r) => ({
    eventId: String(r.event_id),
    eventType: String(r.event_type),
    outcome: String(r.outcome),
    receivedAt: String(r.received_at),
  }));
}
