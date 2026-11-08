import { randomBytes } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { getDb, withTransaction } from "./db";
import {
  putStockBack,
  takeStockForOrder,
  stockOnHand,
  InventoryError,
} from "./inventory";
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
  type ReplacementDeliveryStatus,
  type ReplacementCandidate,
  type ReplacementOption,
  DEFAULT_RETURN_WINDOW_DAYS,
  RETURN_WINDOW_DAYS,
  RETURN_TYPE_LABEL,
  REPLACEMENT_DELIVERY_LABEL,
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
 * Default return window is 7 calendar days from delivery date.
 * If delivered on 10 November, return deadline is end of day 17 November (23:59:59.999 IST).
 */
export async function calculateReturnDeadline(deliveredAt: string | null): Promise<{
  deadline: Date;
  deadlineIso: string;
  formattedDeadline: string;
  isExpired: boolean;
  daysRemaining: number;
  windowDays: number;
}> {
  const windowDays = (await getReturnWindowDays());
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

export async function getActiveReturnForItem(orderItemId: number): Promise<{
  id: string;
  type: ReturnType;
  status: ReturnStatus;
} | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `SELECT rr.id, rr.type, rr.status
       FROM return_items ri
       JOIN return_requests rr ON ri.return_id = rr.id
       WHERE ri.order_item_id = ?
         AND rr.status NOT IN ('cancelled', 'rejected')
       ORDER BY rr.created_at DESC
       LIMIT 1`
    )
    .get(orderItemId)) as Row | undefined;

  if (!row) return null;
  return {
    id: str(row.id),
    type: str(row.type) as ReturnType,
    status: str(row.status) as ReturnStatus,
  };
}

export async function isProductReturnable(productSlug: string): Promise<boolean> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT returns FROM products WHERE slug = ?")
    .get(productSlug)) as { returns?: string } | undefined;
  if (!row) return true;
  if (row.returns === "non-returnable" || row.returns === "no") return false;
  return true;
}

/**
 * Checks return and replacement eligibility separately for each product in an order.
 */
