import { randomBytes } from "node:crypto";
import { getDb, withTransaction } from "./db";
import {
  type EvidenceKind,
  type RefundStatus,
  type ReplacementStatus,
  type ReturnStatus,
} from "./return-status";
import { notifyAdmins, notifyCustomer, type NotificationKind } from "./notifications";

/**
 * The records the back office keeps about a request.
 *
 * A request says where a case has got to. These records say what was
 * decided, what was sent, what was inspected and what was refunded —
 * each in a row of its own, with the dates and the person who did it.
 *
 * Everything here writes to the database. Nothing is held in the
 * browser, and nothing is decided in the page that shows it.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/**
 * Who did something.
 */
export type Actor = {
  type: "customer" | "staff" | "system";
  id?: number | null;
  name?: string | null;
  role?: string | null;
};

/**
 * Writes one action to the audit log.
 *
 * The log answers a different question from the request's own history:
 * not "where is this case" but "who pressed which button, and when".
 */
export async function recordAdminAction(input: {
  returnId: string | null;
  action: string;
  actor: Actor;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO admin_actions
         (return_id, action, actor_user_id, actor_name, actor_role, from_status, to_status, note, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.returnId,
      input.action,
      input.actor.id ?? null,
      input.actor.name ?? null,
      input.actor.role ?? null,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.note ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    );
}

/**
 * Moves a request to a new status, and records that it happened.
 *
 * Three things are written together: the request itself, the line in its
 * history that says where it came from and where it went, and the entry
 * in the audit log. The customer is told, unless the caller says not
 * to.
 *
 * The status is only changed if it is a status the shop knows about, so
 * a mistake in a caller cannot leave a request in a state the customer
 * dashboard cannot read.
 */
export async function transitionReturnStatus(input: {
  returnId: string;
  to: ReturnStatus;
  actor: Actor;
  note?: string | null;
  /** What the audit log calls this action. */
  action?: string;
  metadata?: Record<string, unknown> | null;
  /** Extra columns to write on the request alongside the status. */
  extra?: Record<string, string | number | null>;
  /** What the customer is told. Nothing is said when this is left out. */
  tellCustomer?: { kind: NotificationKind; title: string; body: string } | null;
  /** Whether the back office is told as well. */
  tellAdmins?: boolean;
}): Promise<{ ok: boolean; message?: string; from?: string }> {
  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT r.id, r.status, r.order_id, r.user_id, r.type,
              COALESCE(r.customer_email, o.email) AS customer_email,
              COALESCE(r.customer_name, o.name) AS customer_name
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?`
    )
    .get(input.returnId)) as Row | undefined;

  if (!row) return { ok: false, message: "Request not found." };

  const from = str(row.status);

  // The extra columns are written by the caller, and they are written
  // with names the shop controls — never anything that came from a
  // request body.
  const extras = { ...(input.extra ?? {}) };

  // A case that is being closed records the day it was closed. It is
  // written here rather than by each caller, so every way of closing a
  // case — a refund paid, a replacement delivered, or the back office
  // closing it by hand — leaves the same date on it.
  const closing = input.to === "resolved" || input.to === "completed";
  delete extras.resolved_at;

  const columns = Object.keys(extras);
  const setClause = [
    "status = ?",
    "updated_at = datetime('now')",
    ...(closing ? ["resolved_at = datetime('now')"] : []),
    ...columns.map((c) => `${c} = ?`),
  ];
  const values: unknown[] = [input.to, ...columns.map((c) => extras[c])];

  await withTransaction(async (tx) => {
    await tx
      .prepare(
        `UPDATE return_requests SET ${setClause.join(", ")} WHERE id = ?`
      )
      .run(...values, input.returnId);

    await tx
      .prepare(
        `INSERT INTO return_events
           (return_id, status, from_status, to_status, actor_type, actor_id, actor_name, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.returnId,
        input.to,
        from,
        input.to,
        input.actor.type,
        input.actor.id ?? null,
        input.actor.name ?? null,
        input.note ?? null
      );

    await tx
      .prepare(
        `INSERT INTO admin_actions
           (return_id, action, actor_user_id, actor_name, actor_role, from_status, to_status, note, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.returnId,
        input.action ?? input.to,
        input.actor.id ?? null,
        input.actor.name ?? null,
        input.actor.role ?? null,
        from,
        input.to,
        input.note ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      );
  });

  if (input.tellCustomer) {
    await notifyCustomer({
      userId: row.user_id === null ? null : num(row.user_id),
      email: strOrNull(row.customer_email),
      returnId: input.returnId,
      orderId: str(row.order_id),
      kind: input.tellCustomer.kind,
      title: input.tellCustomer.title,
      body: input.tellCustomer.body,
    });
  }

  if (input.tellAdmins) {
    await notifyAdmins({
      returnId: input.returnId,
      orderId: str(row.order_id),
      kind: input.tellCustomer?.kind ?? "under_review",
      title: `Request ${input.returnId} — ${input.to.replace(/_/g, " ")}`,
      body: input.note ?? `The request is now ${input.to.replace(/_/g, " ")}.`,
    });
  }

  return { ok: true, from };
}

/**
 * A refund, on its own row.
/**
 * A refund, worked out from what the customer actually paid.
 *
 * The price is the one on the order line — what the item was bought
 * for — and never the price on the shelf today. A console that has gone
 * up in price since it was bought is still refunded at what it was
 * bought for.
 */
export type RefundCalculation = {
  /** What is going back, in rupees. */
  amount: number;
  /** What the return request covers, line by line. */
  lines: {
    orderItemId: number | null;
    productSlug: string | null;
    name: string;
    unitPrice: number;
    quantity: number;
    lineAmount: number;
  }[];
  /** The units going back. */
  quantity: number;
  /** The method the customer paid with. */
  originalPaymentMethod: string | null;
  /** The gateway's reference for the payment, when there is one. */
  gatewayPaymentId: string | null;
  /** The gateway the order was paid through. */
  gateway: string | null;
};

/**
 * Works out what a request is worth, from the order as it was bought.
 *
 * The price comes from the order line rather than from the catalogue,
 * and the quantity is what is actually being returned. Nothing here
 * looks at what the product costs now.
 */
export async function calculateRefund(
  returnId: string
): Promise<RefundCalculation> {
  const db = getDb();

  const request = (await db
    .prepare(
      `SELECT r.order_id, r.user_id,
              o.payment_method, o.payment_gateway, o.payment_reference
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?`
    )
    .get(returnId)) as
    | {
        order_id: string;
        user_id: number | null;
        payment_method: string;
        payment_gateway: string | null;
        payment_reference: string | null;
      }
    | undefined;

  if (!request) {
    return {
      amount: 0,
      lines: [],
      quantity: 0,
      originalPaymentMethod: null,
      gatewayPaymentId: null,
      gateway: null,
    };
  }

  const items = (await db
    .prepare(
      `SELECT ri.order_item_id, ri.product_slug, ri.name, ri.quantity,
              ri.price AS recorded_price,
              oi.price AS order_price
         FROM return_items ri
         LEFT JOIN order_items oi ON oi.id = ri.order_item_id
        WHERE ri.return_id = ?
        ORDER BY ri.id`
    )
    .all(returnId)) as {
    order_item_id: number | null;
    product_slug: string | null;
    name: string;
    quantity: number;
    recorded_price: number;
    order_price: number | null;
  }[];

  const lines: RefundCalculation["lines"] = [];
  let amount = 0;
  let quantity = 0;

  for (const item of items) {
    // The price the customer paid wins. The price recorded on the
    // request is the fallback for an order line that has since gone.
    const unitPrice =
      item.order_price !== null && item.order_price !== undefined
        ? num(item.order_price)
        : num(item.recorded_price);
    const qty = num(item.quantity);
    const lineAmount = unitPrice * qty;

    amount += lineAmount;
    quantity += qty;

    lines.push({
      orderItemId: item.order_item_id,
      productSlug: item.product_slug,
      name: str(item.name),
      unitPrice,
      quantity: qty,
      lineAmount,
    });
  }

  return {
    amount,
    lines,
    quantity,
    originalPaymentMethod: strOrNull(request.payment_method),
    gatewayPaymentId: strOrNull(request.payment_reference),
    gateway: strOrNull(request.payment_gateway),
  };
}

/**
 * A refund, on its own row.
 */
export async function createRefundRecord(input: {
  returnId: string;
  amount: number;
  paymentMethod?: string | null;
  notes?: string | null;
  approvedBy: { id: number; name: string; role?: string };
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT r.id, r.order_id, r.user_id, r.status,
              COALESCE(r.customer_email, o.email) AS customer_email
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?`
    )
    .get(input.returnId)) as Row | undefined;

  if (!row) return { ok: false, message: "Request not found." };
  if (
    row.status === "resolved" ||
    row.status === "completed" ||
    row.status === "rejected"
  ) {
    return { ok: false, message: `Request is already '${row.status}'.` };
  }

  // A refund is worked out from the order as it was bought.
  const calculation = await calculateRefund(input.returnId);

  if (!calculation.amount) {
    return {
      ok: false,
      message: "There is nothing to refund on this request.",
    };
  }

  if (input.amount <= 0) {
    return { ok: false, message: "Enter the amount to refund." };
  }
  if (input.amount > calculation.amount) {
    return {
      ok: false,
      message: `The refund cannot be more than ${calculation.amount} — what the customer paid for the items being returned.`,
    };
  }

  // One live refund per request. A refund that failed may be tried
  // again, but two refunds may never be in flight at once.
  const live = (await db
    .prepare(
      `SELECT id FROM return_refunds
        WHERE return_id = ? AND status IN ('pending', 'processing', 'completed')
        LIMIT 1`
    )
    .get(input.returnId)) as { id?: string } | undefined;

  if (live?.id) {
    return {
      ok: false,
      message: `This request already has a refund in progress (${live.id}).`,
    };
  }

  const refundId = `RFD-${randomBytes(5).toString("hex").toUpperCase()}`;

  await withTransaction(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO return_refunds
           (id, return_id, order_id, user_id, amount, calculated_amount, unit_price,
            quantity, payment_method, original_payment_method, gateway_payment_id,
            status, approved_by, approved_by_name, approved_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), ?)`
      )
      .run(
        refundId,
        input.returnId,
        str(row.order_id),
        row.user_id === null ? null : num(row.user_id),
        input.amount,
        calculation.amount,
        calculation.lines[0]?.unitPrice ?? null,
        calculation.quantity,
        input.paymentMethod ?? calculation.originalPaymentMethod ?? null,
        calculation.originalPaymentMethod ?? null,
        calculation.gatewayPaymentId ?? null,
        input.approvedBy.id,
        input.approvedBy.name,
        input.notes ?? null
      );

    // The lines the refund is made of, so that the money can be worked
    // out again later.
    const insLine = tx.prepare(
      `INSERT INTO return_refund_lines
         (refund_id, order_item_id, product_slug, name, unit_price, quantity, line_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of calculation.lines) {
      await insLine.run(
        refundId,
        line.orderItemId,
        line.productSlug,
        line.name,
        line.unitPrice,
        line.quantity,
        line.lineAmount
      );
    }

    await tx
      .prepare(
        `INSERT INTO return_refund_events
           (refund_id, status, from_status, to_status, actor_type, actor_id, actor_name, amount, note)
         VALUES (?, 'pending', NULL, 'pending', 'staff', ?, ?, ?, ?)`
      )
      .run(
        refundId,
        input.approvedBy.id,
        input.approvedBy.name,
        input.amount,
        input.notes ??
          `Refund raised for ${input.amount}.`
      );
  });

  await transitionReturnStatus({
    returnId: input.returnId,
    to: "refund_approved",
    actor: {
      type: "staff",
      id: input.approvedBy.id,
      name: input.approvedBy.name,
      role: input.approvedBy.role ?? "admin",
    },
    action: "approve_refund",
    note:
      input.notes ??
      `Refund of ${input.amount} approved for ${input.paymentMethod ?? calculation.originalPaymentMethod ?? "the original payment method"}.`,
    extra: {
      refund_amount: input.amount,
      refund_method:
        input.paymentMethod ?? calculation.originalPaymentMethod ?? null,
      refund_status: "pending",
    },
    metadata: { refundId, amount: input.amount, calculated: calculation.amount },
    tellCustomer: {
      kind: "refund_approved",
      title: `Refund approved for request ${input.returnId}`,
      body: `We have approved a refund of ₹${input.amount} for order ${str(row.order_id)}. The money is sent back by ${input.paymentMethod ?? calculation.originalPaymentMethod ?? "your original payment method"} once the returned product has been checked.`,
    },
  });

  return { ok: true, id: refundId };
}

