import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { applyOrderStatus, getOrder } from "./orders";
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

export function getCancellation(id: string): OrderCancellation | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*, o.name AS customer_name, o.email AS customer_email
       FROM order_cancellations c
       JOIN orders o ON o.id = c.order_id
       WHERE c.id = ?`
    )
    .get(id) as Row | undefined;
  return row ? mapCancellationRow(row) : null;
}

export function getCancellationForOrder(orderId: string): OrderCancellation | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*, o.name AS customer_name, o.email AS customer_email
       FROM order_cancellations c
       JOIN orders o ON o.id = c.order_id
       WHERE c.order_id = ?
       ORDER BY c.created_at DESC
       LIMIT 1`
    )
    .get(orderId) as Row | undefined;
  return row ? mapCancellationRow(row) : null;
}

export function listCancellations(status?: string): OrderCancellation[] {
  const db = getDb();
  const rows = (
    status
      ? db
          .prepare(
            `SELECT c.*, o.name AS customer_name, o.email AS customer_email
             FROM order_cancellations c
             JOIN orders o ON o.id = c.order_id
             WHERE c.status = ?
             ORDER BY c.created_at DESC`
          )
          .all(status)
      : db
          .prepare(
            `SELECT c.*, o.name AS customer_name, o.email AS customer_email
             FROM order_cancellations c
             JOIN orders o ON o.id = c.order_id
             ORDER BY c.created_at DESC`
          )
          .all()
  ) as Row[];
  return rows.map(mapCancellationRow);
}

/**
 * The customer asks for an order to be cancelled.
 *
 * The request is recorded either way. What happens to the order is the
 * back office's decision, and the reason they give is kept with it.
 */
export function createCancellationRequest(input: {
  orderId: string;
  userId: number | null;
  reason: string;
  dispatchState: CancellationDispatchState;
}): { ok: boolean; message: string; id?: string } {
  const db = getDb();
  const reason = input.reason.trim();

  if (!reason) {
    return { ok: false, message: "Tell us why you want to cancel." };
  }

  const order = getOrder(input.orderId);
  if (!order) return { ok: false, message: "Order not found." };

  const eligibility = cancellationEligibility(order);
  if (!eligibility.canRequest) {
    return { ok: false, message: eligibility.reason ?? "This order cannot be cancelled." };
  }

  const existing = getCancellationForOrder(input.orderId);
  if (existing && existing.status === "requested") {
    return {
      ok: false,
      message: `You have already asked us to cancel this order (${existing.id}). We are looking at it.`,
    };
  }

  const id = generateCancellationId();
  db.prepare(
    `INSERT INTO order_cancellations
      (id, order_id, user_id, dispatch_state, reason, status)
     VALUES (?, ?, ?, ?, ?, 'requested')`
  ).run(id, input.orderId, input.userId, input.dispatchState, reason);

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
export function approveCancellation(
  id: string,
  staffUser: { id: number; name: string },
  input: { notes?: string; refundAmount?: number }
): { ok: boolean; message: string } {
  const db = getDb();
  const request = getCancellation(id);
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.status !== "requested") {
    return { ok: false, message: `This request is already '${request.status}'.` };
  }

  const order = getOrder(request.order_id);
  if (!order) return { ok: false, message: "That order no longer exists." };

  const result = applyOrderStatus(request.order_id, "cancelled", staffUser.id);
  if (!result.ok) {
    return { ok: false, message: result.message ?? "The order could not be cancelled." };
  }

  // The money. A cancelled order that was paid for is refunded, and the
  // refund is raised rather than claimed as paid.
  const amount =
    input.refundAmount !== undefined ? Math.max(0, Math.round(input.refundAmount)) : order.total;
  const nowIso = new Date().toISOString();

  db.prepare(
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
  );

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
export function rejectCancellation(
  id: string,
  staffUser: { id: number; name: string },
  reason: string
): { ok: boolean; message: string } {
  const db = getDb();
  const request = getCancellation(id);
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.status !== "requested") {
    return { ok: false, message: `This request is already '${request.status}'.` };
  }
  if (!reason.trim()) {
    return { ok: false, message: "Give the customer a reason." };
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE order_cancellations
     SET status = 'rejected', rejection_reason = ?, decided_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(reason.trim(), nowIso, nowIso, id);

  return { ok: true, message: "The cancellation request has been declined." };
}

/**
 * The payment provider confirms the refund has gone out.
 *
 * Until this is done the refund is a promise; after it, it is a fact.
 */
export function confirmCancellationRefund(
  id: string,
  staffUser: { id: number; name: string },
  reference: string
): { ok: boolean; message: string } {
  const db = getDb();
  const request = getCancellation(id);
  if (!request) return { ok: false, message: "Cancellation request not found." };
  if (request.refund_status !== "pending") {
    return { ok: false, message: "There is no refund waiting to be confirmed." };
  }
  if (!reference.trim()) {
    return { ok: false, message: "Give the refund reference from the payment provider." };
  }

  db.prepare(
    `UPDATE order_cancellations
     SET refund_status = 'processed', refund_reference = ?, updated_at = ?
     WHERE id = ?`
  ).run(reference.trim(), new Date().toISOString(), id);

  return { ok: true, message: "The refund is confirmed as paid." };
}
