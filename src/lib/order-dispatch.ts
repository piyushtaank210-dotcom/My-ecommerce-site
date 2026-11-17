/**
 * The dispatch of an order, and the money that goes back when it is
 * called off.
 *
 * Three things happen to an order in the back office, and all three of
 * them are decided here rather than in the page that asks for them:
 *
 *   1. The order is confirmed — the courier, how the parcel is going and
 *      the number it can be tracked by are written down, and only then
 *      does the order become confirmed.
 *   2. The order is cancelled — with a reason, which is kept with it.
 *      The stock goes back on the shelf, and it goes back exactly once.
 *   3. The order is refunded — through the gateway the money came in
 *      by, against the gateway's own reference for the payment, and only
 *      once.
 *
 * Everything here runs on the server. The page that asks for these
 * things never changes an order by itself; it asks, and the answer is
 * what the database says afterwards.
 *
 * The key secret never comes near any of it. The refund is made by the
 * gateway module, which holds the credentials, and the only thing that
 * comes back is the gateway's own reference for the refund and the
 * status it reported.
 */

import { randomBytes } from "node:crypto";
import { getDb, withTransaction } from "./db";
import { applyOrderStatus, getOrder } from "./orders";
import { money } from "./format";
import { notifyCustomerAboutOrder } from "./notifications";
import {
  checkGatewayRefund,
  gatewayStatusIsComplete,
  listGatewayRefunds,
  refundThroughGateway,
} from "./refund-gateway";
import { GATEWAY } from "./gateway-records";
import {
  CANCELLATION_REASON_CODES,
  CANCELLATION_REASON_LABEL,
  SHIPPING_METHODS,
  SHIPPING_METHOD_LABEL,
  type CancellationReasonCode,
  type ShippingMethod,
} from "./order-dispatch-options";
import type { Order } from "./types";

export {
  CANCELLATION_REASON_CODES,
  CANCELLATION_REASON_LABEL,
  SHIPPING_METHODS,
  SHIPPING_METHOD_LABEL,
} from "./order-dispatch-options";
export type {
  CancellationReasonCode,
  ShippingMethod,
} from "./order-dispatch-options";

/* ------------------------------------------------------------ validation */

/** Which field of a form is wrong, when one of them is. */
export type DispatchField =
  | "courier"
  | "method"
  | "customMethod"
  | "tracking"
  | "reason"
  | "customReason"
  | "amount";

export type DispatchResult = {
  ok: boolean;
  message: string;
  /** The field to point at, when the problem is with one field. */
  field?: DispatchField;
  /** The order, as it stands after the call. */
  order?: Order | null;
  /** The gateway's own reference for the refund, when there is one. */
  refundId?: string | null;
  /** The gateway's own status for the refund, when there is one. */
  refundStatus?: string | null;
};

/* ------------------------------------------------------------- validation */

function isShippingMethod(value: unknown): value is ShippingMethod {
  return (
    typeof value === "string" &&
    (SHIPPING_METHODS as readonly string[]).includes(value)
  );
}

function isCancellationReasonCode(value: unknown): value is CancellationReasonCode {
  return (
    typeof value === "string" &&
    (CANCELLATION_REASON_CODES as readonly string[]).includes(value)
  );
}

/**
 * The shipping details, checked.
 *
 * All three are required. The courier's name and the tracking number
 * are the shop's own words, so they are only trimmed. The method has to
 * be one of the three, and when it is "other" the shop has to say what
 * it actually is.
 */