export async function createReplacementRecord(input: {
  returnId: string;
  kind?: "replacement" | "accessories";
  productSlug?: string | null;
  variantId?: string | null;
  quantity?: number;
  originalSerial?: string | null;
  replacementSerial?: string | null;
  shipmentRef?: string | null;
  courierName: string;
  trackingNumber: string;
  dispatchDate?: string | null;
  notes?: string | null;
  actor: { id: number; name: string; role?: string };
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT r.id, r.order_id, r.user_id, r.serial_number,
              COALESCE(r.customer_email, o.email) AS customer_email
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?`
    )
    .get(input.returnId)) as Row | undefined;

  if (!row) return { ok: false, message: "Request not found." };

  const replacementId = `REP-${randomBytes(5).toString("hex").toUpperCase()}`;
  const kind = input.kind ?? "replacement";

  await db
    .prepare(
      `INSERT INTO return_replacements
         (id, return_id, order_id, kind, original_serial, replacement_serial, product_slug,
          variant_id, quantity, shipment_ref, courier_name, tracking_number, dispatch_date,
          delivery_status, created_by, created_by_name, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatched', ?, ?, ?)`
    )
    .run(
      replacementId,
      input.returnId,
      str(row.order_id),
      kind,
      input.originalSerial ?? strOrNull(row.serial_number),
      input.replacementSerial ?? null,
      input.productSlug ?? null,
      input.variantId ?? null,
      input.quantity ?? 1,
      input.shipmentRef ?? replacementId,
      input.courierName,
      input.trackingNumber,
      input.dispatchDate ?? null,
      input.actor.id,
      input.actor.name,
      input.notes ?? null
    );

  await transitionReturnStatus({
    returnId: input.returnId,
    to: "replacement_dispatched",
    actor: {
      type: "staff",
      id: input.actor.id,
      name: input.actor.name,
      role: input.actor.role ?? "admin",
    },
    action: kind === "accessories" ? "dispatch_accessories" : "dispatch_replacement",
    note:
      input.notes ??
      `${kind === "accessories" ? "The missing accessories" : "The replacement"} left the warehouse with ${input.courierName}, tracking ${input.trackingNumber}.`,
    extra:
      kind === "accessories"
        ? {
            accessories_courier: input.courierName,
            accessories_tracking: input.trackingNumber,
            accessories_dispatched_at: null,
          }
        : {
            replacement_courier: input.courierName,
            replacement_tracking: input.trackingNumber,
            replacement_order_id: input.shipmentRef ?? replacementId,
            replacement_dispatch_date: input.dispatchDate ?? null,
            replacement_delivery_status: "dispatched",
            replacement_product_slug: input.productSlug ?? null,
            replacement_variant_id: input.variantId ?? null,
          },
    metadata: { replacementId, tracking: input.trackingNumber },
    tellCustomer: {
      kind: "replacement_dispatched",
      title: `Your ${kind === "accessories" ? "missing parts" : "replacement"} is on its way`,
      body: `The ${kind === "accessories" ? "missing accessories" : "replacement"} for request ${input.returnId} has been dispatched with ${input.courierName}. The tracking number is ${input.trackingNumber}.`,
    },
  });

  return { ok: true, id: replacementId };
}

export async function updateRefundRecord(input: {
  refundId: string;
  status: RefundStatus;
  /** The gateway's reference for the payment, when it has one. */
  gatewayTransactionId?: string | null;
  /** The gateway's own reference for the refund. */
  gatewayRefundId?: string | null;
  /** Whether the shop sent it to the gateway or paid it by hand. */
  settledBy?: "gateway" | "manual" | null;
  notes?: string | null;
  failedReason?: string | null;
  actor: { id: number; name: string; role?: string };
}): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT f.id, f.return_id, f.order_id, f.amount, f.status,
              f.gateway_payment_id, f.gateway_refund_id, f.settled_by,
              COALESCE(r.customer_email, o.email) AS customer_email,
              r.user_id
         FROM return_refunds f
         JOIN return_requests r ON r.id = f.return_id
         JOIN orders o ON o.id = f.order_id
        WHERE f.id = ?`
    )
    .get(input.refundId)) as Row | undefined;

  if (!row) return { ok: false, message: "Refund not found." };
  // A refund that has been paid is the more specific answer, so it is
  // checked first — trying to pay it twice is the mistake worth naming.
  if (str(row.status) === "completed") {
    return { ok: false, message: "This refund has already been paid." };
  }
  if (str(row.status) === input.status) {
    return { ok: false, message: "The refund is already in that state." };
  }

  const fromStatus = str(row.status);
  const sets: string[] = ["status = ?", "updated_at = datetime('now')"];
  const values: unknown[] = [input.status];

  if (input.status === "processing") {
    sets.push("initiated_at = datetime('now')");
    if (input.gatewayTransactionId) {
      sets.push("gateway_transaction_id = ?");
      values.push(input.gatewayTransactionId);
    }
    if (input.gatewayRefundId) {
      sets.push("gateway_refund_id = ?");
      values.push(input.gatewayRefundId);
    }
    if (input.settledBy) {
      sets.push("settled_by = ?");
      values.push(input.settledBy);
    }
  } else if (input.status === "completed") {
    // A refund is not a refund until the money has moved. It either
    // moved because the gateway said so, or because an administrator
    // paid it and wrote down the reference of the payment they made.
    // Either way there has to be a reference.
    if (!input.gatewayTransactionId) {
      return {
        ok: false,
        message:
          "Enter the reference the refund was paid under (the gateway's refund id, or the UTR of the payment).",
      };
    }
    sets.push("completed_at = datetime('now')", "gateway_transaction_id = ?");
    values.push(input.gatewayTransactionId);
    if (input.gatewayRefundId) {
      sets.push("gateway_refund_id = ?");
      values.push(input.gatewayRefundId);
    }
    // A refund settled by hand carries the name of the person who paid
    // it, so that it is always known who confirmed it.
    sets.push(
      "settled_by = ?",
      "confirmed_by = ?",
      "confirmed_by_name = ?"
    );
    values.push(
      input.settledBy ?? "manual",
      input.actor.id,
      input.actor.name
    );
  } else if (input.status === "failed") {
    if (!input.failedReason) {
      return { ok: false, message: "Give a reason for the refund failing." };
    }
    sets.push("failed_reason = ?");
    values.push(input.failedReason);
  }

  if (input.notes) {
    sets.push("notes = ?");
    values.push(input.notes);
  }

  await withTransaction(async (tx) => {
    await tx
      .prepare(`UPDATE return_refunds SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values, input.refundId);

    // The history of the refund: every step, with who took it and the
    // reference it carried.
    await tx
      .prepare(
        `INSERT INTO return_refund_events
           (refund_id, status, from_status, to_status, actor_type, actor_id, actor_name,
            reference, amount, note)
         VALUES (?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?)`
      )
      .run(
        input.refundId,
        input.status,
        fromStatus,
        input.status,
        input.actor.id,
        input.actor.name,
        input.gatewayTransactionId ?? input.gatewayRefundId ?? null,
        num(row.amount),
        input.notes ??
          input.failedReason ??
          (input.status === "completed"
            ? `Refund of ₹${num(row.amount)} paid under reference ${input.gatewayTransactionId}.`
            : input.status === "processing"
              ? "The refund has been sent to the payment provider."
              : null)
      );
  });

  // The request keeps a summary of the refund so a list can be drawn
  // without a join. It is kept in step with the record itself.
  const requestUpdates: Record<string, string | number | null> = {};
  if (input.status === "processing") {
    requestUpdates.refund_status = "pending";
  } else if (input.status === "completed") {
    requestUpdates.refund_status = "completed";
    requestUpdates.refund_reference = input.gatewayTransactionId ?? null;
  } else if (input.status === "failed") {
    requestUpdates.refund_status = "failed";
  }

  const statusForRequest: Record<RefundStatus, ReturnStatus> = {
    not_initiated: "refund_approved",
    pending: "refund_approved",
    processing: "refund_processing",
    completed: "refund_completed",
    failed: "refund_approved",
  };

  const isComplete = input.status === "completed";

  await transitionReturnStatus({
    returnId: str(row.return_id),
    to: statusForRequest[input.status],
    actor: {
      type: "staff",
      id: input.actor.id,
      name: input.actor.name,
      role: input.actor.role ?? "admin",
    },
    action:
      input.status === "processing"
        ? "process_refund"
        : input.status === "completed"
          ? "complete_refund"
          : "refund_failed",
    note:
      input.notes ??
      (input.status === "completed"
        ? `Refund of ₹${num(row.amount)} paid under reference ${input.gatewayTransactionId}.`
        : input.status === "processing"
          ? "The refund has been sent to the payment provider."
          : input.failedReason ?? null),
    extra: requestUpdates,
    metadata: { refundId: input.refundId, status: input.status },
    tellCustomer: isComplete
      ? {
          kind: "refund_completed",
          title: `Refund completed for request ${str(row.return_id)}`,
          body: `The refund of ₹${num(row.amount)} for order ${str(row.order_id)} has been paid under reference ${input.gatewayTransactionId}. It reaches your account in 2–5 working days.`,
        }
      : input.status === "processing"
        ? {
            kind: "refund_processing",
            title: `Refund on its way for request ${str(row.return_id)}`,
            body: `The refund of ₹${num(row.amount)} for order ${str(row.order_id)} has been sent to your payment method.`,
          }
        : null,
  });

  // The request carries the day the money actually went back. It is
  // written after the status change, because it is the refund's own
  // completion date and not the moment the button was pressed.
  if (isComplete) {
    await db
      .prepare(
        `UPDATE return_requests
            SET refund_processed_at = (SELECT completed_at FROM return_refunds WHERE id = ?),
                updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(input.refundId, str(row.return_id));
  }

  return { ok: true };
}

export async function updateReplacementDelivery(input: {
  replacementId: string;
  status: ReplacementStatus;
  notes?: string | null;
  actor: { id: number; name: string; role?: string };
}): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT rp.id, rp.return_id, rp.order_id, rp.delivery_status, rp.tracking_number,
              COALESCE(r.customer_email, o.email) AS customer_email, r.user_id
         FROM return_replacements rp
         JOIN return_requests r ON r.id = rp.return_id
         JOIN orders o ON o.id = rp.order_id
        WHERE rp.id = ?`
    )
    .get(input.replacementId)) as Row | undefined;

  if (!row) return { ok: false, message: "Replacement not found." };
  if (str(row.delivery_status) === input.status) {
    return { ok: false, message: "The replacement is already in that state." };
  }

  await db
    .prepare(
      `UPDATE return_replacements
          SET delivery_status = ?,
              delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
              updated_at = datetime('now')
        WHERE id = ?`
    )
    .run(input.status, input.status, input.replacementId);

  await db
    .prepare(
      `UPDATE return_requests
          SET replacement_delivery_status = ?,
              replacement_delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE replacement_delivered_at END,
              updated_at = datetime('now')
        WHERE id = ?`
    )
    .run(input.status, input.status, str(row.return_id));

  await recordAdminAction({
    returnId: str(row.return_id),
    action: "replacement_delivery",
    actor: {
      type: "staff",
      id: input.actor.id,
      name: input.actor.name,
      role: input.actor.role ?? "admin",
    },
    note: input.notes ?? `The replacement is now ${input.status.replace(/_/g, " ")}.`,
    metadata: { replacementId: input.replacementId, status: input.status },
  });

  if (input.status === "delivered") {
    await transitionReturnStatus({
      returnId: str(row.return_id),
      to: "resolved",
      actor: {
        type: "staff",
        id: input.actor.id,
        name: input.actor.name,
        role: input.actor.role ?? "admin",
      },
      action: "resolve",
      note: "The replacement has been delivered and the request is closed.",
      tellCustomer: {
        kind: "resolved",
        title: `Request ${str(row.return_id)} is resolved`,
        body: `Your replacement for order ${str(row.order_id)} has been delivered. Thank you for your patience.`,
      },
    });
  }

  return { ok: true };
}

