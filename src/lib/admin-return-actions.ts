"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "./guard";
import { can } from "./roles";
import {
  approveReturnRequest,
  rejectReturnRequest,
  startReview,
  startInspection,
  schedulePickup,
  recordQcInspection,
  initiateRefund,
  confirmRefundPaid,
  rejectRefund,
  markCompleted,
  dispatchMissingAccessories,
  markProductReceived,
  requestMoreInformation,
  dispatchReplacement,
  setReplacementDelivery,
  addInternalNote,
} from "./returns";
import {
  recordAdminAction,
  recordInspection,
  notifyCustomerAbout,
  updateRefundRecord,
  calculateRefund,
  getRefund,
} from "./returns-records";
import {
  refundThroughGateway,
  gatewayStatusIsComplete,
} from "./refund-gateway";
import { InventoryError } from "./inventory";
import {
  REPLACEMENT_DELIVERY_STATUSES,
  type ReplacementDeliveryStatus,
} from "./return-status";
import type { NotificationKind } from "./notifications";

export type AdminReturnState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

const revalidateAll = (returnId: string) => {
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/returns/${returnId}`);
  revalidatePath(`/account/returns/${returnId}`);
  revalidatePath("/account/returns");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/replacements");
};

/**
 * Writes down what a member of the back office did, and tells the
 * customer.
 *
 * Every decision is written twice: once in the request's own history,
 * where it belongs, and once in the audit log, which answers "who did
 * what, and when". The customer is told when the change is one they
 * would want to know about.
 */
async function note(input: {
  returnId: string;
  action: string;
  staff: { id: number; name: string; role: string };
  note?: string | null;
  customer?: { kind: NotificationKind; title: string; body: string } | null;
}): Promise<void> {
  await recordAdminAction({
    returnId: input.returnId,
    action: input.action,
    actor: {
      type: "staff",
      id: input.staff.id,
      name: input.staff.name,
      role: input.staff.role,
    },
    note: input.note ?? null,
  });

  if (input.customer) {
    await notifyCustomerAbout(input.returnId, input.customer);
  }
}

/**
 * Approve Return Request
 */
export async function approveReturnAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };

  const result = (await approveReturnRequest(
    returnId,
    { id: staff.id, name: staff.name },
    adminNotes || undefined
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "approve",
      staff,
      note: adminNotes || null,
    });
  }
  return result;
}

/**
 * Pick the request up and begin to look at it.
 */
export async function startReviewAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  if (!returnId) return { ok: false, message: "Return ID missing." };

  const result = (await startReview(returnId, { id: staff.id, name: staff.name }));

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Reject Return Request
 *
 * A rejection always carries a reason, and the customer is told what it
 * is.
 */
export async function rejectReturnAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!rejectionReason) {
    return { ok: false, message: "Please provide a rejection reason for the customer." };
  }

  const result = (await rejectReturnRequest(
    returnId,
    { id: staff.id, name: staff.name },
    rejectionReason
  ));

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Schedule Pickup
 */
export async function schedulePickupAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const courier = String(formData.get("courier") ?? "").trim();
  const tracking = String(formData.get("tracking") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || !courier || !tracking || !date) {
    return { ok: false, message: "Please fill in all courier, tracking, and pickup date details." };
  }

  const result = (await schedulePickup(returnId, { id: staff.id, name: staff.name }, {
    courier,
    tracking,
    date,
    notes: notes || undefined,
  }));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "schedule_pickup",
      staff,
      note: notes || null,
      customer: {
        kind: "pickup_scheduled",
        title: `Pickup arranged for request ${returnId}`,
        body: `We have arranged for ${courier} to collect your parcel. The tracking number is ${tracking}, and the pickup is scheduled for ${date}.`,
      },
    });
  }
  return result;
}

/**
 * Put the unit into inspection.
 */
export async function startInspectionAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  if (!returnId) return { ok: false, message: "Return ID missing." };

  const result = (await startInspection(returnId, { id: staff.id, name: staff.name }));

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Record QC Inspection
 *
 * The inspection is kept as a record of its own: when it happened, who
 * did it and what they found.
 */
export async function recordQcAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const qcStatus = String(formData.get("qcStatus") ?? "passed") as "passed" | "failed";
  const notes = String(formData.get("notes") ?? "").trim();
  const serialSeen = String(formData.get("serialSeen") ?? "").trim();
  const rawDecisions = String(formData.get("decisions") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!notes) return { ok: false, message: "Provide inspection findings and condition notes." };

  let itemDecisions: {
    itemId: number;
    decision: "restock" | "write_off" | "reject";
  }[] = [];

  try {
    itemDecisions = JSON.parse(rawDecisions);
  } catch {
    return { ok: false, message: "Invalid item decision format." };
  }

  const result = (await recordQcInspection(returnId, { id: staff.id, name: staff.name }, {
    qcStatus,
    notes,
    itemDecisions,
  }));

  if (result.ok) {
    await recordInspection({
      returnId,
      result: qcStatus,
      serialSeen: serialSeen || null,
      conditionNotes: notes,
      notes: null,
      actor: { id: staff.id, name: staff.name, role: staff.role },
    });

    revalidateAll(returnId);
    await note({
      returnId,
      action: "inspect",
      staff,
      note: notes,
      customer: {
        kind: "inspection_completed",
        title: `Inspection finished for request ${returnId}`,
        body:
          qcStatus === "passed"
            ? `We have finished checking the unit you sent back and it has passed our inspection. The next step is on its way.`
            : `We have finished checking the unit you sent back. We will write to you about what happens next.`,
      },
    });
  }
  return result;
}

/**
 * Approve a refund.
 *
 * The refund is raised here as a record of its own. It is not recorded
 * as paid until somebody confirms the payment separately.
 */
export async function initiateRefundAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  // The form asks for rupees, which is what the shop keeps its money in
  // and what an administrator reads and types.
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const method = String(formData.get("method") ?? "Original Payment Source").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Please enter the amount to refund." };
  }

  // The amount is worked out from what the customer paid, and the
  // administrator may not refund more than that.
  const calculation = await calculateRefund(returnId);
  if (calculation.amount && amount > calculation.amount) {
    return {
      ok: false,
      message: `The refund cannot be more than ₹${calculation.amount} — what the customer paid for the items being returned.`,
    };
  }

  const result = (await initiateRefund(returnId, { id: staff.id, name: staff.name }, {
    amount,
    method,
    notes: notes || undefined,
  }));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "approve_refund",
      staff,
      note: notes || `Refund of ₹${amount} approved by ${method}.`,
    });
  }
  return result;
}

/**
 * Send the refund to the payment gateway.
 *
 * The gateway's own refund API is called, and what it says is what is
 * recorded. The refund is only completed when the gateway says it has
 * been processed — never because the shop believes it has.
 */
export async function sendRefundToGatewayAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const refundId = String(formData.get("refundId") ?? "").trim();
  if (!refundId) return { ok: false, message: "Refund ID missing." };

  const refund = await getRefund(refundId);
  if (!refund) return { ok: false, message: "Refund not found." };

  if (refund.status === "completed") {
    return { ok: false, message: "This refund has already been paid." };
  }

  const result = await refundThroughGateway({
    paymentId: refund.gateway_payment_id ?? "",
    amount: refund.amount,
    receipt: refund.id,
    notes: {
      return_request: refund.return_id,
      order: refund.order_id,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason ??
        "The gateway did not accept the refund. It can be paid by hand instead.",
    };
  }

  // What the gateway said is what is written down.
  const complete = gatewayStatusIsComplete(result.status);

  const updated = await updateRefundRecord({
    refundId,
    status: complete ? "completed" : "processing",
    gatewayTransactionId: result.refundId ?? null,
    gatewayRefundId: result.refundId ?? null,
    settledBy: "gateway",
    notes: complete
      ? `The gateway processed the refund (${result.refundId}).`
      : `The gateway accepted the refund (${result.refundId}) and is processing it.`,
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });

  if (!updated.ok) return updated;

  await recordAdminAction({
    returnId: refund.return_id,
    action: complete ? "complete_refund" : "process_refund",
    actor: { type: "staff", id: staff.id, name: staff.name, role: staff.role },
    note: `The gateway answered with ${result.refundId} (${result.status}).`,
    metadata: { refundId, gatewayRefundId: result.refundId, status: result.status },
  });

  revalidateAll(refund.return_id);
  revalidatePath("/admin/refunds");

  return {
    ok: true,
    message: complete
      ? `The gateway processed the refund (${result.refundId}).`
      : `The gateway accepted the refund (${result.refundId}) and is processing it.`,
  };
}

/**
 * Record a refund the shop paid by hand.
 *
 * The administrator writes down the reference of the payment they
 * actually made, and that is what is recorded. A refund is never
 * completed without it.
 */
export async function recordManualRefundAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const refundId = String(formData.get("refundId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!refundId) return { ok: false, message: "Refund ID missing." };
  if (!reference) {
    return {
      ok: false,
      message:
        "Enter the reference of the payment you made (the UTR, or the bank's reference).",
    };
  }

  const refund = await getRefund(refundId);
  if (!refund) return { ok: false, message: "Refund not found." };

  const result = await updateRefundRecord({
    refundId,
    status: "completed",
    gatewayTransactionId: reference,
    settledBy: "manual",
    notes: notes || `Paid by hand under reference ${reference}.`,
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });

  if (!result.ok) return result;

  await recordAdminAction({
    returnId: refund.return_id,
    action: "complete_refund",
    actor: { type: "staff", id: staff.id, name: staff.name, role: staff.role },
    note: `Paid by hand under reference ${reference}.`,
    metadata: { refundId, reference, settledBy: "manual" },
  });

  revalidateAll(refund.return_id);
  revalidatePath("/admin/refunds");

  return { ok: true, message: "The refund is recorded as paid." };
}

/**
 * Put the refund in front of the payment provider.
 */
export async function startRefundProcessingAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const gatewayTransactionId = String(formData.get("gatewayTransactionId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };

  const { getDb } = await import("./db");
  const row = (await getDb()
    .prepare(
      `SELECT id FROM return_refunds
        WHERE return_id = ? AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1`
    )
    .get(returnId)) as { id?: string } | undefined;

  if (!row?.id) {
    return { ok: false, message: "There is no approved refund waiting on this request." };
  }

  const result = await updateRefundRecord({
    refundId: row.id,
    status: "processing",
    gatewayTransactionId: gatewayTransactionId || null,
    notes: notes || null,
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Confirm the refund has actually been paid.
 *
 * This is the only thing that makes a refund a refund.
 */
export async function confirmRefundPaidAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!reference) {
    return {
      ok: false,
      message: "Enter the reference the refund was paid under (UTR, gateway reference).",
    };
  }

  const result = (await confirmRefundPaid(
    returnId,
    { id: staff.id, name: staff.name },
    { reference, notes: notes || undefined }
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "complete_refund",
      staff,
      note: notes || `Refund confirmed as paid under reference ${reference}.`,
    });
  }
  return result;
}

/**
 * Refuse the refund, with the reason on the record.
 */
export async function rejectRefundAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!reason) {
    return { ok: false, message: "Please give a reason for refusing the refund." };
  }

  const result = (await rejectRefund(
    returnId,
    { id: staff.id, name: staff.name },
    reason
  ));

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Mark the request as resolved.
 */
export async function markCompletedAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };

  const result = (await markCompleted(
    returnId,
    { id: staff.id, name: staff.name },
    notes || undefined
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "resolve",
      staff,
      note: notes || null,
      customer: {
        kind: "resolved",
        title: `Request ${returnId} is resolved`,
        body: `Your request ${returnId} is now closed. Thank you for your patience.`,
      },
    });
  }
  return result;
}

/**
 * Ask the customer for more information.
 */
export async function requestMoreInfoAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!message) {
    return { ok: false, message: "Say what you need from the customer." };
  }

  const result = (await requestMoreInformation(
    returnId,
    { id: staff.id, name: staff.name },
    message
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "request_evidence",
      staff,
      note: message,
      customer: {
        kind: "evidence_required",
        title: `We need a little more for request ${returnId}`,
        body: `${message}\n\nYou can add the missing evidence on your request page.`,
      },
    });
  }
  return result;
}

/**
 * Mark the returned product as received.
 */
export async function markReceivedAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };

  const result = (await markProductReceived(
    returnId,
    { id: staff.id, name: staff.name },
    notes || undefined
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "mark_received",
      staff,
      note: notes || null,
      customer: {
        kind: "received",
        title: `We have your parcel for request ${returnId}`,
        body: `The unit you sent back has arrived with us. We are checking it now and will write to you with the outcome.`,
      },
    });
  }
  return result;
}

/**
 * Create the replacement shipment.
 *
 * What goes out is chosen item by item, and the shelf is checked again
 * here — the panel shows the stock as it was, and the stock can move
 * between looking and clicking.
 */
export async function dispatchReplacementAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const courier = String(formData.get("courier") ?? "").trim();
  const tracking = String(formData.get("tracking") ?? "").trim();
  const dispatchDate = String(formData.get("dispatchDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const rawChoices = String(formData.get("choices") ?? "").trim();

  if (!returnId || !courier || !tracking) {
    return { ok: false, message: "Enter courier and tracking number for the replacement." };
  }

  let choices: {
    itemId: number;
    productSlug: string;
    variantId: string | null;
    quantity: number;
  }[] = [];

  try {
    choices = JSON.parse(rawChoices || "[]");
  } catch {
    return { ok: false, message: "The replacement could not be read. Try again." };
  }

  try {
    const result = (await dispatchReplacement(
      returnId,
      { id: staff.id, name: staff.name },
      {
        courier,
        tracking,
        dispatchDate: dispatchDate || null,
        notes: notes || undefined,
      },
      choices
    ));

    if (result.ok) revalidateAll(returnId);
    return result;
  } catch (err) {
    // The shelf did not have what was asked for. That is not a crash — it
    // is the answer.
    if (err instanceof InventoryError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
}

/**
 * Send the missing accessories to the customer.
 *
 * The unit stays with them, nothing is collected and nothing is
 * refunded. The parts go out with a courier and a tracking number.
 */
export async function dispatchMissingAccessoriesAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const courier = String(formData.get("courier") ?? "").trim();
  const tracking = String(formData.get("tracking") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || !courier || !tracking) {
    return {
      ok: false,
      message: "Enter the courier and the tracking number for the accessories.",
    };
  }

  const result = (await dispatchMissingAccessories(
    returnId,
    { id: staff.id, name: staff.name },
    { courier, tracking, notes: notes || undefined }
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "dispatch_accessories",
      staff,
      note: notes || null,
    });
  }
  return result;
}

/**
 * Record where the replacement has got to.
 */
export async function setReplacementDeliveryAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const status = String(formData.get("deliveryStatus") ?? "").trim() as ReplacementDeliveryStatus;
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId) return { ok: false, message: "Return ID missing." };
  if (!REPLACEMENT_DELIVERY_STATUSES.includes(status)) {
    return { ok: false, message: "That is not a delivery status." };
  }

  const result = (await setReplacementDelivery(
    returnId,
    { id: staff.id, name: staff.name },
    { status, notes: notes || undefined }
  ));

  if (result.ok) {
    revalidateAll(returnId);
    await note({
      returnId,
      action: "replacement_delivery",
      staff,
      note: notes || `The replacement is now ${status.replace(/_/g, " ")}.`,
    });
  }
  return result;
}

/**
 * Add Staff Note
 *
 * A note is for the back office. It is never shown to the customer.
 */
export async function addStaffNoteAction(
  _prev: AdminReturnState,
  formData: FormData
): Promise<AdminReturnState> {
  const staff = await requirePermission("returns.manage");
  if (!can(staff.role, "returns.manage")) {
    return { ok: false, message: "You do not have permission to manage returns." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const noteText = String(formData.get("note") ?? "").trim();

  if (!returnId || !noteText) {
    return { ok: false, message: "Note cannot be empty." };
  }

  const result = (await addInternalNote(returnId, { id: staff.id, name: staff.name }, noteText));

  if (result.ok) {
    revalidateAll(returnId);
    await recordAdminAction({
      returnId,
      action: "add_note",
      actor: { type: "staff", id: staff.id, name: staff.name, role: staff.role },
      note: noteText,
    });
  }
  return result;
}
