import { randomBytes } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./db";
import { withTransaction, putStockBack, takeStockForOrder } from "./inventory";
import type { Order } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

export * from "./return-status";
import {
  type ReturnType,
  type ReturnStatus,
  type ReturnItem,
  type ReturnImage,
  type ReturnEvent,
  type ReturnRequest,
  DEFAULT_RETURN_WINDOW_DAYS,
  RETURN_WINDOW_DAYS,
} from "./return-status";
import { getReturnWindowDays } from "./settings";

export function generateReturnId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `RET-${out}`;
}

/**
 * Calculates the exact return deadline in Indian Standard Time (UTC+5:30).
 * Default return window is 5 calendar days from delivery date.
 * If delivered on 10 November, return deadline is end of day 15 November (23:59:59.999 IST).
 */
export function calculateReturnDeadline(deliveredAt: string | null): {
  deadline: Date;
  deadlineIso: string;
  formattedDeadline: string;
  isExpired: boolean;
  daysRemaining: number;
  windowDays: number;
} {
  const windowDays = getReturnWindowDays();
  const delivery = deliveredAt ? new Date(deliveredAt) : new Date();

  // IST offset is +5 hours 30 minutes
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDelivery = new Date(delivery.getTime() + istOffsetMs);

  const year = istDelivery.getUTCFullYear();
  const month = istDelivery.getUTCMonth();
  const day = istDelivery.getUTCDate();

  // The deadline is the end of the day (23:59:59.999 IST) on day + windowDays
  const deadlineUtcMs = Date.UTC(year, month, day + windowDays, 23, 59, 59, 999) - istOffsetMs;
  const deadline = new Date(deadlineUtcMs);

  const now = Date.now();
  const isExpired = now > deadlineUtcMs;
  const msRemaining = Math.max(0, deadlineUtcMs - now);
  const daysRemaining = isExpired ? 0 : Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

  const formattedDeadline =
    deadline.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " IST";

  return {
    deadline,
    deadlineIso: deadline.toISOString(),
    formattedDeadline,
    isExpired,
    daysRemaining,
    windowDays,
  };
}

export type ItemReturnEligibility = {
  itemId: number;
  productSlug: string;
  name: string;
  isDelivered: boolean;
  isWindowActive: boolean;
  isWindowClosed: boolean;
  isReturnable: boolean;
  hasActiveRequest: boolean;
  activeRequest?: {
    id: string;
    type: ReturnType;
    status: ReturnStatus;
  };
  canReturn: boolean;
  canReplace: boolean;
  deadlineIso: string;
  formattedDeadline: string;
  daysRemaining: number;
  reason?: string;
};

