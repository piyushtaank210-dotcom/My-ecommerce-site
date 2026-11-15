"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "./guard";
import { can } from "./roles";
import {
  cancelOrderWithReason,
  confirmOrderWithShipping,
  refreshRefundStatus,
  refundCancelledOrder,
} from "./order-dispatch";
import type { OrderActionState } from "./order-action-state";

/**
 * The paths that have to be looked at again once an order has moved.
 */
function revalidateOrder(orderId: string): void {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/account/orders");
  revalidatePath(`/order/${orderId}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

/**
 * Confirms an order with the shipping details.
 *
 * Every detail is required. The action refuses rather than confirming an
 * order with half a courier, and the order only becomes confirmed once
 * the details are on file.
 */
export async function confirmOrderAction(
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const user = await requirePermission("orders.update");
  if (!can(user.role, "orders.update")) {
    return { ok: false, message: "You cannot change orders." };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { ok: false, message: "The order is missing." };

  const result = await confirmOrderWithShipping({
    orderId,
    courierPartner: formData.get("courierPartner"),
    shippingMethod: formData.get("shippingMethod"),
    customShippingMethod: formData.get("customShippingMethod"),
    trackingId: formData.get("trackingId"),
    userId: user.id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message, field: result.field };
  }

  revalidateOrder(orderId);
  return { ok: true, message: result.message, done: "shipping" };
}

/**
 * Cancels an order, with the reason for it.
 *
 * The reason is required, and the order is not cancelled until it has
 * been given.
 */
export async function cancelOrderAction(
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const user = await requirePermission("orders.update");
  if (!can(user.role, "orders.update")) {
    return { ok: false, message: "You cannot change orders." };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { ok: false, message: "The order is missing." };

  const result = await cancelOrderWithReason({
    orderId,
    reasonCode: formData.get("reasonCode"),
    reasonDetail: formData.get("reasonDetail"),
    userId: user.id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message, field: result.field };
  }

  revalidateOrder(orderId);
  return { ok: true, message: result.message, done: "cancel" };
}

/**
 * Refunds a cancelled order, through the payment gateway.
 *
 * The money goes back by the gateway's own API, against the gateway's
 * own reference for the payment. Nothing here knows the gateway's
 * credentials — that is the gateway module's business, and all that
 * comes back is the reference and the status the gateway reported.
 */
export async function refundOrderAction(
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const user = await requirePermission("orders.update");
  if (!can(user.role, "orders.update")) {
    return { ok: false, message: "You cannot refund orders." };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { ok: false, message: "The order is missing." };

  const raw = String(formData.get("amount") ?? "").trim();
  const amount = raw === "" ? undefined : Number(raw);

  const result = await refundCancelledOrder({
    orderId,
    amount: amount === undefined || Number.isNaN(amount) ? undefined : amount,
    userId: user.id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message, field: result.field };
  }

  revalidateOrder(orderId);
  return { ok: true, message: result.message, done: "refund" };
}

/**
 * Asks the gateway where a refund has got to.
 *
 * The gateway's own status is what is shown — a refund it calls pending
 * has not reached the customer yet, and the shop does not say that it
 * has.
 */
export async function refreshRefundStatusAction(
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const user = await requirePermission("orders.update");
  if (!can(user.role, "orders.update")) {
    return { ok: false, message: "You cannot check refunds." };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { ok: false, message: "The order is missing." };

  const result = await refreshRefundStatus({ orderId, userId: user.id });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidateOrder(orderId);
  return { ok: true, message: result.message, done: "refund-status" };
}