export async function getOrderReturnEligibility(order: Order): Promise<{
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
}> {
  const isDelivered = order.status === "delivered";
  const deadlineCalc = (await calculateReturnDeadline(order.delivered_at ?? null));

  const isWindowActive = isDelivered && !deadlineCalc.isExpired;
  const isWindowClosed = isDelivered && deadlineCalc.isExpired;

  const itemEligibilities: Record<number, ItemReturnEligibility> = {};
  let anyItemCanReturn = false;

  for (let index = 0; index < order.items.length; index++) {
    const item = order.items[index];
    const key = item.id ?? index + 1;
    const activeReq = item.id ? (await getActiveReturnForItem(item.id)) : null;
    const returnable = (await isProductReturnable(item.product_slug));

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
export async function isReturnEligible(order: Order): Promise<{
  eligible: boolean;
  reason?: string;
  daysRemaining?: number;
  isDelivered?: boolean;
  isWindowClosed?: boolean;
  formattedDeadline?: string;
}> {
  const res = (await getOrderReturnEligibility(order));
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
async function mapReturnRow(r: Row): Promise<ReturnRequest> {
  const db = getDb();
  const id = str(r.id);

  const items = (
    (await db
      .prepare("SELECT * FROM return_items WHERE return_id = ? ORDER BY id ASC")
      .all(id)) as Row[]
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
    replacement_product_slug: strOrNull(it.replacement_product_slug),
    replacement_variant_id: strOrNull(it.replacement_variant_id),
    replacement_quantity:
      it.replacement_quantity === null || it.replacement_quantity === undefined
        ? null
        : num(it.replacement_quantity),
  }));

  const images = (
    (await db
      .prepare("SELECT * FROM return_images WHERE return_id = ? ORDER BY id ASC")
      .all(id)) as Row[]
  ).map<ReturnImage>((im) => ({
    id: num(im.id),
    return_id: str(im.return_id),
    path: str(im.path),
    caption: strOrNull(im.caption),
    kind: (str(im.kind) as ReturnImage["kind"]) || "photo",
    created_at: str(im.created_at),
  }));

  const events = (
    (await db
      .prepare("SELECT * FROM return_events WHERE return_id = ? ORDER BY created_at ASC, id ASC")
      .all(id)) as Row[]
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
    replacement_product_slug: strOrNull(r.replacement_product_slug),
    replacement_variant_id: strOrNull(r.replacement_variant_id),
    replacement_dispatch_date: strOrNull(r.replacement_dispatch_date),
    replacement_delivery_status:
      (strOrNull(r.replacement_delivery_status) as ReturnRequest["replacement_delivery_status"]) ??
      null,
    replacement_delivered_at: strOrNull(r.replacement_delivered_at),
    serial_number: strOrNull(r.serial_number),
    sealed_state:
      (strOrNull(r.sealed_state) as ReturnRequest["sealed_state"]) ?? null,
    missing_accessories: strOrNull(r.missing_accessories),
    accessories_courier: strOrNull(r.accessories_courier),
    accessories_tracking: strOrNull(r.accessories_tracking),
    accessories_dispatched_at: strOrNull(r.accessories_dispatched_at),
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

export async function getReturnRequest(id: string): Promise<ReturnRequest | null> {
  const db = getDb();
  const row = (await db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.id = ?`
    )
    .get(id)) as Row | undefined;

  return row ? (await mapReturnRow(row)) : null;
}

export async function getReturnRequestsForOrder(orderId: string): Promise<ReturnRequest[]> {
  const db = getDb();
  const rows = (await db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.order_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(orderId)) as Row[];

  return await Promise.all(rows.map(mapReturnRow));
}

export async function getReturnRequestsForUser(userId: number): Promise<ReturnRequest[]> {
  const db = getDb();
  const rows = (await db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(userId)) as Row[];

  return await Promise.all(rows.map(mapReturnRow));
}

export type ReturnQuery = {
  q?: string;
  status?: string;
  type?: string;
  /** Only requests with a refund — raised or already settled. */
  refunds?: boolean;
  /** Requests made on or after this date (YYYY-MM-DD). */
  from?: string;
  /** Requests made on or before this date (YYYY-MM-DD). */
  to?: string;
  /** "newest" (the default), "oldest", "amount", "customer" or "status". */
  sort?: string;
  limit?: number;
  offset?: number;
};

/**
 * The condition a query is filtered by, and the values that go with it.
 *
 * The list and the count both need this, and a listing that says there are
 * forty requests and then shows thirty is worse than no listing at all.
 */
function returnFilter(q: ReturnQuery): { clause: string; params: SQLInputValue[] } {
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

  if (q.refunds) {
    where.push("r.refund_status IN ('pending', 'processed')");
  }

  if (q.from) {
    where.push("date(r.created_at) >= date(?)");
    params.push(q.from);
  }

  if (q.to) {
    where.push("date(r.created_at) <= date(?)");
    params.push(q.to);
  }

  return {
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

/** The order the list is shown in. The name is checked against a list. */
function returnOrder(sort: string | undefined): string {
  switch (sort) {
    case "oldest":
      return "r.created_at ASC";
    case "amount":
      return "r.refund_amount DESC, r.created_at DESC";
    case "customer":
      return "o.name ASC, r.created_at DESC";
    case "status":
      return "r.status ASC, r.created_at DESC";
    default:
      return "r.created_at DESC";
  }
}

export async function listReturnRequests(q: ReturnQuery = {}): Promise<ReturnRequest[]> {
  const db = getDb();
  const { clause, params } = returnFilter(q);
  const limit = Math.max(1, Math.min(q.limit ?? 25, 100));
  const offset = Math.max(0, q.offset ?? 0);

  const rows = (await db
    .prepare(
      `SELECT r.*, o.name AS customer_name, o.email AS customer_email, o.phone AS customer_phone
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       ${clause}
       ORDER BY ${returnOrder(q.sort)}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)) as Row[];

  return await Promise.all(rows.map(mapReturnRow));
}

export async function countReturnRequests(q: ReturnQuery = {}): Promise<number> {
  const db = getDb();
  const { clause, params } = returnFilter(q);

  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       ${clause}`
    )
    .get(...params)) as { total?: number } | undefined;

  return num(row?.total);
}

export async function getReturnSummaryStats(): Promise<{
  total: number;
  requested: number;
  approved: number;
  pickupScheduled: number;
  received: number;
  completed: number;
  totalRefunded: number;
  /** Refunds that have been initiated but not yet settled. */
  refundsPending: number;
  /** Requests where the customer has been asked for more information. */
  infoRequested: number;
  /** Every request that has not been closed yet. */
  open: number;
}> {
  const db = getDb();
  const rows = (await db
    .prepare("SELECT status, refund_amount, refund_status FROM return_requests")
    .all()) as Row[];

  let requested = 0;
  let approved = 0;
  let pickupScheduled = 0;
  let received = 0;
  let completed = 0;
  let totalRefunded = 0;
  let refundsPending = 0;
  let infoRequested = 0;

  for (const r of rows) {
    const s = str(r.status);
    if (s === "requested") requested++;
    else if (s === "info_requested") infoRequested++;
    else if (s === "approved") approved++;
    else if (s === "pickup_scheduled") pickupScheduled++;
    else if (s === "received" || s === "qc_passed" || s === "qc_failed") received++;
    else if (s === "completed") completed++;

    if (str(r.refund_status) === "processed") {
      totalRefunded += num(r.refund_amount);
    } else if (str(r.refund_status) === "pending") {
      refundsPending++;
    }
  }

  const open = rows.length - completed - rows.filter((r) => str(r.status) === "rejected").length - rows.filter((r) => str(r.status) === "cancelled").length;

  return {
    total: rows.length,
    requested,
    approved,
    pickupScheduled,
    received,
    completed,
    totalRefunded,
    refundsPending,
    infoRequested,
    open,
  };
}

export type CreateReturnInput = {
  orderId: string;
  userId: number | null;
  type: ReturnType;
  reason: string;
  customerNotes?: string | null;
  /**
   * The evidence the customer sent. A photograph and an unboxing video
   * are both evidence, and they are kept apart so the back office can
   * tell which is which.
   */
  evidence?: { path: string; kind: "photo" | "video" }[];
  /** The serial number of the unit, where the customer has given one. */
  serialNumber?: string | null;
  /** Whether the customer says the unit is still sealed. */
  sealedState?: "sealed" | "opened" | null;
  /** What the customer says is missing from the box. */
  missingAccessories?: string | null;
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
export async function createReturnRequest(input: CreateReturnInput): Promise<string> {
  const db = getDb();
  const returnId = generateReturnId();

  (await withTransaction(async (db) => {
    // 1. Insert return_requests row
    const refundEst =
      input.type === "return"
        ? input.items.reduce((sum, it) => sum + it.price * it.quantity, 0)
        : 0;

    (await db.prepare(
      `INSERT INTO return_requests
        (id, order_id, user_id, type, status, reason, customer_notes, refund_amount, refund_status,
         serial_number, sealed_state, missing_accessories)
       VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      returnId,
      input.orderId,
      input.userId,
      input.type,
      input.reason,
      input.customerNotes || null,
      refundEst,
      input.type === "return" ? "pending" : "none",
      input.serialNumber || null,
      input.sealedState || null,
      input.missingAccessories || null
    ));

    // 2. Insert items
    const insItem = db.prepare(
      `INSERT INTO return_items
        (return_id, order_item_id, product_slug, variant_id, name, price, quantity, reason_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const it of input.items) {
      await insItem.run(
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

    // 3. Insert the evidence, photographs and videos alike
    if (input.evidence && input.evidence.length > 0) {
      const insImg = db.prepare(
        "INSERT INTO return_images (return_id, path, kind) VALUES (?, ?, ?)"
      );
      for (const e of input.evidence) {
        if (e.path && e.path.trim()) {
          await insImg.run(returnId, e.path.trim(), e.kind);
        }
      }
    }

    // 4. Record initial event
    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, note)
       VALUES (?, 'requested', 'customer', ?, ?)`
    ).run(
      returnId,
      input.userId,
      `Customer initiated a ${RETURN_TYPE_LABEL[input.type] ?? "return"} request.`
    ));
  }));

  return returnId;
}