export function checkShippingDetails(input: {
  courierPartner?: unknown;
  shippingMethod?: unknown;
  customShippingMethod?: unknown;
  trackingId?: unknown;
}): { ok: true; value: {
  courierPartner: string;
  shippingMethod: ShippingMethod;
  customShippingMethod: string | null;
  trackingId: string;
} } | { ok: false; field: DispatchField; message: string } {
  const courierPartner = String(input.courierPartner ?? "").trim();
  if (!courierPartner) {
    return { ok: false, field: "courier", message: "Name the courier partner." };
  }
  if (courierPartner.length > 120) {
    return {
      ok: false,
      field: "courier",
      message: "The courier's name is too long.",
    };
  }

  const method = String(input.shippingMethod ?? "").trim().toLowerCase();
  if (!method) {
    return { ok: false, field: "method", message: "Choose a shipping method." };
  }
  if (!isShippingMethod(method)) {
    return {
      ok: false,
      field: "method",
      message: "Choose a shipping method.",
    };
  }

  let customShippingMethod: string | null = null;
  if (method === "other") {
    customShippingMethod = String(input.customShippingMethod ?? "").trim();
    if (!customShippingMethod) {
      return {
        ok: false,
        field: "customMethod",
        message: "Say how the parcel is going.",
      };
    }
    if (customShippingMethod.length > 120) {
      return {
        ok: false,
        field: "customMethod",
        message: "That shipping method is too long.",
      };
    }
  }

  const trackingId = String(input.trackingId ?? "").trim();
  if (!trackingId) {
    return { ok: false, field: "tracking", message: "Enter the tracking number." };
  }
  if (trackingId.length > 120) {
    return {
      ok: false,
      field: "tracking",
      message: "That tracking number is too long.",
    };
  }

  return {
    ok: true,
    value: { courierPartner, shippingMethod: method, customShippingMethod, trackingId },
  };
}

/**
 * The cancellation reason, checked.
 *
 * A reason is required: an order that is called off without saying why
 * is an order nobody can learn from.
 */
export function checkCancellationReason(input: {
  reasonCode?: unknown;
  reasonDetail?: unknown;
}): { ok: true; value: { reasonCode: CancellationReasonCode; reason: string } } | {
  ok: false;
  field: DispatchField;
  message: string;
} {
  const reasonCode = String(input.reasonCode ?? "").trim().toLowerCase();
  if (!reasonCode) {
    return {
      ok: false,
      field: "reason",
      message: "Choose why the order is being cancelled.",
    };
  }
  if (!isCancellationReasonCode(reasonCode)) {
    return {
      ok: false,
      field: "reason",
      message: "Choose why the order is being cancelled.",
    };
  }

  const detail = String(input.reasonDetail ?? "").trim();
  if (reasonCode === "other") {
    if (!detail) {
      return {
        ok: false,
        field: "customReason",
        message: "Say why the order is being cancelled.",
      };
    }
    if (detail.length > 500) {
      return {
        ok: false,
        field: "customReason",
        message: "That reason is too long.",
      };
    }
    return { ok: true, value: { reasonCode, reason: detail } };
  }

  return {
    ok: true,
    value: { reasonCode, reason: CANCELLATION_REASON_LABEL[reasonCode] },
  };
}

/* ------------------------------------------------------------- confirming */

/**
 * Confirms an order with its shipping details.
 *
 * The order is not confirmed until every detail is there. The details
 * and the status are written together, in one transaction, so an order
 * can never be confirmed without the courier it went with — and cannot
 * carry a courier it did not go with.
 *
 * An order that has already been cancelled cannot be confirmed, and an
 * order that has been delivered is not confirmed either: it is returned
 * or replaced, under the return rules.
 */