export function getActiveReturnForItem(orderItemId: number): {
  id: string;
  type: ReturnType;
  status: ReturnStatus;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT rr.id, rr.type, rr.status
       FROM return_items ri
       JOIN return_requests rr ON ri.return_id = rr.id
       WHERE ri.order_item_id = ?
         AND rr.status NOT IN ('cancelled', 'rejected')
       ORDER BY rr.created_at DESC
       LIMIT 1`
    )
    .get(orderItemId) as Row | undefined;

  if (!row) return null;
  return {
    id: str(row.id),
    type: str(row.type) as ReturnType,
    status: str(row.status) as ReturnStatus,
  };
}

export function isProductReturnable(productSlug: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT returns FROM products WHERE slug = ?")
    .get(productSlug) as { returns?: string } | undefined;
  if (!row) return true;
  if (row.returns === "non-returnable" || row.returns === "no") return false;
  return true;
}

/**
 * Checks return and replacement eligibility separately for each product in an order.
 */
export function getOrderReturnEligibility(order: Order): {
  eligible: boolean;
  isDelivered: boolean;
  isWindowActive: boolean;
  isWindowClosed: boolean;
  windowDays: number;
  formattedDeadline: string;
  deadlineIso: string;
  daysRemaining: number;
  reason?: string;
  itemEligibilities: Record<number, ItemReturnEligibility>;
} {
  const isDelivered = order.status === "delivered";
  const deadlineCalc = calculateReturnDeadline(order.delivered_at ?? null);

  const isWindowActive = isDelivered && !deadlineCalc.isExpired;
  const isWindowClosed = isDelivered && deadlineCalc.isExpired;

  const itemEligibilities: Record<number, ItemReturnEligibility> = {};
  let anyItemCanReturn = false;

  for (let index = 0; index < order.items.length; index++) {
    const item = order.items[index];
    const key = item.id ?? index + 1;
    const activeReq = item.id ? getActiveReturnForItem(item.id) : null;
    const returnable = isProductReturnable(item.product_slug);

    let reason: string | undefined;
    let canReturn = false;
    let canReplace = false;

    if (!isDelivered) {
      reason = "Available once delivered";
    } else if (isWindowClosed) {
      reason = "Return Window Closed";
    } else if (!returnable) {
      reason = "Non-returnable product";
    } else if (activeReq) {
      reason = `Request already ${activeReq.status} (${activeReq.id})`;
    } else {
      canReturn = true;
      canReplace = true;
      anyItemCanReturn = true;
      reason = "Eligible for return or replacement";
    }

    itemEligibilities[key] = {
      itemId: key,
      productSlug: item.product_slug,
      name: item.name,
      isDelivered,
      isWindowActive,
      isWindowClosed,
      isReturnable: returnable,
      hasActiveRequest: !!activeReq,
      activeRequest: activeReq || undefined,
      canReturn,
      canReplace,
      deadlineIso: deadlineCalc.deadlineIso,
      formattedDeadline: deadlineCalc.formattedDeadline,
      daysRemaining: deadlineCalc.daysRemaining,
      reason,
    };
  }

  let orderReason: string | undefined;
  if (!isDelivered) {
    orderReason = "Returns can only be requested once your order has been delivered.";
  } else if (isWindowClosed) {
    orderReason = `The ${deadlineCalc.windowDays}-day return window closed on ${deadlineCalc.formattedDeadline}.`;
  } else if (!anyItemCanReturn) {
    orderReason = "All items in this order already have active requests or are non-returnable.";
  }

  return {
    eligible: isWindowActive && anyItemCanReturn,
    isDelivered,
    isWindowActive,
    isWindowClosed,
    windowDays: deadlineCalc.windowDays,
    formattedDeadline: deadlineCalc.formattedDeadline,
    deadlineIso: deadlineCalc.deadlineIso,
    daysRemaining: deadlineCalc.daysRemaining,
    reason: orderReason,
    itemEligibilities,
  };
}

/**
 * Checks whether an order is eligible for return or replacement.
 */
export function isReturnEligible(order: Order): {
  eligible: boolean;
  reason?: string;
  daysRemaining?: number;
  isDelivered?: boolean;
  isWindowClosed?: boolean;
  formattedDeadline?: string;
} {
  const res = getOrderReturnEligibility(order);
  return {
    eligible: res.eligible,
    reason: res.reason,
    daysRemaining: res.daysRemaining,
    isDelivered: res.isDelivered,
    isWindowClosed: res.isWindowClosed,
    formattedDeadline: res.formattedDeadline,
  };
}

/**
 * Maps a database row into a ReturnRequest with items, images, and events.
 */
function mapReturnRow(r: Row): ReturnRequest {
  const db = getDb();
  const id = str(r.id);

  const items = (
    db
      .prepare("SELECT * FROM return_items WHERE return_id = ? ORDER BY id ASC")
      .all(id) as Row[]
  ).map<ReturnItem>((it) => ({
    id: num(it.id),
    return_id: str(it.return_id),
    order_item_id: it.order_item_id === null ? null : num(it.order_item_id),
    product_slug: str(it.product_slug),
    variant_id: strOrNull(it.variant_id),
    name: str(it.name),
    price: num(it.price),
    quantity: num(it.quantity),
    reason_detail: strOrNull(it.reason_detail),
    qc_decision: (str(it.qc_decision) as ReturnItem["qc_decision"]) || "pending",
  }));

  const images = (
    db
      .prepare("SELECT * FROM return_images WHERE return_id = ? ORDER BY id ASC")
      .all(id) as Row[]
  ).map<ReturnImage>((im) => ({
    id: num(im.id),
    return_id: str(im.return_id),
    path: str(im.path),
    caption: strOrNull(im.caption),
    created_at: str(im.created_at),
  }));

  const events = (
    db
      .prepare("SELECT * FROM return_events WHERE return_id = ? ORDER BY created_at ASC, id ASC")
      .all(id) as Row[]
  ).map<ReturnEvent>((ev) => ({
    id: num(ev.id),
    return_id: str(ev.return_id),
    status: str(ev.status),
    actor_type: (str(ev.actor_type) as ReturnEvent["actor_type"]) || "system",
    actor_id: ev.actor_id === null ? null : num(ev.actor_id),
    actor_name: strOrNull(ev.actor_name),
    note: strOrNull(ev.note),
    created_at: str(ev.created_at),
  }));

  return {
    id,
    order_id: str(r.order_id),
    user_id: r.user_id === null ? null : num(r.user_id),
    type: (str(r.type) as ReturnType) || "return",
    status: (str(r.status) as ReturnStatus) || "requested",
    reason: str(r.reason),
    customer_notes: strOrNull(r.customer_notes),
    admin_notes: strOrNull(r.admin_notes),
    rejection_reason: strOrNull(r.rejection_reason),
    pickup_courier: strOrNull(r.pickup_courier),
    pickup_tracking: strOrNull(r.pickup_tracking),
    pickup_date: strOrNull(r.pickup_date),
    received_at: strOrNull(r.received_at),
    qc_status: (str(r.qc_status) as ReturnRequest["qc_status"]) || "pending",
    qc_notes: strOrNull(r.qc_notes),
    refund_amount: num(r.refund_amount),
    refund_status: (str(r.refund_status) as ReturnRequest["refund_status"]) || "none",
    refund_method: strOrNull(r.refund_method),
    refund_reference: strOrNull(r.refund_reference),
    refund_processed_at: strOrNull(r.refund_processed_at),
    replacement_order_id: strOrNull(r.replacement_order_id),
    replacement_courier: strOrNull(r.replacement_courier),
    replacement_tracking: strOrNull(r.replacement_tracking),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    items,
    images,
    events,
    customer_name: strOrNull(r.customer_name) ?? undefined,
    customer_email: strOrNull(r.customer_email) ?? undefined,
    customer_phone: strOrNull(r.customer_phone) ?? undefined,
  };
}

export function getReturnRequest(id: string): ReturnRequest | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.id = ?`
    )
    .get(id) as Row | undefined;

  return row ? mapReturnRow(row) : null;
}