/**
 * The physical check of a unit that came back.
 */
export async function recordInspection(input: {
  returnId: string;
  result: "passed" | "failed";
  serialSeen?: string | null;
  conditionNotes?: string | null;
  notes?: string | null;
  actor: { id: number; name: string; role?: string };
}): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();

  const row = (await db
    .prepare("SELECT id, order_id, user_id FROM return_requests WHERE id = ?")
    .get(input.returnId)) as Row | undefined;

  if (!row) return { ok: false, message: "Request not found." };

  const inspectionId = `INS-${randomBytes(5).toString("hex").toUpperCase()}`;

  await db
    .prepare(
      `INSERT INTO return_inspections
         (id, return_id, inspected_by, inspected_by_name, result, serial_seen, condition_notes, notes, inspected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      inspectionId,
      input.returnId,
      input.actor.id,
      input.actor.name,
      input.result,
      input.serialSeen ?? null,
      input.conditionNotes ?? null,
      input.notes ?? null
    );

  await recordAdminAction({
    returnId: input.returnId,
    action: "inspect",
    actor: {
      type: "staff",
      id: input.actor.id,
      name: input.actor.name,
      role: input.actor.role ?? "admin",
    },
    note:
      input.notes ??
      `The returned unit was inspected and ${input.result === "passed" ? "passed" : "failed"} the check.`,
    metadata: { inspectionId, result: input.result },
  });

  return { ok: true };
}

/**
 * Adds evidence to a request.
 *
 * The files that were sent before are kept — they are marked as
 * superseded rather than removed — so the record of what was claimed and
 * when is always complete. The new files carry the round they belong
 * to, and the round is shown to the customer and to the back office.
 */
export async function addReturnEvidence(input: {
  returnId: string;
  files: {
    path: string;
    kind: "photo" | "video";
    evidenceKind?: EvidenceKind;
    storedName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    originalName?: string | null;
    sha256?: string | null;
  }[];
  uploadedBy: Actor;
  note?: string | null;
}): Promise<{ ok: boolean; message?: string; version?: number }> {
  const db = getDb();

  const row = (await db
    .prepare("SELECT id FROM return_requests WHERE id = ?")
    .get(input.returnId)) as Row | undefined;

  if (!row) return { ok: false, message: "Request not found." };
  if (!input.files.length) return { ok: false, message: "No files were sent." };

  const current = (await db
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS v FROM return_images WHERE return_id = ?"
    )
    .get(input.returnId)) as { v?: number } | undefined;
  const version = num(current?.v) + 1;

  await withTransaction(async (tx) => {
    // The earlier round is kept, and marked as no longer the current
    // one.
    await tx
      .prepare(
        "UPDATE return_images SET superseded = 1 WHERE return_id = ? AND version < ?"
      )
      .run(input.returnId, version);

    const ins = tx.prepare(
      `INSERT INTO return_images
         (return_id, path, kind, evidence_kind, stored_name, mime_type, size_bytes,
          original_name, version, superseded, uploaded_by_type, uploaded_by_id, sha256, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    );

    for (const f of input.files) {
      await ins.run(
        input.returnId,
        f.path,
        f.kind,
        f.evidenceKind ?? "other",
        f.storedName ?? null,
        f.mimeType ?? null,
        f.sizeBytes ?? null,
        f.originalName ?? null,
        version,
        input.uploadedBy.type,
        input.uploadedBy.id ?? null,
        f.sha256 ?? null,
        input.note ?? null
      );
    }
  });

  await recordAdminAction({
    returnId: input.returnId,
    action: "add_evidence",
    actor: input.uploadedBy,
    note:
      input.note ??
      `${input.files.length} file${input.files.length === 1 ? "" : "s"} added (round ${version}).`,
    metadata: { version, count: input.files.length },
  });

  return { ok: true, version };
}