/**
 * Customer cancels their request before pickup.
 */
export async function cancelReturnRequest(
  id: string,
  userId: number,
  note: string = "Cancelled by customer"
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const existing = (await db
      .prepare("SELECT status, user_id FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string; user_id?: number } | undefined;

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

    (await db.prepare(
      "UPDATE return_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
    ).run(id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, note)
       VALUES (?, 'cancelled', 'customer', ?, ?)`
    ).run(id, userId, note));

    return { ok: true, message: "Your return request has been cancelled." };
  }));
}

/**
 * Admin approves request.
 */
export async function approveReturnRequest(
  id: string,
  staffUser: { id: number; name: string },
  adminNotes?: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    // A request the customer has been asked about can still be decided —
    // the answer may have come by phone or by email.
    if (req.status !== "requested" && req.status !== "info_requested") {
      return { ok: false, message: `Request is already in '${req.status}' state.` };
    }

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'approved', admin_notes = COALESCE(?, admin_notes), updated_at = datetime('now')
       WHERE id = ?`
    ).run(adminNotes || null, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'approved', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      adminNotes ? `Approved: ${adminNotes}` : "Return request approved by staff."
    ));

    return { ok: true, message: "Return request approved." };
  }));
}

/**
 * Admin rejects request with explanation.
 */