export function getReturnRequestsForOrder(orderId: string): ReturnRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.order_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(orderId) as Row[];

  return rows.map(mapReturnRow);
}

export function getReturnRequestsForUser(userId: number): ReturnRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(userId) as Row[];

  return rows.map(mapReturnRow);
}

export type ReturnQuery = {
  q?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
};

export function listReturnRequests(q: ReturnQuery = {}): ReturnRequest[] {
  const db = getDb();
  const where: string[] = [];
  const params: SQLInputValue[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push("(r.id LIKE ? OR r.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ?)");
    params.push(term, term, term, term);
  }

  if (q.status && q.status !== "all") {
    where.push("r.status = ?");
    params.push(q.status);
  }

  if (q.type && q.type !== "all") {
    where.push("r.type = ?");
    params.push(q.type);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(q.limit ?? 25, 100));
  const offset = Math.max(0, q.offset ?? 0);

  const rows = db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       ${clause}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Row[];

  return rows.map(mapReturnRow);
}

export function countReturnRequests(q: ReturnQuery = {}): number {
  const db = getDb();
  const where: string[] = [];
  const params: SQLInputValue[] = [];

  if (q.q) {
    const term = `%${q.q.trim()}%`;
    where.push("(r.id LIKE ? OR r.order_id LIKE ? OR o.name LIKE ? OR o.email LIKE ?)");
    params.push(term, term, term, term);
  }

  if (q.status && q.status !== "all") {
    where.push("r.status = ?");
    params.push(q.status);
  }

  if (q.type && q.type !== "all") {
    where.push("r.type = ?");
    params.push(q.type);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       ${clause}`
    )
    .get(...params) as { total?: number } | undefined;

  return num(row?.total);
}

export function getReturnSummaryStats(): {
  total: number;
  requested: number;
  approved: number;
  pickupScheduled: number;
  received: number;
  completed: number;
  totalRefunded: number;
} {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, refund_amount, refund_status FROM return_requests")
    .all() as Row[];

  let requested = 0;
  let approved = 0;
  let pickupScheduled = 0;
  let received = 0;
  let completed = 0;
  let totalRefunded = 0;

  for (const r of rows) {
    const s = str(r.status);
    if (s === "requested") requested++;
    else if (s === "approved") approved++;
    else if (s === "pickup_scheduled") pickupScheduled++;
    else if (s === "received" || s === "qc_passed" || s === "qc_failed") received++;
    else if (s === "completed") completed++;

    if (str(r.refund_status) === "processed") {
      totalRefunded += num(r.refund_amount);
    }
  }

  return {
    total: rows.length,
    requested,
    approved,
    pickupScheduled,
    received,
    completed,
    totalRefunded,
  };
}

export type CreateReturnInput = {
  orderId: string;
  userId: number | null;
  type: ReturnType;
  reason: string;
  customerNotes?: string | null;
  imagePaths?: string[];
  items: {
    orderItemId: number;
    productSlug: string;
    variantId: string | null;
    name: string;
    price: number;
    quantity: number;
    reasonDetail?: string;
  }[];
};

/**
 * Creates a return or replacement request.
 */
export function createReturnRequest(input: CreateReturnInput): string {
  const db = getDb();
  const returnId = generateReturnId();

  withTransaction(db, () => {
    // 1. Insert return_requests row
    const refundEst =
      input.type === "return"
        ? input.items.reduce((sum, it) => sum + it.price * it.quantity, 0)
        : 0;

    db.prepare(
      `INSERT INTO return_requests
        (id, order_id, user_id, type, status, reason, customer_notes, refund_amount, refund_status)
       VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?)`
    ).run(
      returnId,
      input.orderId,
      input.userId,
      input.type,
      input.reason,
      input.customerNotes || null,
      refundEst,
      input.type === "return" ? "pending" : "none"
    );

    // 2. Insert items
    const insItem = db.prepare(
      `INSERT INTO return_items
        (return_id, order_item_id, product_slug, variant_id, name, price, quantity, reason_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const it of input.items) {
      insItem.run(
        returnId,
        it.orderItemId,
        it.productSlug,
        it.variantId || null,
        it.name,
        it.price,
        it.quantity,
        it.reasonDetail || null
      );
    }

    // 3. Insert images if provided
    if (input.imagePaths && input.imagePaths.length > 0) {
      const insImg = db.prepare(
        "INSERT INTO return_images (return_id, path) VALUES (?, ?)"
      );
      for (const p of input.imagePaths) {
        if (p && p.trim()) insImg.run(returnId, p.trim());
      }
    }

    // 4. Record initial event
    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, note)
       VALUES (?, 'requested', 'customer', ?, ?)`
    ).run(
      returnId,
      input.userId,
      `Customer initiated a ${input.type === "replacement" ? "replacement" : "return & refund"} request.`
    );
  });

  return returnId;
}

/**
 * Customer cancels their request before pickup.
 */
export function cancelReturnRequest(
  id: string,
  userId: number,
  note: string = "Cancelled by customer"
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const existing = db
      .prepare("SELECT status, user_id FROM return_requests WHERE id = ?")
      .get(id) as { status?: string; user_id?: number } | undefined;

    if (!existing) return { ok: false, message: "Request not found." };
    if (existing.user_id !== userId) {
      return { ok: false, message: "You can only cancel your own requests." };
    }
    if (existing.status !== "requested" && existing.status !== "approved") {
      return {
        ok: false,
        message: "This request has already progressed and cannot be cancelled directly. Please contact support.",
      };
    }

    db.prepare(
      "UPDATE return_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
    ).run(id);

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, note)
       VALUES (?, 'cancelled', 'customer', ?, ?)`
    ).run(id, userId, note);

    return { ok: true, message: "Your return request has been cancelled." };
  });
}