export async function confirmOrderWithShipping(input: {
  orderId: string;
  courierPartner?: unknown;
  shippingMethod?: unknown;
  customShippingMethod?: unknown;
  trackingId?: unknown;
  userId: number | null;
}): Promise<DispatchResult> {
  const checked = checkShippingDetails(input);
  if (!checked.ok) {
    return { ok: false, message: checked.message, field: checked.field };
  }

  const order = await getOrder(input.orderId);
  if (!order) {
    return { ok: false, message: "That order no longer exists." };
  }
  if (order.status === "cancelled") {
    return {
      ok: false,
      message: "This order has been cancelled, so it cannot be confirmed.",
    };
  }
  if (order.status === "delivered") {
    return {
      ok: false,
      message:
        "This order has been delivered, so it cannot be confirmed. It is returned or replaced under the return rules.",
    };
  }

  const db = getDb();
  await withTransaction(async (tx) => {
    const lock = tx.dialect === "postgres" ? " FOR UPDATE" : "";
    const current = (await tx
      .prepare(`SELECT status FROM orders WHERE id = ?${lock}`)
      .get(input.orderId)) as { status?: string } | undefined;
    if (!current) throw new Error("That order no longer exists.");
    const from = String(current.status);
    if (from === "cancelled") {
      throw new Error("This order has been cancelled, so it cannot be confirmed.");
    }
    if (from === "delivered") {
      throw new Error(
        "This order has been delivered, so it cannot be confirmed. It is returned or replaced under the return rules."
      );
    }

    // An order that is still pending becomes confirmed. One that has
    // already been confirmed — or has moved on since — keeps the status
    // it has: correcting a tracking number does not put an order back
    // to the start.
    const nextStatus = from === "pending" ? "confirmed" : from;

    await tx
      .prepare(
        `UPDATE orders
            SET courier_partner = ?,
                shipping_method = ?,
                custom_shipping_method = ?,
                tracking_id = ?,
                shipping_confirmed_at = COALESCE(shipping_confirmed_at, ?),
                status = ?
          WHERE id = ?`
      )
      .run(
        checked.value.courierPartner,
        checked.value.shippingMethod,
        checked.value.customShippingMethod,
        checked.value.trackingId,
        new Date().toISOString(),
        nextStatus,
        input.orderId
      );
  });

  // The customer is told where their order is going. It is sent after
  // the change is recorded, so that a mail that cannot go out never
  // stops the order from being confirmed.
  const method =
    checked.value.shippingMethod === "other"
      ? checked.value.customShippingMethod
      : SHIPPING_METHOD_LABEL[checked.value.shippingMethod];

  // An order that was pending has been confirmed, and the customer hears
  // so. One that was already confirmed — or that has moved on since —
  // has only had its details corrected, which is a smaller thing.
  const wasPending = order.status === "pending";

  await notifyCustomerAboutOrder({
    userId: order.user_id,
    email: order.email,
    orderId: order.id,
    kind: wasPending ? "order_confirmed" : "order_tracking",
    title: wasPending
      ? `Order ${order.id} confirmed`
      : `Order ${order.id} — shipping details updated`,
    body: wasPending
      ? [
          `Good news, ${order.name || "there"} — we have checked order ${order.id} and it is confirmed.`,
          "",
          `Courier: ${checked.value.courierPartner}`,
          `Shipping method: ${method}`,
          `Tracking number: ${checked.value.trackingId}`,
          "",
          "We are getting it ready to go out. You can follow your order from your account.",
        ].join("\n")
      : [
          `The shipping details for order ${order.id} have been updated.`,
          "",
          `Courier: ${checked.value.courierPartner}`,
          `Shipping method: ${method}`,
          `Tracking number: ${checked.value.trackingId}`,
          "",
          "You can follow your order from your account.",
        ].join("\n"),
  });

  return {
    ok: true,
    message: wasPending
      ? `Order ${order.id} is confirmed and will go out with ${checked.value.courierPartner}.`
      : `The shipping details for order ${order.id} have been saved.`,
    order: await getOrder(order.id),
  };
}

/* ------------------------------------------------------------ cancelling */

/**
 * Cancels an order, with the reason for it.
 *
 * The reason is required, and it is written with the cancellation itself
 * rather than after it — an order cannot be cancelled without a reason,
 * and a reason cannot be left behind by a cancellation that did not
 * happen.
 *
 * The stock goes back on the shelf through the same code that has always
 * given it back, and it goes back exactly once: an order that is already
 * cancelled is refused, and the lines that have already had their stock
 * returned are not returned a second time.
 */