export async function rejectReturnRequest(
  id: string,
  staffUser: { id: number; name: string },
  rejectionReason: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const reason = rejectionReason.trim();
  if (!reason) return { ok: false, message: "Provide a reason for rejection." };

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(reason, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'rejected', 'staff', ?, ?, ?)`
    ).run(id, staffUser.id, staffUser.name, `Rejected: ${reason}`));

    return { ok: true, message: "Return request rejected." };
  }));
}

/**
 * Admin schedules pickup with courier partner.
 */
export async function schedulePickup(
  id: string,
  staffUser: { id: number; name: string },
  pickup: {
    courier: string;
    tracking: string;
    date: string;
    notes?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    // A pickup is arranged while the request is open. It cannot be
    // arranged against one that has already been settled.
    if (
      !["requested", "info_requested", "approved", "pickup_scheduled"].includes(
        req.status ?? ""
      )
    ) {
      return {
        ok: false,
        message: `A pickup cannot be scheduled on a request that is '${req.status}'.`,
      };
    }

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'pickup_scheduled',
           pickup_courier = ?,
           pickup_tracking = ?,
           pickup_date = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(pickup.courier.trim(), pickup.tracking.trim(), pickup.date.trim(), id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'pickup_scheduled', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Pickup scheduled via ${pickup.courier} (AWB: ${pickup.tracking}) for ${pickup.date}.${
        pickup.notes ? ` Note: ${pickup.notes}` : ""
      }`
    ));

    return { ok: true, message: "Pickup scheduled successfully." };
  }));
}

/**
 * Admin marks item received and completes Quality Check (QC).
 */
export async function recordQcInspection(
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
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };

    const nextStatus = inspection.qcStatus === "passed" ? "qc_passed" : "qc_failed";
    const nowIso = new Date().toISOString();

    (await db.prepare(
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
    ));

    const updItem = db.prepare(
      "UPDATE return_items SET qc_decision = ? WHERE id = ?"
    );

    // Apply inventory actions for items
    for (const d of inspection.itemDecisions) {
      await updItem.run(d.decision, d.itemId);

      const itRow = (await db
        .prepare("SELECT * FROM return_items WHERE id = ?")
        .get(d.itemId)) as Row | undefined;

      if (!itRow) continue;

      if (d.decision === "restock") {
        (await putStockBack(
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
        ));
      } else if (d.decision === "write_off" && itRow.order_item_id) {
        (await db.prepare(
          "UPDATE order_items SET stock_state = 'written_off', stock_state_note = ? WHERE id = ?"
        ).run(`Return ${id} QC: written off`, num(itRow.order_item_id)));
      }
    }

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, ?, 'staff', ?, ?, ?)`
    ).run(
      id,
      nextStatus,
      staffUser.id,
      staffUser.name,
      `QC Inspection: ${inspection.qcStatus.toUpperCase()}. ${inspection.notes}`
    ));

    return { ok: true, message: `QC inspection recorded (${inspection.qcStatus}).` };
  }));
}

/**
 * Admin approves a refund.
 *
 * The refund is raised here and nothing more. It is not money back to the
 * customer yet — that is confirmed separately, with the reference the
 * payment went out under. A refund that is only approved is pending, and
 * it is tracked as pending until somebody says it has actually been paid.
 */
export async function initiateRefund(
  id: string,
  staffUser: { id: number; name: string },
  refund: {
    amount: number;
    method: string;
    notes?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (req.status === "completed" || req.status === "rejected") {
      return { ok: false, message: `Request is already '${req.status}'.` };
    }
    if (str(req.refund_status) === "pending") {
      return { ok: false, message: "The refund has already been raised." };
    }
    if (!refund.amount || refund.amount <= 0) {
      return { ok: false, message: "Enter the amount to refund." };
    }

    const nowIso = new Date().toISOString();

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'refund_pending',
           refund_status = 'pending',
           refund_amount = ?,
           refund_method = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(refund.amount, refund.method.trim(), nowIso, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'refund_pending', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Refund of ₹${refund.amount.toLocaleString("en-IN")} approved via ${
        refund.method
      }.${refund.notes ? ` Note: ${refund.notes}` : ""}`
    ));

    return { ok: true, message: `Refund of ₹${refund.amount} raised.` };
  }));
}

