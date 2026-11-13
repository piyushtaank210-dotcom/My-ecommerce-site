import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { applyOrderStatus, getOrder } from "./orders";
import { notifyCustomerAboutOrder } from "./notifications";
import type { Order } from "./types";
import type {
  CancellationDispatchState,
  CancellationStatus,
  OrderCancellation,
} from "./cancellation-status";

export * from "./cancellation-status";

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

export function generateCancellationId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `CAN-${out}`;
}

function mapCancellationRow(r: Row): OrderCancellation {
  return {
    id: str(r.id),
    order_id: str(r.order_id),
    user_id: r.user_id === null ? null : num(r.user_id),
    dispatch_state: (str(r.dispatch_state) as CancellationDispatchState) || "before_dispatch",
    reason: str(r.reason),
    status: (str(r.status) as CancellationStatus) || "requested",
    admin_notes: strOrNull(r.admin_notes),
    rejection_reason: strOrNull(r.rejection_reason),
    refund_amount: num(r.refund_amount),
    refund_status: (str(r.refund_status) as OrderCancellation["refund_status"]) || "none",
    refund_reference: strOrNull(r.refund_reference),
    decided_at: strOrNull(r.decided_at),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    customer_name: strOrNull(r.customer_name) ?? undefined,
    customer_email: strOrNull(r.customer_email) ?? undefined,
  };
}

/**
 * Whether an order can be cancelled, and where it was when it was asked.
 *
 * An order that has been delivered is not cancelled at all — it is
 * returned or replaced under the return rules, which are set out in the
 * customer's policy.
 */
export function cancellationEligibility(order: Order): {
  canRequest: boolean;
  dispatchState: CancellationDispatchState;
  reason?: string;
} {
  if (order.status === "delivered") {
    return {
      canRequest: false,
      dispatchState: "after_delivery",
      reason:
        "This order has been delivered, so it is not cancelled — it is returned or replaced under our return rules.",
    };
  }
  if (order.status === "cancelled") {
    return {
      canRequest: false,
      dispatchState: "before_dispatch",
      reason: "This order has already been cancelled.",
    };
  }
  if (order.status === "shipped") {
    return {
      canRequest: true,
      dispatchState: "after_dispatch",
      reason:
        "This order has already shipped. We will look at your request, and cancellation at this stage is subject to the shipping and return process.",
    };
  }
  return {
    canRequest: true,
    dispatchState: "before_dispatch",
    reason: "This order has not shipped yet, so it can be cancelled.",
  };
}

export async function getCancellation(id: string): Promise<OrderCancellation | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `SELECT c.*, o.name AS customer_name, o.email AS customer_email
       FROM order_cancellations c
       JOIN orders o ON o.id = c.order_id
       WHERE c.id = ?`
    )
    .get(id)) as Row | undefined;
  return row ? mapCancellationRow(row) : null;
}

export async function getCancellationForOrder(orderId: string): Promise<OrderCancellation | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `SELECT c.*, o.name AS customer_name, o.email AS customer_email
       FROM order_cancellations c
       JOIN orders o ON o.id = c.order_id
       WHERE c.order_id = ?
       ORDER BY c.created_at DESC
       LIMIT 1`
    )
    .get(orderId)) as Row | undefined;
  return row ? mapCancellationRow(row) : null;
}

export async function listCancellations(status?: string): Promise<OrderCancellation[]> {
  const db = getDb();
  const rows = (
    status
      ? (await db
          .prepare(
            `SELECT c.*, o.name AS customer_name, o.email AS customer_email
             FROM order_cancellations c
             JOIN orders o ON o.id = c.order_id
             WHERE c.status = ?
             ORDER BY c.created_at DESC`
          )
          .all(status))
      : (await db
          .prepare(
            `SELECT c.*, o.name AS customer_name, o.email AS customer_email
             FROM order_cancellations c
             JOIN orders o ON o.id = c.order_id
             ORDER BY c.created_at DESC`
          )
          .all())
  ) as Row[];
  return rows.map(mapCancellationRow);
}

/**
 * The customer asks for an order to be cancelled.
 *
 * The request is recorded either way. What happens to the order is the
 * back office's decision, and the reason they give is kept with it.
 */
export async function createCancellationRequest(input: {
  orderId: string;
  userId: number | null;
  reason: string;
  dispatchState: CancellationDispatchState;
}): Promise<{ ok: boolean; message: string; id?: string }> {
  const db = getDb();
  const reason = input.reason.trim();

  if (!reason) {
    return { ok: false, message: "Tell us why you want to cancel." };
  }

  const order = (await getOrder(input.orderId));
  if (!order) return { ok: false, message: "Order not found." };

  const eligibility = cancellationEligibility(order);
  if (!eligibility.canRequest) {
    return { ok: false, message: eligibility.reason ?? "This order cannot be cancelled." };
  }

  const existing = (await getCancellationForOrder(input.orderId));
  if (existing && existing.status === "requested") {
    return {
      ok: false,
      message: `You have already asked us to cancel this order (${existing.id}). We are looking at it.`,
    };
  }

  const id = generateCancellationId();
  (await db.prepare(
    `INSERT INTO order_cancellations
      (id, order_id, user_id, dispatch_state, reason, status)
     VALUES (?, ?, ?, ?, ?, 'requested')`
  ).run(id, input.orderId, input.userId, input.dispatchState, reason));

  // The customer is told their request is recorded, and what happens
  // next.
  await notifyCustomerAboutOrder({
    userId: input.userId,
    email: order.email,
    orderId: input.orderId,
    kind: "cancellation_requested",
    title: `We have your cancellation request for order ${input.orderId}`,
    body:
      eligibility.dispatchState === "after_dispatch"
        ? `We have your request to cancel order ${input.orderId}. This order has already shipped, so we will look at it and come back to you.`
        : `We have your request to cancel order ${input.orderId}. We will confirm it and any refund shortly.`,
  });

  return {
    ok: true,
    id,
    message:
      eligibility.dispatchState === "after_dispatch"
        ? "Your request has been recorded. This order has already shipped, so we will look at it and come back to you."
        : "Your request has been recorded. We will confirm the cancellation and any refund shortly.",
  };
}