/**
 * The requests the customer may still send evidence for.
 *
 * Evidence cannot be changed once a claim has been decided, so a
 * customer may only add to a claim that is still open, and only while
 * the back office is waiting for more.
 */
export function evidenceMayBeAdded(status: string): boolean {
  return (
    status === "requested" ||
    status === "under_review" ||
    status === "info_requested" ||
    status === "evidence_received"
  );
}

/**
 * Tells the customer about their request.
 *
 * Who they are is read from the request, so the message goes to the
 * person the claim was made by.
 */
export async function notifyCustomerAbout(
  returnId: string,
  message: { kind: NotificationKind; title: string; body: string }
): Promise<void> {
  const row = (await getDb()
    .prepare(
      `SELECT r.order_id, r.user_id, COALESCE(r.customer_email, o.email) AS customer_email
         FROM return_requests r JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?`
    )
    .get(returnId)) as Row | undefined;

  if (!row) return;

  await notifyCustomer({
    userId: row.user_id === null ? null : num(row.user_id),
    email: strOrNull(row.customer_email),
    returnId,
    orderId: str(row.order_id),
    kind: message.kind,
    title: message.title,
    body: message.body,
  });
}

/**
 * The counters the back office's overview is made of.
 */
export async function getReturnsOverview(): Promise<{
  total: number;
  newRequests: number;
  pendingReview: number;
  evidenceRequired: number;
  approvedReplacements: number;
  replacementDispatched: number;
  refundRequests: number;
  refundApproved: number;
  refundProcessing: number;
  refundProcessed: number;
  rejected: number;
  closed: number;
  open: number;
  totalRefunded: number;
}> {
  const db = getDb();

  const rows = (await db
    .prepare(
      `SELECT r.status, r.refund_status, r.refund_amount
         FROM return_requests r`
    )
    .all()) as Row[];

  let newRequests = 0;
  let pendingReview = 0;
  let evidenceRequired = 0;
  let approvedReplacements = 0;
  let replacementDispatched = 0;
  let refundRequests = 0;
  let refundApproved = 0;
  let refundProcessing = 0;
  let refundProcessed = 0;
  let rejected = 0;
  let closed = 0;
  let totalRefunded = 0;

  for (const r of rows) {
    const s = str(r.status);
    const rs = str(r.refund_status);

    if (s === "requested") newRequests++;
    else if (s === "under_review") pendingReview++;
    else if (s === "info_requested") evidenceRequired++;
    else if (s === "replacement_approved" || s === "replacement_pending") {
      approvedReplacements++;
    } else if (s === "replacement_dispatched") replacementDispatched++;
    else if (s === "rejected") rejected++;
    else if (s === "resolved" || s === "completed") closed++;

    if (rs !== "none" && rs !== "") {
      refundRequests++;
      if (rs === "pending") {
        if (s === "refund_approved") refundApproved++;
        else refundProcessing++;
      } else if (rs === "processed") {
        refundProcessed++;
        totalRefunded += num(r.refund_amount);
      }
    }
  }

  const open =
    rows.length - rejected - closed;

  return {
    total: rows.length,
    newRequests,
    pendingReview,
    evidenceRequired,
    approvedReplacements,
    replacementDispatched,
    refundRequests,
    refundApproved,
    refundProcessing,
    refundProcessed,
    rejected,
    closed,
    open,
    totalRefunded,
  };
}

