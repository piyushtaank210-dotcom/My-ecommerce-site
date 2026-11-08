"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { requirePermission } from "./guard";
import { can } from "./roles";
import { getOrder } from "./orders";
import {
  approveCancellation,
  cancellationEligibility,
  confirmCancellationRefund,
  createCancellationRequest,
  rejectCancellation,
} from "./cancellations";

export type CancellationActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

/**
 * Customer Server Action: ask for an order to be cancelled.
 *
 * The request is recorded either way. Whether the order can actually be
 * cancelled depends on where it is, and that is the back office's call.
 */
export async function requestCancellationAction(
  _prev: CancellationActionState,
  formData: FormData
): Promise<CancellationActionState> {
  const user = await getCurrentUser();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orderId) return { ok: false, message: "Order ID is missing." };

  const order = (await getOrder(orderId));
  if (!order) return { ok: false, message: "Order not found." };

  if (user && order.user_id && order.user_id !== user.id) {
    return { ok: false, message: "You are not authorized to cancel this order." };
  }

  if (!reason) {
    return {
      ok: false,
      errors: { reason: "Tell us why you want to cancel." },
      message: "Tell us why you want to cancel.",
    };
  }

  const eligibility = cancellationEligibility(order);
  const result = (await createCancellationRequest({
    orderId,
    userId: user?.id ?? order.user_id,
    reason,
    dispatchState: eligibility.dispatchState,
  }));

  if (result.ok) {
    revalidatePath(`/order/${orderId}`);
    revalidatePath("/account/orders");
    revalidatePath("/admin/orders");
  }

  return { ok: result.ok, message: result.message };
}

/**
 * Back office Server Action: agree to the cancellation.
 */
export async function approveCancellationAction(
  _prev: CancellationActionState,
  formData: FormData
): Promise<CancellationActionState> {
  const staff = await requirePermission("orders.update");
  if (!can(staff.role, "orders.update")) {
    return { ok: false, message: "You do not have permission to change orders." };
  }

  const id = String(formData.get("cancellationId") ?? "").trim();
  const notes = String(formData.get("adminNotes") ?? "").trim();
  const refundRaw = String(formData.get("refundAmount") ?? "").trim();

  if (!id) return { ok: false, message: "Cancellation ID missing." };

  const refundAmount = refundRaw === "" ? undefined : Number(refundRaw);
  const result = (await approveCancellation(id, staff, {
    notes,
    refundAmount: Number.isFinite(refundAmount) ? refundAmount : undefined,
  }));

  if (result.ok) {
    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
  }

  return { ok: result.ok, message: result.message };
}

/**
 * Back office Server Action: decline the cancellation, and say why.
 */
export async function rejectCancellationAction(
  _prev: CancellationActionState,
  formData: FormData
): Promise<CancellationActionState> {
  const staff = await requirePermission("orders.update");
  if (!can(staff.role, "orders.update")) {
    return { ok: false, message: "You do not have permission to change orders." };
  }

  const id = String(formData.get("cancellationId") ?? "").trim();
  const reason = String(formData.get("rejectionReason") ?? "").trim();

  if (!id) return { ok: false, message: "Cancellation ID missing." };
  if (!reason) {
    return {
      ok: false,
      message: "Give the customer a reason for the decision.",
    };
  }

  const result = (await rejectCancellation(id, staff, reason));

  if (result.ok) {
    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
  }

  return { ok: result.ok, message: result.message };
}

/**
 * Back office Server Action: the payment provider confirms the refund.
 *
 * Until this is done the refund is a promise; after it, it is a fact.
 */
export async function confirmCancellationRefundAction(
  _prev: CancellationActionState,
  formData: FormData
): Promise<CancellationActionState> {
  const staff = await requirePermission("orders.update");
  if (!can(staff.role, "orders.update")) {
    return { ok: false, message: "You do not have permission to change orders." };
  }

  const id = String(formData.get("cancellationId") ?? "").trim();
  const reference = String(formData.get("refundReference") ?? "").trim();

  if (!id) return { ok: false, message: "Cancellation ID missing." };

  const result = (await confirmCancellationRefund(id, staff, reference));

  if (result.ok) {
    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
  }

  return { ok: result.ok, message: result.message };
}