export async function cancelOrderWithReason(input: {
  orderId: string;
  reasonCode?: unknown;
  reasonDetail?: unknown;
  userId: number | null;
}): Promise<DispatchResult> {
  const checked = checkCancellationReason(input);
  if (!checked.ok) {
    return { ok: false, message: checked.message, field: checked.field };
  }

  const order = await getOrder(input.orderId);
  if (!order) {
    return { ok: false, message: "That order no longer exists." };
  }
  if (order.status === "cancelled") {
    return {
      ok: false,
      message: "This order has already been cancelled.",
    };
  }
  if (order.status === "delivered") {
    return {
      ok: false,
      message:
        "This order has been delivered, so it is returned or replaced rather than cancelled.",
    };
  }

  const result = await applyOrderStatus(order.id, "cancelled", input.userId, {
    cancellation: { reason: checked.value.reason, reasonCode: checked.value.reasonCode },
  });
  if (!result.ok) {
    return { ok: false, message: result.message ?? "The order could not be cancelled." };
  }

  return {
    ok: true,
    message: `Order ${order.id} has been cancelled. The stock has gone back on the shelf.`,
    order: await getOrder(order.id),
  };
}

/* --------------------------------------------------------------- refunding */

/** A refund, as the shop keeps it. */
export type OrderRefund = {
  id: string;
  orderId: string;
  gateway: string;
  paymentId: string | null;
  receipt: string;
  amount: number;
  status: string;
  refundId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  refundedAt: string | null;
};

/**
 * The refund of an order, if it has one.
 */
export async function getOrderRefund(orderId: string): Promise<OrderRefund | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM order_refunds WHERE order_id = ?")
    .get(orderId)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    gateway: String(row.gateway ?? GATEWAY),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    receipt: String(row.receipt),
    amount: Number(row.amount ?? 0),
    status: String(row.status ?? "pending"),
    refundId: row.refund_id ? String(row.refund_id) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    refundedAt: row.refunded_at ? String(row.refunded_at) : null,
  };
}

/**
 * How long a refund may sit as "being processed" before the shop
 * decides that the attempt was interrupted and may be tried again.
 *
 * The window is short enough that an administrator is not left waiting,
 * and long enough that two requests arriving together cannot both
 * decide that the other one is dead.
 */
const REFUND_IN_FLIGHT_MS = 60_000;

/**
 * Refunds a cancelled order, through the gateway the money came in by.
 *
 * The refund is claimed before it is made. The claim is a row with a
 * unique key on the order, so only one refund can ever exist for an
 * order: a double-tapped button, two tabs, or two requests arriving
 * together cannot send the money back twice.
 *
 * Before the money is sent, the gateway is asked what it has already
 * done against the payment. That is the safety net under the claim: if
 * an earlier attempt was interrupted between the gateway accepting the
 * refund and the shop hearing about it, the refund that already exists
 * is found and adopted rather than a second one being made.
 *
 * When the gateway refuses, or cannot be reached, the order stays
 * cancelled and the failure is written down. The money can be sent
 * again later, and the retry goes through the same checks.
 */