/**
 * Admin confirms the refund has actually been paid.
 *
 * This is the step that makes the refund a refund. Until it happens the
 * money has only been promised, and the request says so.
 */
export async function confirmRefundPaid(
  id: string,
  staffUser: { id: number; name: string },
  payment: {
    reference: string;
    notes?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const reference = payment.reference.trim();
  if (!reference) {
    return { ok: false, message: "Enter the reference the refund was paid under." };
  }

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (str(req.refund_status) === "processed") {
      return { ok: false, message: "The refund has already been confirmed as paid." };
    }
    if (str(req.refund_status) !== "pending") {
      return { ok: false, message: "There is no refund waiting to be paid." };
    }

    const nowIso = new Date().toISOString();

    (await db.prepare(
      `UPDATE return_requests
       SET refund_status = 'processed',
           refund_reference = ?,
           refund_processed_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(reference, nowIso, nowIso, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'refund_pending', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Refund of ₹${num(req.refund_amount).toLocaleString("en-IN")} confirmed as paid (Ref: ${reference}).${
        payment.notes ? ` Note: ${payment.notes}` : ""
      }`
    ));

    return { ok: true, message: "The refund is recorded as paid." };
  }));
}

/**
 * Admin refuses the refund, with the reason on the record.
 *
 * The request is closed as refused, and the customer can see why.
 */
export async function rejectRefund(
  id: string,
  staffUser: { id: number; name: string },
  reason: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const text = reason.trim();
  if (!text) return { ok: false, message: "Say why the refund is being refused." };

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (str(req.refund_status) === "processed") {
      return { ok: false, message: "The refund has already been paid." };
    }
    if (req.status === "completed" || req.status === "rejected") {
      return { ok: false, message: `Request is already '${req.status}'.` };
    }

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'rejected',
           refund_status = 'failed',
           rejection_reason = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(text, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'rejected', 'staff', ?, ?, ?)`
    ).run(id, staffUser.id, staffUser.name, `Refund refused: ${text}`));

    return { ok: true, message: "The refund has been refused." };
  }));
}

/**
 * Admin closes a request.
 *
 * A refund that has been raised but not confirmed as paid keeps the
 * request open — a request is not finished while the money has not gone
 * back to the customer, and closing it does not settle the refund.
 */
export async function markCompleted(
  id: string,
  staffUser: { id: number; name: string },
  notes?: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT * FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (req.status === "completed") {
      return { ok: false, message: "Request is already completed." };
    }
    if (str(req.refund_status) === "pending") {
      return {
        ok: false,
        message:
          "The refund has been raised but not confirmed as paid. Confirm the refund first.",
      };
    }
    // A replacement is not finished while it is still on its way. It is
    // either delivered, or it has come back to us — either way the
    // shipment has reached the end of its journey.
    if (
      str(req.type) === "replacement" &&
      str(req.replacement_order_id) &&
      !["delivered", "returned"].includes(str(req.replacement_delivery_status))
    ) {
      return {
        ok: false,
        message:
          "The replacement has not been delivered yet. Record where it has got to first.",
      };
    }
    // And a replacement that was never dispatched is not finished either.
    if (str(req.type) === "replacement" && !str(req.replacement_order_id)) {
      return {
        ok: false,
        message: "No replacement has been dispatched for this request yet.",
      };
    }

    const nowIso = new Date().toISOString();

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'completed', updated_at = ?
       WHERE id = ?`
    ).run(nowIso, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'completed', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      notes?.trim() ? `Request completed. ${notes.trim()}` : "Request completed."
    ));

    return { ok: true, message: "Request completed." };
  }));
}

/**
 * Sends the missing accessories to the customer.
 *
 * The unit stays where it is — nothing is collected and nothing is
 * refunded. The parts go out with a courier and a tracking number, and
 * the case is closed when they have been sent. The customer keeps the
 * console, the controller, and the receipt for what they were sent.
 */