/**
 * Admin approves request.
 */
export function approveReturnRequest(
  id: string,
  staffUser: { id: number; name: string },
  adminNotes?: string
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (req.status !== "requested") {
      return { ok: false, message: `Request is already in '${req.status}' state.` };
    }

    db.prepare(
      `UPDATE return_requests
       SET status = 'approved', admin_notes = COALESCE(?, admin_notes), updated_at = datetime('now')
       WHERE id = ?`
    ).run(adminNotes || null, id);

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'approved', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      adminNotes ? `Approved: ${adminNotes}` : "Return request approved by staff."
    );

    return { ok: true, message: "Return request approved." };
  });
}

/**
 * Admin rejects request with explanation.
 */
export function rejectReturnRequest(
  id: string,
  staffUser: { id: number; name: string },
  rejectionReason: string
): { ok: boolean; message: string } {
  const db = getDb();
  const reason = rejectionReason.trim();
  if (!reason) return { ok: false, message: "Provide a reason for rejection." };

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    db.prepare(
      `UPDATE return_requests
       SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(reason, id);

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'rejected', 'staff', ?, ?, ?)`
    ).run(id, staffUser.id, staffUser.name, `Rejected: ${reason}`);

    return { ok: true, message: "Return request rejected." };
  });
}

/**
 * Admin schedules pickup with courier partner.
 */