export async function refundCancelledOrder(input: {
  orderId: string;
  amount?: number;
  userId: number | null;
}): Promise<DispatchResult> {
  const order = await getOrder(input.orderId);
  if (!order) {
    return { ok: false, message: "That order no longer exists." };
  }
  if (order.status !== "cancelled") {
    return {
      ok: false,
      message: "Only a cancelled order can be refunded.",
    };
  }

  const paymentId = order.payment_reference?.trim() ?? "";
  if (!paymentId) {
    return {
      ok: false,
      message:
        "This order was not paid through the payment gateway, so the refund has to be paid by hand.",
    };
  }

  const amount = Math.round(Number(input.amount ?? order.total));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter the amount to refund.", field: "amount" };
  }
  if (amount > order.total) {
    return {
      ok: false,
      message: `The refund cannot be more than the ${money(order.total)} that was paid.`,
      field: "amount",
    };
  }

  const db = getDb();
  const receipt = `refund_${order.id}`;
  const now = new Date().toISOString();

  // The claim.
  const claimed = await db
    .prepare(
      `INSERT INTO order_refunds
         (id, order_id, gateway, payment_id, receipt, amount, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'pending',?,?)
       ON CONFLICT (order_id) DO NOTHING`
    )
    .run(
      `ORF${randomBytes(5).toString("hex").toUpperCase()}`,
      order.id,
      GATEWAY,
      paymentId,
      receipt,
      amount,
      now,
      now
    );

  if (claimed.changes === 0) {
    // Somebody already has this refund. What they have decides what
    // happens now.
    const existing = await getOrderRefund(order.id);
    if (!existing) {
      return {
        ok: false,
        message: "A refund for this order is already being processed. Try again in a moment.",
      };
    }

    if (existing.status === "processed") {
      return {
        ok: true,
        message: `Order ${order.id} has already been refunded ${money(existing.amount)}.`,
        refundId: existing.refundId,
        refundStatus: existing.status,
        order: await getOrder(order.id),
      };
    }

    if (existing.status === "pending") {
      const age = Date.now() - new Date(existing.createdAt || now).getTime();
      if (Number.isFinite(age) && age < REFUND_IN_FLIGHT_MS) {
        return {
          ok: false,
          message:
            "A refund for this order is already being processed. Wait a moment and check its status.",
        };
      }
      // It has been sitting too long to be in flight. The attempt is
      // taken over — but only once the gateway has been asked what it
      // already has against this payment, which is the safety net
      // below.
    }

    // The attempt failed before, or was interrupted. It is tried again
    // against the same row, and the same receipt, so that the gateway
    // can recognise it as the same refund.
    await db
      .prepare(
        `UPDATE order_refunds
            SET amount = ?, payment_id = ?, status = 'pending', error = NULL,
                updated_at = ?
          WHERE order_id = ?`
      )
      .run(amount, paymentId, now, order.id);
  }

  // The safety net: what has the gateway already done against this
  // payment? This is asked before any money is sent, so that an attempt
  // which was interrupted between the gateway accepting the refund and
  // the shop hearing about it is adopted rather than repeated.
  const adopted = await adoptExistingGatewayRefund(order.id, paymentId, receipt, amount);
  if (adopted) return adopted;

  // The money goes back.
  const result = await refundThroughGateway({
    paymentId,
    amount,
    receipt,
    idempotencyKey: receipt,
    notes: { order_id: order.id },
  });

  if (!result.ok) {
    const reason = result.reason ?? "The gateway refused the refund.";
    await db
      .prepare(
        `UPDATE order_refunds
            SET status = 'failed', error = ?, updated_at = ?
          WHERE order_id = ?`
      )
      .run(reason, new Date().toISOString(), order.id);
    await db
      .prepare(
        `UPDATE orders SET refund_status = 'failed', refund_error = ? WHERE id = ?`
      )
      .run(reason, order.id);

    return {
      ok: false,
      message: `The refund did not go through: ${reason} The order is still cancelled, and the refund can be tried again.`,
    };
  }

  const gatewayStatus = result.status ?? "pending";
  const processed = gatewayStatusIsComplete(gatewayStatus);
  const refundedAt = processed ? new Date().toISOString() : null;

  await db
    .prepare(
      `UPDATE order_refunds
          SET status = ?, refund_id = ?, error = NULL, updated_at = ?, refunded_at = ?
        WHERE order_id = ?`
    )
    .run(
      processed ? "processed" : "pending",
      result.refundId ?? null,
      new Date().toISOString(),
      refundedAt,
      order.id
    );

  await db
    .prepare(
      `UPDATE orders
          SET refund_id = ?, refund_amount = ?, refund_status = ?,
              refunded_at = ?, refund_error = NULL,
              payment_status = ?
        WHERE id = ?`
    )
    .run(
      result.refundId ?? null,
      amount,
      processed ? "processed" : "pending",
      refundedAt,
      // The money is on its way back, so the payment status says so. It
      // is only "refunded" once the gateway says it has paid it; until
      // then it is "partially refunded" if some of it went back, and the
      // order's own status is untouched.
      processed
        ? amount >= order.total
          ? "refunded"
          : "partially_refunded"
        : order.payment_status,
      order.id
    );

  // The customer is told what has happened to the money. A refund that
  // the gateway has accepted but not yet paid is not a refund that has
  // reached them, and the message says so.
  await notifyCustomerAboutOrder({
    userId: order.user_id,
    email: order.email,
    orderId: order.id,
    kind: processed ? "refund_completed" : "refund_processing",
    title: processed
      ? `The refund for order ${order.id} has been paid back`
      : `The refund for order ${order.id} is on its way`,
    body: processed
      ? `The refund of ${money(amount)} for your cancelled order ${order.id} has been paid back to the method you paid with. It should reflect in your original payment account within 3–4 business days, depending on your bank or payment provider.`
      : `The refund of ${money(amount)} for your cancelled order ${order.id} has been sent to the payment provider. It should reflect in your original payment account within 3–4 business days of the refund being processed, depending on your bank or payment provider.${
          result.refundId ? `\n\nReference: ${result.refundId}` : ""
        }`,
  });

  return {
    ok: true,
    message: processed
      ? `The refund of ${money(amount)} has been paid back.`
      : `The refund of ${money(amount)} has been accepted by the payment provider and is on its way. It should reflect in the customer's original payment account within 3–4 business days of the refund being processed, depending on their bank or payment provider.`,
    refundId: result.refundId ?? null,
    refundStatus: gatewayStatus,
    order: await getOrder(order.id),
  };
}