export async function dispatchMissingAccessories(
  id: string,
  staffUser: { id: number; name: string },
  input: { courier: string; tracking: string; notes?: string }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const courier = input.courier.trim();
  const tracking = input.tracking.trim();

  if (!courier) return { ok: false, message: "Say which courier the parts went with." };
  if (!tracking) return { ok: false, message: "Give the tracking number for the parts." };

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status, type FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string; type?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (str(req.type) !== "accessories") {
      return {
        ok: false,
        message: "This is not a missing-accessories request.",
      };
    }
    if (req.status === "completed" || req.status === "rejected") {
      return { ok: false, message: `Request is already '${req.status}'.` };
    }

    const nowIso = new Date().toISOString();

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'completed',
           accessories_courier = ?,
           accessories_tracking = ?,
           accessories_dispatched_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(courier, tracking, nowIso, nowIso, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'completed', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      input.notes?.trim()
        ? `Missing accessories dispatched with ${courier} (${tracking}). ${input.notes.trim()}`
        : `Missing accessories dispatched with ${courier} (${tracking}).`
    ));

    return {
      ok: true,
      message: "The missing accessories have been sent to the customer.",
    };
  }));
}

/**
 * Admin asks the customer for more information.
 *
 * The request stays open and the question is shown to the customer on
 * their own page, so they can answer and the staff can carry on.
 */
export async function requestMoreInformation(
  id: string,
  staffUser: { id: number; name: string },
  message: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const text = message.trim();
  if (!text) return { ok: false, message: "Say what you need from the customer." };

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (req.status === "completed" || req.status === "rejected") {
      return { ok: false, message: `Request is already '${req.status}'.` };
    }

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'info_requested', admin_notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(text, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'info_requested', 'staff', ?, ?, ?)`
    ).run(id, staffUser.id, staffUser.name, `More information requested: ${text}`));

    return { ok: true, message: "The customer has been asked for more information." };
  }));
}

/**
 * Admin records that the returned product has arrived.
 *
 * Marking it received is what puts it in the queue for inspection.
 */
export async function markProductReceived(
  id: string,
  staffUser: { id: number; name: string },
  notes?: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT status FROM return_requests WHERE id = ?")
      .get(id)) as { status?: string } | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (req.status !== "pickup_scheduled" && req.status !== "approved") {
      return { ok: false, message: "Only a scheduled pickup can be received." };
    }

    (await db.prepare(
      `UPDATE return_requests
       SET status = 'received', received_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'received', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      notes?.trim()
        ? `Product received at the warehouse. ${notes.trim()}`
        : "Product received at the warehouse."
    ));

    return { ok: true, message: "Product marked as received." };
  }));
}

/**
 * What can be sent in place of what came back, and how many of each are on
 * the shelf.
 *
 * The unit that came back is always offered first — usually it is the
 * right one. After it come the other options of the same product, and
 * then whatever else the store has in stock in the same category, for the
 * times the option the customer wants has run out.
 */