/**
 * The back office agrees to the cancellation.
 *
 * The order is cancelled and the stock is dealt with by the same code
 * that handles an order cancelled by the back office. If money has been
 * taken, the refund is recorded as *pending* — approving a refund is a
 * promise, and only the payment provider's confirmation makes it a fact.
 */
export async function approveCancellation(
  id: string,
  staffUser: { id: number; name: string },
  input: { notes?: string; refundAmount?: number }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const request = (await getCancellation(id));
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.status !== "requested") {
    return { ok: false, message: `This request is already '${request.status}'.` };
  }

  const order = (await getOrder(request.order_id));
  if (!order) return { ok: false, message: "That order no longer exists." };

  const result = (await applyOrderStatus(request.order_id, "cancelled", staffUser.id));
  if (!result.ok) {
    return { ok: false, message: result.message ?? "The order could not be cancelled." };
  }

  // The money. A cancelled order that was paid for is refunded, and the
  // refund is raised rather than claimed as paid.
  const amount =
    input.refundAmount !== undefined ? Math.max(0, Math.round(input.refundAmount)) : order.total;
  const nowIso = new Date().toISOString();

  (await db.prepare(
    `UPDATE order_cancellations
     SET status = 'approved',
         admin_notes = ?,
         refund_amount = ?,
         refund_status = ?,
         decided_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    input.notes?.trim() || null,
    amount,
    amount > 0 ? "pending" : "none",
    nowIso,
    nowIso,
    id
  ));

  // The customer is told the order is cancelled, and what is happening
  // to the money.
  await notifyCustomerAboutOrder({
    userId: order.user_id,
    email: order.email,
    orderId: request.order_id,
    kind: "cancellation_approved",
    title: `Order ${request.order_id} is cancelled`,
    body:
      amount > 0
        ? `Your order ${request.order_id} has been cancelled, and a refund of ₹${amount.toLocaleString("en-IN")} has been raised. The money goes back to you by the same method you paid with — we will write to you again when it has been sent.`
        : `Your order ${request.order_id} has been cancelled.`,
  });

  return {
    ok: true,
    message:
      amount > 0
        ? `Order ${request.order_id} is cancelled and a refund of ₹${amount.toLocaleString("en-IN")} has been raised. Confirm it as paid once the payment provider says so.`
        : `Order ${request.order_id} is cancelled.`,
  };
}

/**
 * The back office declines the cancellation, and says why.
 */
export async function rejectCancellation(
  id: string,
  staffUser: { id: number; name: string },
  reason: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const request = (await getCancellation(id));
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.status !== "requested") {
    return { ok: false, message: `This request is already '${request.status}'.` };
  }
  if (!reason.trim()) {
    return { ok: false, message: "Give the customer a reason." };
  }

  const nowIso = new Date().toISOString();
  (await db.prepare(
    `UPDATE order_cancellations
     SET status = 'rejected', rejection_reason = ?, decided_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(reason.trim(), nowIso, nowIso, id));

  // The customer is told, and why.
  const order = (await getOrder(request.order_id)) ?? null;
  await notifyCustomerAboutOrder({
    userId: request.user_id,
    email: order?.email ?? null,
    orderId: request.order_id,
    kind: "cancellation_rejected",
    title: `We could not cancel order ${request.order_id}`,
    body: `We were not able to cancel order ${request.order_id}. The reason is below.\n\n${reason.trim()}\n\nIf you would like this looked at again, please write to us.`,
  });

  return { ok: true, message: "The cancellation request has been declined." };
}

/**
 * The payment provider confirms the refund has gone out.
 *
 * Until this is done the refund is a promise; after it, it is a fact.
 */
export async function confirmCancellationRefund(
  id: string,
  staffUser: { id: number; name: string },
  reference: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const request = (await getCancellation(id));
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.refund_status !== "pending") {
    return { ok: false, message: "There is no refund waiting to be confirmed." };
  }
  if (!reference.trim()) {
    return { ok: false, message: "Give the refund reference from the payment provider." };
  }

  (await db.prepare(
    `UPDATE order_cancellations
     SET refund_status = 'processed', refund_reference = ?, updated_at = ?
     WHERE id = ?`
  ).run(reference.trim(), new Date().toISOString(), id));

  // The customer is told the money has actually gone back. This is the
  // only moment a cancelled order's refund is a fact.
  const order = (await getOrder(request.order_id)) ?? null;
  await notifyCustomerAboutOrder({
    userId: request.user_id,
    email: order?.email ?? null,
    orderId: request.order_id,
    kind: "order_cancelled",
    title: `The refund for order ${request.order_id} has been sent`,
    body: `The refund for your cancelled order ${request.order_id} has been paid back to you under reference ${reference.trim()}. It reaches your account in 2–5 working days.`,
  });

  return { ok: true, message: "The refund is confirmed as paid." };
}