/**
 * What an order was paid for, in rupees.
 *
 * It is the amount the payment status is measured against: a refund of
 * the whole of it is a refund, and anything less is a partial one.
 */
async function orderTotalFor(orderId: string): Promise<number> {
  const row = (await getDb()
    .prepare("SELECT total FROM orders WHERE id = ?")
    .get(orderId)) as { total?: number } | undefined;
  return Number(row?.total ?? 0);
}

/**
 * Finds a refund the gateway has already made against the payment, and
 * adopts it.
 *
 * It is what stops the money going back twice when an attempt was
 * interrupted. It answers with the refund it found, or with nothing when
 * there is nothing to adopt.
 */
async function adoptExistingGatewayRefund(
  orderId: string,
  paymentId: string,
  receipt: string,
  amount: number
): Promise<DispatchResult | null> {
  const listed = await listGatewayRefunds(paymentId);
  if (!listed.ok) return null;

  // The shop's own refund first, then any other refund for the same
  // money. A refund that is already against the payment is the same
  // money going back, whatever it is called.
  const mine = listed.refunds.find((r) => r.receipt === receipt);
  const sameMoney = listed.refunds.find(
    (r) => r.receipt !== receipt && Math.round(r.amount / 100) === amount
  );
  const found = mine ?? sameMoney;
  if (!found) return null;

  const processed = gatewayStatusIsComplete(found.status);
  const refundedAt = processed ? new Date().toISOString() : null;
  const orderTotal = await orderTotalFor(orderId);

  await getDb()
    .prepare(
      `INSERT INTO order_refunds
         (id, order_id, gateway, payment_id, receipt, amount, status, refund_id,
          created_at, updated_at, refunded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (order_id) DO UPDATE
         SET status = EXCLUDED.status,
             refund_id = EXCLUDED.refund_id,
             amount = EXCLUDED.amount,
             error = NULL,
             updated_at = EXCLUDED.updated_at,
             refunded_at = EXCLUDED.refunded_at`
    )
    .run(
      `ORF${randomBytes(5).toString("hex").toUpperCase()}`,
      orderId,
      GATEWAY,
      paymentId,
      receipt,
      amount,
      processed ? "processed" : "pending",
      found.id,
      new Date().toISOString(),
      new Date().toISOString(),
      refundedAt
    );

  await getDb()
    .prepare(
      `UPDATE orders
          SET refund_id = ?, refund_amount = ?, refund_status = ?,
              refunded_at = ?, refund_error = NULL,
              payment_status = ?
        WHERE id = ?`
    )
    .run(
      found.id,
      amount,
      processed ? "processed" : "pending",
      refundedAt,
      processed
        ? amount >= orderTotal
          ? "refunded"
          : "partially_refunded"
        : "pending",
      orderId
    );

  return {
    ok: true,
    message: processed
      ? `The refund of ${money(amount)} has already been paid back.`
      : `The refund of ${money(amount)} has already been sent to the payment provider and is on its way.`,
    refundId: found.id,
    refundStatus: found.status,
    order: await getOrder(orderId),
  };
}