export async function replacementCandidates(id: string): Promise<ReplacementCandidate[]> {
  const db = getDb();
  const items = (await db
    .prepare("SELECT * FROM return_items WHERE return_id = ?")
    .all(id)) as Row[];

  const product = async (slug: string) =>
    (await db
      .prepare("SELECT slug, name, category_slug FROM products WHERE slug = ?")
      .get(slug)) as { slug?: string; name?: string; category_slug?: string } | undefined;

  const variantsOf = async (slug: string) =>
    (await db
      .prepare(
        "SELECT id, name, stock FROM variants WHERE product_slug = ? ORDER BY position, name"
      )
      .all(slug)) as { id?: string; name?: string; stock?: number }[];

  const onHand = async (slug: string, variantId: string | null): Promise<number> => {
    if (variantId) {
      const row = (await db
        .prepare("SELECT stock FROM variants WHERE id = ? AND product_slug = ?")
        .get(variantId, slug)) as { stock?: number } | undefined;
      return num(row?.stock);
    }
    const row = (await db
      .prepare("SELECT stock FROM products WHERE slug = ?")
      .get(slug)) as { stock?: number } | undefined;
    return num(row?.stock);
  };

  const candidates: ReplacementCandidate[] = [];

  for (const item of items) {
    const slug = str(item.product_slug);
    const variantId = strOrNull(item.variant_id);
    const own = (await product(slug));
    const options: ReplacementOption[] = [];

    const variants = (await variantsOf(slug));
    if (variants.length) {
      for (const v of variants) {
        options.push({
          value: `${slug}::${str(v.id)}`,
          label: str(v.name),
          productSlug: slug,
          variantId: str(v.id),
          stock: num(v.stock),
          current: str(v.id) === variantId,
        });
      }
    } else {
      options.push({
        value: slug,
        label: str(own?.name),
        productSlug: slug,
        variantId: null,
        stock: (await onHand(slug, null)),
        current: true,
      });
    }

    // Whatever else is on the shelf in the same category.
    const category = own?.category_slug;
    if (category) {
      const others = (await db
        .prepare(
          `SELECT slug, name FROM products
           WHERE category_slug = ? AND slug != ? AND status = 'published'
           ORDER BY name LIMIT 12`
        )
        .all(category, slug)) as { slug?: string; name?: string }[];

      for (const other of others) {
        const otherVariants = (await variantsOf(str(other.slug)));
        if (otherVariants.length) {
          for (const v of otherVariants) {
            const stock = num(v.stock);
            if (stock <= 0) continue;
            options.push({
              value: `${str(other.slug)}::${str(v.id)}`,
              label: `${str(other.name)} — ${str(v.name)}`,
              productSlug: str(other.slug),
              variantId: str(v.id),
              stock,
              current: false,
            });
          }
        } else {
          const stock = (await onHand(str(other.slug), null));
          if (stock <= 0) continue;
          options.push({
            value: str(other.slug),
            label: str(other.name),
            productSlug: str(other.slug),
            variantId: null,
            stock,
            current: false,
          });
        }
      }
    }

    candidates.push({
      itemId: num(item.id),
      itemName: str(item.name),
      quantity: num(item.quantity),
      options,
    });
  }

  return candidates;
}

/**
 * Admin creates the replacement shipment.
 *
 * A request gets one shipment, and only one. The move is made by a single
 * guarded write — the first write in the transaction, so it takes the write
 * lock before anything has been read. A second attempt, whether a double
 * click, a retry after a dropped connection, or two members of staff at
 * once, waits for the first and then finds the request already has a
 * shipment: it does nothing, and the shelf is left alone.
 *
 * The stock comes out with the shipment's own reference in the history, so
 * the unit that went out can be traced back to it. It is taken as a
 * replacement and not as a sale, because it is not a second sale of the
 * original order.
 */
