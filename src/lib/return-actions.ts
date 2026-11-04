"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { getOrder } from "./orders";
import { saveUpload } from "./uploads";
import {
  createReturnRequest,
  cancelReturnRequest,
  getOrderReturnEligibility,
  getActiveReturnForItem,
  isProductReturnable,
  type ReturnType,
} from "./returns";

export type ReturnActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  returnId?: string;
};

/**
 * Customer Server Action: Submit a Return or Replacement Request
 */
export async function createReturnRequestAction(
  _prev: ReturnActionState,
  formData: FormData
): Promise<ReturnActionState> {
  const user = await getCurrentUser();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const type = String(formData.get("type") ?? "return") as ReturnType;
  const reason = String(formData.get("reason") ?? "").trim();
  const customerNotes = String(formData.get("customerNotes") ?? "").trim();
  const rawItems = String(formData.get("items") ?? "").trim();

  if (!orderId) {
    return { ok: false, message: "Order ID is missing." };
  }

  const order = getOrder(orderId);
  if (!order) {
    return { ok: false, message: "Order not found." };
  }

  // Authorization check: User must own the order if logged in
  if (user && order.user_id && order.user_id !== user.id) {
    return { ok: false, message: "You are not authorized to return this order." };
  }

  // Strict server-side eligibility and deadline validation (does not rely on browser clock)
  const eligibility = getOrderReturnEligibility(order);
  if (!eligibility.isDelivered) {
    return {
      ok: false,
      message: "Returns can only be requested once your order has been delivered.",
    };
  }

  if (eligibility.isWindowClosed) {
    return {
      ok: false,
      message: `Return window closed. The deadline for this order passed on ${eligibility.formattedDeadline}.`,
    };
  }

  if (!reason) {
    return {
      ok: false,
      errors: { reason: "Please choose a reason for the return or replacement." },
      message: "Please choose a reason.",
    };
  }

  let parsedItems: {
    orderItemId: number;
    productSlug: string;
    variantId: string | null;
    name: string;
    price: number;
    quantity: number;
    reasonDetail?: string;
  }[] = [];

  try {
    parsedItems = JSON.parse(rawItems);
  } catch {
    return { ok: false, message: "No items were selected for return." };
  }

  if (!parsedItems.length) {
    return {
      ok: false,
      errors: { items: "Select at least one item to return or replace." },
      message: "Select at least one item to return.",
    };
  }

  // Validate each selected item for conflicting requests and returnability
  for (const it of parsedItems) {
    if (!isProductReturnable(it.productSlug)) {
      return {
        ok: false,
        message: `${it.name} is marked as non-returnable.`,
      };
    }
    const existingActive = getActiveReturnForItem(it.orderItemId);
    if (existingActive) {
      return {
        ok: false,
        message: `An active ${existingActive.type} request (${existingActive.id}) already exists for ${it.name}.`,
      };
    }
  }

  // Handle uploaded evidence photos with secure validation (up to 4 images, max 5MB, valid image format)
  const imageFiles = formData.getAll("photos") as File[];
  const validFiles = imageFiles.filter(
    (f) => f && f.size > 0 && typeof f.arrayBuffer === "function"
  );

  if (validFiles.length > 4) {
    return {
      ok: false,
      message: "You can upload a maximum of 4 evidence photographs.",
    };
  }

  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  const maxBytes = 5 * 1024 * 1024; // 5MB

  const imagePaths: string[] = [];
  for (const file of validFiles) {
    if (!allowedMimes.includes(file.type)) {
      return {
        ok: false,
        message: `Invalid file type (${file.type || "unknown"}). Only JPG, PNG, and WebP images are allowed.`,
      };
    }
    if (file.size > maxBytes) {
      return {
        ok: false,
        message: `File "${file.name}" exceeds the 5MB size limit. Please upload a smaller image.`,
      };
    }

    const uploadRes = await saveUpload("returns", file);
    if (uploadRes.ok) {
      imagePaths.push(uploadRes.path);
    }
  }

  let returnId: string;
  try {
    returnId = createReturnRequest({
      orderId,
      userId: user?.id ?? order.user_id,
      type: type === "replacement" ? "replacement" : "return",
      reason,
      customerNotes: customerNotes || null,
      imagePaths,
      items: parsedItems,
    });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to create return request.",
    };
  }

  revalidatePath(`/order/${orderId}`);
  revalidatePath("/account/orders");
  revalidatePath("/account/returns");
  revalidatePath("/admin/returns");

  redirect(`/account/returns/${returnId}`);
}

/**
 * Customer Server Action: Cancel Return Request before pickup
 */
export async function cancelReturnRequestAction(
  _prev: ReturnActionState,
  formData: FormData
): Promise<ReturnActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to cancel a return request." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const note = String(formData.get("note") ?? "Cancelled by customer").trim();

  if (!returnId) {
    return { ok: false, message: "Return ID missing." };
  }

  const result = cancelReturnRequest(returnId, user.id, note);

  if (result.ok) {
    revalidatePath(`/account/returns/${returnId}`);
    revalidatePath("/account/returns");
    revalidatePath("/admin/returns");
  }

  return { ok: result.ok, message: result.message };
}