export function schedulePickup(
  id: string,
  staffUser: { id: number; name: string },
  pickup: {
    courier: string;
    tracking: string;
    date: string;
    notes?: string;
  }
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    db.prepare(
      `UPDATE return_requests
       SET status = 'pickup_scheduled',
           pickup_courier = ?,
           pickup_tracking = ?,
           pickup_date = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(pickup.courier.trim(), pickup.tracking.trim(), pickup.date.trim(), id);

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'pickup_scheduled', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Pickup scheduled via ${pickup.courier} (AWB: ${pickup.tracking}) for ${pickup.date}.${
        pickup.notes ? ` Note: ${pickup.notes}` : ""
      }`
    );

    return { ok: true, message: "Pickup scheduled successfully." };
  });
}

/**
 * Admin marks item received and completes Quality Check (QC).
 */
export function recordQcInspection(
  id: string,
  staffUser: { id: number; name: string },
  inspection: {
    qcStatus: "passed" | "failed";
    notes: string;
    itemDecisions: {
      itemId: number;
      decision: "restock" | "write_off" | "reject";
    }[];
  }
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    const nextStatus = inspection.qcStatus === "passed" ? "qc_passed" : "qc_failed";
    const nowIso = new Date().toISOString();

    db.prepare(
      `UPDATE return_requests
       SET status = ?,
           received_at = COALESCE(received_at, ?),
           qc_status = ?,
           qc_notes = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      nextStatus,
      nowIso,
      inspection.qcStatus,
      inspection.notes.trim() || null,
      nowIso,
      id
    );

    const updItem = db.prepare(
      "UPDATE return_items SET qc_decision = ? WHERE id = ?"
    );

    // Apply inventory actions for items
    for (const d of inspection.itemDecisions) {
      updItem.run(d.decision, d.itemId);

      const itRow = db
        .prepare("SELECT * FROM return_items WHERE id = ?")
        .get(d.itemId) as Row | undefined;

      if (!itRow) continue;

      if (d.decision === "restock") {
        putStockBack(
          db,
          str(req.order_id),
          {
            id: num(itRow.order_item_id),
            product_slug: str(itRow.product_slug),
            variant_id: strOrNull(itRow.variant_id),
            quantity: num(itRow.quantity),
          },
          "return",
          `Return ${id} QC passed (restocked)`,
          inspection.notes || null,
          staffUser.id
        );
      } else if (d.decision === "write_off" && itRow.order_item_id) {
        db.prepare(
          "UPDATE order_items SET stock_state = 'written_off', stock_state_note = ? WHERE id = ?"
        ).run(`Return ${id} QC: written off`, num(itRow.order_item_id));
      }
    }

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, ?, 'staff', ?, ?, ?)`
    ).run(
      id,
      nextStatus,
      staffUser.id,
      staffUser.name,
      `QC Inspection: ${inspection.qcStatus.toUpperCase()}. ${inspection.notes}`
    );

    return { ok: true, message: `QC inspection recorded (${inspection.qcStatus}).` };
  });
}

