"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "./guard";
import { can } from "./roles";
import {
  approveReturnRequest,
  rejectReturnRequest,
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
import { InventoryError } from "./inventory";
import {
  REPLACEMENT_DELIVERY_STATUSES,
  type ReplacementDeliveryStatus,
} from "./return-status";

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
};

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

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Reject Return Request
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

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Record QC Inspection
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

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Approve a refund.
 *
 * The refund is raised here. It is not recorded as paid until somebody
 * confirms the payment separately.
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
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const method = String(formData.get("method") ?? "Original Source").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || amount <= 0) {
    return { ok: false, message: "Please enter the amount to refund." };
  }

  const result = (await initiateRefund(returnId, { id: staff.id, name: staff.name }, {
    amount,
    method,
    notes: notes || undefined,
  }));

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

  if (result.ok) revalidateAll(returnId);
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
 * Mark the request as completed.
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

  if (result.ok) revalidateAll(returnId);
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

  if (result.ok) revalidateAll(returnId);
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

  if (result.ok) revalidateAll(returnId);
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

  if (result.ok) revalidateAll(returnId);
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

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Add Staff Note
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
  const note = String(formData.get("note") ?? "").trim();

  if (!returnId || !note) {
    return { ok: false, message: "Note cannot be empty." };
  }

  const result = (await addInternalNote(returnId, { id: staff.id, name: staff.name }, note));

  if (result.ok) revalidateAll(returnId);
  return result;
}