/**
 * Every refund, for the back office's records.
 */
export type RefundQuery = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listRefunds(q: RefundQuery = {}): Promise<
  (ReturnRefundRow & {
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  })[]
> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push(
      "(f.id LIKE ? OR f.return_id LIKE ? OR f.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR f.gateway_transaction_id LIKE ? OR f.gateway_refund_id LIKE ? OR f.original_payment_method LIKE ?)"
    );
    params.push(term, term, term, term, term, term, term, term);
  }
  if (q.status && q.status !== "all") {
    where.push("f.status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("date(f.created_at) >= date(?)");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(f.created_at) <= date(?)");
    params.push(q.to);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(q.limit ?? 25, 100));
  const offset = Math.max(0, q.offset ?? 0);

  const rows = (await db
    .prepare(
      `SELECT f.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
         FROM return_refunds f
         JOIN orders o ON o.id = f.order_id
         ${clause}
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)) as Row[];

  return rows.map((r) => ({
    id: str(r.id),
    return_id: str(r.return_id),
    order_id: str(r.order_id),
    user_id: r.user_id === null ? null : num(r.user_id),
    amount: num(r.amount),
    calculated_amount: r.calculated_amount === null ? null : num(r.calculated_amount),
    unit_price: r.unit_price === null ? null : num(r.unit_price),
    quantity: r.quantity === null ? null : num(r.quantity),
    payment_method: strOrNull(r.payment_method),
    original_payment_method: strOrNull(r.original_payment_method),
    gateway_transaction_id: strOrNull(r.gateway_transaction_id),
    gateway_payment_id: strOrNull(r.gateway_payment_id),
    gateway_refund_id: strOrNull(r.gateway_refund_id),
    settled_by: strOrNull(r.settled_by),
    confirmed_by: r.confirmed_by === null ? null : num(r.confirmed_by),
    confirmed_by_name: strOrNull(r.confirmed_by_name),
    status: str(r.status) as RefundStatus,
    approved_by: r.approved_by === null ? null : num(r.approved_by),
    approved_by_name: strOrNull(r.approved_by_name),
    approved_at: str(r.approved_at),
    initiated_at: strOrNull(r.initiated_at),
    completed_at: strOrNull(r.completed_at),
    failed_reason: strOrNull(r.failed_reason),
    notes: strOrNull(r.notes),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    customer_name: strOrNull(r.customer_name),
    customer_email: strOrNull(r.customer_email),
    customer_phone: strOrNull(r.customer_phone),
  }));
}

export type ReturnRefundRow = {
  id: string;
  return_id: string;
  order_id: string;
  user_id: number | null;
  amount: number;
  calculated_amount: number | null;
  unit_price: number | null;
  quantity: number | null;
  payment_method: string | null;
  original_payment_method: string | null;
  gateway_transaction_id: string | null;
  gateway_payment_id: string | null;
  gateway_refund_id: string | null;
  settled_by: string | null;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  status: RefundStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string;
  initiated_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function countRefunds(q: RefundQuery = {}): Promise<number> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push(
      "(f.id LIKE ? OR f.return_id LIKE ? OR f.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR f.gateway_transaction_id LIKE ? OR f.gateway_refund_id LIKE ? OR f.original_payment_method LIKE ?)"
    );
    params.push(term, term, term, term, term, term, term, term);
  }
  if (q.status && q.status !== "all") {
    where.push("f.status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("date(f.created_at) >= date(?)");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(f.created_at) <= date(?)");
    params.push(q.to);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS total FROM return_refunds f
         JOIN orders o ON o.id = f.order_id
         ${clause}`
    )
    .get(...params)) as { total?: number } | undefined;

  return num(row?.total);
}