/**
 * Admin issues and logs refund.
 */
export function processRefund(
  id: string,
  staffUser: { id: number; name: string },
  refund: {
    amount: number;
    method: string;
    reference: string;
    notes?: string;
  }
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    const nowIso = new Date().toISOString();

    db.prepare(
      `UPDATE return_requests
       SET status = 'completed',
           refund_status = 'processed',
           refund_amount = ?,
           refund_method = ?,
           refund_reference = ?,
           refund_processed_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      refund.amount,
      refund.method.trim(),
      refund.reference.trim(),
      nowIso,
      nowIso,
      id
    );

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'completed', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Refund of ₹${refund.amount.toLocaleString("en-IN")} processed via ${refund.method} (Ref: ${
        refund.reference
      }).${refund.notes ? ` Note: ${refund.notes}` : ""}`
    );

    return { ok: true, message: `Refund of ₹${refund.amount} recorded as processed.` };
  });
}

/**
 * Admin dispatches replacement.
 */
export function dispatchReplacement(
  id: string,
  staffUser: { id: number; name: string },
  replacement: {
    courier: string;
    tracking: string;
    notes?: string;
  }
): { ok: boolean; message: string } {
  const db = getDb();

  return withTransaction(db, () => {
    const req = db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    const items = db
      .prepare("SELECT * FROM return_items WHERE return_id = ?")
      .all(id) as Row[];

    // Deduct replacement units from inventory for fulfillment
    for (const item of items) {
      takeStockForOrder(
        db,
        str(req.order_id),
        str(item.product_slug),
        strOrNull(item.variant_id),
        num(item.quantity),
        str(item.name),
        staffUser.id,
        "sale"
      );
    }

    const nowIso = new Date().toISOString();
    const replacementRef = `REP-${randomBytes(3).toString("hex").toUpperCase()}`;

    db.prepare(
      `UPDATE return_requests
       SET status = 'completed',
           replacement_order_id = ?,
           replacement_courier = ?,
           replacement_tracking = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(replacementRef, replacement.courier.trim(), replacement.tracking.trim(), nowIso, id);

    db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'completed', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Replacement ${replacementRef} dispatched via ${replacement.courier} (Tracking: ${
        replacement.tracking
      }).${replacement.notes ? ` Note: ${replacement.notes}` : ""}`
    );

    return {
      ok: true,
      message: `Replacement dispatched (${replacementRef}) with tracking ${replacement.tracking}.`,
    };
  });
}

/**
 * Admin appends an internal note to a return request.
 */
export function addInternalNote(
  id: string,
  staffUser: { id: number; name: string },
  note: string
): { ok: boolean; message: string } {
  const db = getDb();
  const text = note.trim();
  if (!text) return { ok: false, message: "Enter a note." };

  db.prepare(
    `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
     VALUES (?, (SELECT status FROM return_requests WHERE id = ?), 'staff', ?, ?, ?)`
  ).run(id, id, staffUser.id, staffUser.name, `Staff Note: ${text}`);

  return { ok: true, message: "Note added to event log." };
}