export async function dispatchReplacement(
  id: string,
  staffUser: { id: number; name: string },
  replacement: {
    courier: string;
    tracking: string;
    dispatchDate?: string | null;
    notes?: string;
  },
  choices: {
    itemId: number;
    productSlug: string;
    variantId: string | null;
    quantity: number;
  }[]
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const courier = replacement.courier.trim();
  const tracking = replacement.tracking.trim();

  if (!courier) return { ok: false, message: "Name the courier carrying the replacement." };
  if (!tracking) return { ok: false, message: "Enter the tracking or AWB number." };

  const ref = `REP-${randomBytes(4).toString("hex").toUpperCase()}`;
  const dispatchDate = replacement.dispatchDate?.trim() || null;

  return (await withTransaction(async (db) => {
    // The gate. Nothing has been read yet, so this takes the write lock
    // straight away and the whole of the rest of the work is done under
    // it. If it changes nothing, the request already has its shipment —
    // or is not ready for one — and no stock moves.
    const gate = (await db
      .prepare(
        `UPDATE return_requests
         SET status = 'replacement_pending',
             replacement_order_id = ?,
             replacement_courier = ?,
             replacement_tracking = ?,
             replacement_dispatch_date = ?,
             replacement_delivery_status = 'dispatched',
             updated_at = datetime('now')
         WHERE id = ?
           AND replacement_order_id IS NULL
           AND (status = 'qc_passed' OR (status = 'received' AND qc_status = 'passed'))`
      )
      .run(ref, courier, tracking, dispatchDate, id));

    if (gate.changes === 0) {
      return {
        ok: false,
        message:
          "This request has already had a replacement dispatched, or it is not ready for one.",
      };
    }

    const req = (await db
      .prepare("SELECT order_id FROM return_requests WHERE id = ?")
      .get(id)) as { order_id?: string } | undefined;
    const orderId = str(req?.order_id);

    const items = (await db
      .prepare("SELECT * FROM return_items WHERE return_id = ?")
      .all(id)) as Row[];

    // What is going out, item by item. It is not always the unit that
    // came back — sometimes the option the customer wants is the one
    // that is on the shelf.
    for (const item of items) {
      const choice = choices.find((c) => c.itemId === num(item.id));
      const slug = choice?.productSlug?.trim() || str(item.product_slug);
      const variantId = choice?.variantId?.trim() || strOrNull(item.variant_id);
      const quantity =
        choice && choice.quantity > 0 ? Math.round(choice.quantity) : num(item.quantity);

      // The shelf has to have it. A replacement cannot be sent on
      // backorder — the customer is waiting for a unit.
      const onHand = (await stockOnHand(db, slug, variantId));
      if (onHand < quantity) {
        throw new InventoryError(
          `Only ${onHand} of ${str(item.name)} left in stock — the replacement needs ${quantity}.`
        );
      }

      (await takeStockForOrder(
        db,
        orderId,
        slug,
        variantId,
        quantity,
        str(item.name),
        staffUser.id,
        "replacement",
        `Replacement ${ref} for request ${id}`
      ));

      (await db.prepare(
        `UPDATE return_items
         SET replacement_product_slug = ?, replacement_variant_id = ?, replacement_quantity = ?
         WHERE id = ?`
      ).run(slug, variantId, quantity, num(item.id)));
    }

    // What is going out. Each item carries its own choice; this is the
    // headline of it — the unit the request is really about.
    const firstChoice = choices.find((c) => c.productSlug);
    if (firstChoice) {
      (await db.prepare(
        `UPDATE return_requests
         SET replacement_product_slug = ?, replacement_variant_id = ?
         WHERE id = ?`
      ).run(firstChoice.productSlug, firstChoice.variantId, id));
    }

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'replacement_pending', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Replacement ${ref} dispatched via ${courier} (Tracking: ${tracking}).${
        replacement.notes ? ` Note: ${replacement.notes}` : ""
      }`
    ));

    return {
      ok: true,
      message: `Replacement ${ref} dispatched with tracking ${tracking}.`,
    };
  }));
}

/**
 * Admin records where the replacement has got to.
 *
 * The delivery is what the customer is waiting for, so it is kept apart
 * from the request's own status — a replacement is on its way while the
 * request is still open.
 */
export async function setReplacementDelivery(
  id: string,
  staffUser: { id: number; name: string },
  delivery: {
    status: ReplacementDeliveryStatus;
    notes?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();

  return (await withTransaction(async (db) => {
    const req = (await db
      .prepare("SELECT replacement_order_id, replacement_delivery_status FROM return_requests WHERE id = ?")
      .get(id)) as Row | undefined;

    if (!req) return { ok: false, message: "Request not found." };
    if (!str(req.replacement_order_id)) {
      return { ok: false, message: "No replacement has been dispatched for this request." };
    }
    if (str(req.replacement_delivery_status) === delivery.status) {
      return { ok: false, message: "The delivery is already recorded as that." };
    }

    const nowIso = new Date().toISOString();
    const delivered = delivery.status === "delivered";

    (await db.prepare(
      `UPDATE return_requests
       SET replacement_delivery_status = ?,
           replacement_delivered_at = CASE WHEN ? THEN ? ELSE replacement_delivered_at END,
           updated_at = ?
       WHERE id = ?`
    ).run(delivery.status, delivered ? 1 : 0, nowIso, nowIso, id));

    (await db.prepare(
      `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
       VALUES (?, 'replacement_pending', 'staff', ?, ?, ?)`
    ).run(
      id,
      staffUser.id,
      staffUser.name,
      `Replacement delivery: ${REPLACEMENT_DELIVERY_LABEL[delivery.status]}.${
        delivery.notes ? ` ${delivery.notes.trim()}` : ""
      }`
    ));

    return { ok: true, message: "The delivery has been recorded." };
  }));
}

/**
 * Admin appends an internal note to a return request.
 */
export async function addInternalNote(
  id: string,
  staffUser: { id: number; name: string },
  note: string
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const text = note.trim();
  if (!text) return { ok: false, message: "Enter a note." };

  (await db.prepare(
    `INSERT INTO return_events (return_id, status, actor_type, actor_id, actor_name, note)
     VALUES (?, (SELECT status FROM return_requests WHERE id = ?), 'staff', ?, ?, ?)`
  ).run(id, id, staffUser.id, staffUser.name, `Staff Note: ${text}`));

  return { ok: true, message: "Note added to event log." };
}
