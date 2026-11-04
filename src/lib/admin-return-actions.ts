"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "./guard";
import { can } from "./roles";
import {
  approveReturnRequest,
  rejectReturnRequest,
  schedulePickup,
  recordQcInspection,
  processRefund,
  dispatchReplacement,
  addInternalNote,
} from "./returns";

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

  const result = approveReturnRequest(
    returnId,
    { id: staff.id, name: staff.name },
    adminNotes || undefined
  );

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

  const result = rejectReturnRequest(
    returnId,
    { id: staff.id, name: staff.name },
    rejectionReason
  );

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

  const result = schedulePickup(returnId, { id: staff.id, name: staff.name }, {
    courier,
    tracking,
    date,
    notes: notes || undefined,
  });

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

  const result = recordQcInspection(returnId, { id: staff.id, name: staff.name }, {
    qcStatus,
    notes,
    itemDecisions,
  });

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Process Refund
 */
export async function processRefundAction(
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
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || amount <= 0 || !reference) {
    return { ok: false, message: "Please specify valid refund amount and bank/gateway reference UTR." };
  }

  const result = processRefund(returnId, { id: staff.id, name: staff.name }, {
    amount,
    method,
    reference,
    notes: notes || undefined,
  });

  if (result.ok) revalidateAll(returnId);
  return result;
}

/**
 * Dispatch Replacement
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
  const notes = String(formData.get("notes") ?? "").trim();

  if (!returnId || !courier || !tracking) {
    return { ok: false, message: "Enter courier and tracking number for the replacement." };
  }

  const result = dispatchReplacement(returnId, { id: staff.id, name: staff.name }, {
    courier,
    tracking,
    notes: notes || undefined,
  });

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

  const result = addInternalNote(returnId, { id: staff.id, name: staff.name }, note);

  if (result.ok) revalidateAll(returnId);
  return result;
}