/**
 * Every replacement, for the back office's records.
 */
export async function listReplacements(q: RefundQuery = {}): Promise<
  (ReturnReplacementRow & {
    customer_name: string | null;
    customer_email: string | null;
  })[]
> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push(
      "(rp.id LIKE ? OR rp.return_id LIKE ? OR rp.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR rp.tracking_number LIKE ? OR rp.shipment_ref LIKE ?)"
    );
    params.push(term, term, term, term, term, term, term);
  }
  if (q.status && q.status !== "all") {
    where.push("rp.delivery_status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("date(rp.created_at) >= date(?)");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(rp.created_at) <= date(?)");
    params.push(q.to);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(q.limit ?? 25, 100));
  const offset = Math.max(0, q.offset ?? 0);

  const rows = (await db
    .prepare(
      `SELECT rp.*, o.name AS customer_name, o.email AS customer_email
         FROM return_replacements rp
         JOIN orders o ON o.id = rp.order_id
         ${clause}
        ORDER BY rp.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)) as Row[];

  return rows.map((r) => ({
    id: str(r.id),
    return_id: str(r.return_id),
    order_id: str(r.order_id),
    kind: (str(r.kind) as "replacement" | "accessories") || "replacement",
    original_serial: strOrNull(r.original_serial),
    replacement_serial: strOrNull(r.replacement_serial),
    product_slug: strOrNull(r.product_slug),
    variant_id: strOrNull(r.variant_id),
    quantity: num(r.quantity) || 1,
    shipment_ref: strOrNull(r.shipment_ref),
    courier_name: strOrNull(r.courier_name),
    tracking_number: strOrNull(r.tracking_number),
    dispatch_date: strOrNull(r.dispatch_date),
    delivery_status: (str(r.delivery_status) as ReplacementStatus) || "dispatched",
    delivered_at: strOrNull(r.delivered_at),
    created_by: r.created_by === null ? null : num(r.created_by),
    created_by_name: strOrNull(r.created_by_name),
    notes: strOrNull(r.notes),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    customer_name: strOrNull(r.customer_name),
    customer_email: strOrNull(r.customer_email),
  }));
}

export type ReturnReplacementRow = {
  id: string;
  return_id: string;
  order_id: string;
  kind: "replacement" | "accessories";
  original_serial: string | null;
  replacement_serial: string | null;
  product_slug: string | null;
  variant_id: string | null;
  quantity: number;
  shipment_ref: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  delivery_status: ReplacementStatus;
  delivered_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function countReplacements(q: RefundQuery = {}): Promise<number> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push(
      "(rp.id LIKE ? OR rp.return_id LIKE ? OR rp.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR rp.tracking_number LIKE ? OR rp.shipment_ref LIKE ?)"
    );
    params.push(term, term, term, term, term, term, term);
  }
  if (q.status && q.status !== "all") {
    where.push("rp.delivery_status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("date(rp.created_at) >= date(?)");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(rp.created_at) <= date(?)");
    params.push(q.to);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS total FROM return_replacements rp
         JOIN orders o ON o.id = rp.order_id
         ${clause}`
    )
    .get(...params)) as { total?: number } | undefined;

  return num(row?.total);
}