/**
 * Asks the gateway where a refund has got to, and records the answer.
 *
 * The gateway's own status is what decides: a refund it calls pending
 * has not reached the customer yet, and the shop says so.
 */
export async function refreshRefundStatus(input: {
  orderId: string;
  userId: number | null;
}): Promise<DispatchResult> {
  const order = await getOrder(input.orderId);
  if (!order) {
    return { ok: false, message: "That order no longer exists." };
  }

  const refund = await getOrderRefund(order.id);
  if (!refund) {
    return { ok: false, message: "This order has no refund to check." };
  }
  if (!refund.refundId) {
    return {
      ok: false,
      message:
        "The payment provider has not given this refund a reference yet, so there is nothing to check.",
    };
  }

  const result = await checkGatewayRefund(refund.refundId);
  if (!result.ok) {
    return { ok: false, message: result.reason ?? "The gateway did not answer." };
  }

  const status = result.status ?? refund.status;
  const processed = gatewayStatusIsComplete(status);
  const refundedAt = processed
    ? refund.refundedAt || new Date().toISOString()
    : null;

  await getDb()
    .prepare(
      `UPDATE order_refunds
          SET status = ?, updated_at = ?, refunded_at = ?
        WHERE order_id = ?`
    )
    .run(processed ? "processed" : status, new Date().toISOString(), refundedAt, order.id);

  await getDb()
    .prepare(
      `UPDATE orders
          SET refund_status = ?, refunded_at = ?, refund_error = NULL,
              payment_status = ?
        WHERE id = ?`
    )
    .run(
      processed ? "processed" : status,
      refundedAt,
      // The payment status follows the gateway: it is only "refunded"
      // once the gateway says the money has gone back, and a refund of
      // less than the whole order is a partial one.
      processed
        ? refund.amount >= order.total
          ? "refunded"
          : "partially_refunded"
        : order.payment_status,
      order.id
    );

  if (processed && refund.status !== "processed") {
    await notifyCustomerAboutOrder({
      userId: order.user_id,
      email: order.email,
      orderId: order.id,
      kind: "refund_completed",
      title: `The refund for order ${order.id} has been paid back`,
      body: `The refund of ${money(refund.amount)} for your cancelled order ${order.id} has been paid back to the method you paid with. It should reflect in your original payment account within 3–4 business days, depending on your bank or payment provider.`,
    });
  }

  return {
    ok: true,
    message: processed
      ? `The refund of ${money(refund.amount)} has been paid back.`
      : `The payment provider says the refund of ${money(refund.amount)} is ${status}. It has not reached the customer yet.`,
    refundId: refund.refundId,
    refundStatus: status,
    order: await getOrder(order.id),
  };
}

/* ---------------------------------------------------------- the courier */

/**
 * The courier's own tracking page, when the shop knows the courier.
 *
 * It lives with the rest of the choices in
 * `src/lib/order-dispatch-options.ts`, which the customer's order page
 * reads as well — it is the same list in both places.
 */
export { courierTrackingUrl } from "./order-dispatch-options";