/**
 * The history of one refund.
 *
 * Every step a refund takes is written down — who raised it, who sent
 * it to the gateway, what the gateway said, and who confirmed the money
 * had gone back. It is the record that answers "what happened to this
 * refund".
 */
export async function listRefundEvents(refundId: string): Promise<
  {
    id: number;
    refund_id: string;
    status: string;
    from_status: string | null;
    to_status: string | null;
    actor_type: string;
    actor_name: string | null;
    reference: string | null;
    amount: number | null;
    note: string | null;
    created_at: string;
  }[]
> {
  return (await getDb()
    .prepare(
      `SELECT id, refund_id, status, from_status, to_status, actor_type, actor_name,
              reference, amount, note, created_at
         FROM return_refund_events
        WHERE refund_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(refundId)) as never;
}

/**
 * The lines a refund is made of.
 */
export async function listRefundLines(refundId: string): Promise<
  {
    id: number;
    order_item_id: number | null;
    product_slug: string | null;
    name: string;
    unit_price: number;
    quantity: number;
    line_amount: number;
  }[]
> {
  return (await getDb()
    .prepare(
      `SELECT id, order_item_id, product_slug, name, unit_price, quantity, line_amount
         FROM return_refund_lines
        WHERE refund_id = ?
        ORDER BY id ASC`
    )
    .all(refundId)) as never;
}

/**
 * The refund, with its lines and its history.
 */
export async function getRefund(
  refundId: string
): Promise<(ReturnRefundRow & { customer_name: string | null; customer_email: string | null }) | null> {
  const refunds = await listRefunds({ limit: 100 });
  const found = refunds.find((r) => r.id === refundId);
  if (!found) return null;
  return found;
}

/**
 * The audit log of one request.
 */
export async function listAdminActions(returnId: string): Promise<
  {
    id: number;
    action: string;
    actor_name: string | null;
    actor_role: string | null;
    from_status: string | null;
    to_status: string | null;
    note: string | null;
    metadata: string | null;
    created_at: string;
  }[]
> {
  return (await getDb()
    .prepare(
      `SELECT id, action, actor_name, actor_role, from_status, to_status, note, metadata, created_at
         FROM admin_actions
        WHERE return_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(returnId)) as never;
}
