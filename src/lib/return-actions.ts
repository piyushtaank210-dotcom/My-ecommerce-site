"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { getOrder } from "./orders";
import { saveUpload, saveVideoUpload } from "./uploads";
import {
  createReturnRequest,
  cancelReturnRequest,
  getOrderReturnEligibility,
  getActiveReturnForItem,
  isProductReturnable,
  type ReturnType,
} from "./returns";
import {
  checkRequestAllowed,
  policyForReason,
} from "./return-policy";

export type ReturnActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  returnId?: string;
};

/** How many photographs a claim may carry. */
const MAX_PHOTOS = 6;

/** How many videos a claim may carry. */
const MAX_VIDEOS = 2;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

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
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const missingAccessories = String(formData.get("missingAccessories") ?? "").trim();
  const sealedState = String(formData.get("sealedState") ?? "").trim();

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

  // The rules for this reason decide what may be asked for. A request
  // for a remedy the rules do not allow is refused here, on the server,
  // and not only in the form.
  const policy = policyForReason(reason);

  const allowed = checkRequestAllowed({
    reason,
    type,
    sealedConfirmed: sealedState === "sealed",
  });
  if (!allowed.ok) {
    return { ok: false, message: allowed.message };
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

  // The evidence: photographs and, where the customer has one, an
  // unboxing video. Both are saved and kept apart.
  const files = formData.getAll("evidence") as File[];
  const validFiles = files.filter(
    (f) => f && f.size > 0 && typeof f.arrayBuffer === "function"
  );

  const photos = validFiles.filter((f) => PHOTO_TYPES.includes(f.type));
  const videos = validFiles.filter((f) => VIDEO_TYPES.includes(f.type));

  if (photos.length > MAX_PHOTOS) {
    return {
      ok: false,
      message: `You can upload a maximum of ${MAX_PHOTOS} evidence photographs.`,
    };
  }
  if (videos.length > MAX_VIDEOS) {
    return {
      ok: false,
      message: `You can upload a maximum of ${MAX_VIDEOS} videos.`,
    };
  }

  const unsupported = validFiles.filter(
    (f) => !PHOTO_TYPES.includes(f.type) && !VIDEO_TYPES.includes(f.type)
  );
  if (unsupported.length) {
    return {
      ok: false,
      message:
        "One of the files is not a photograph or a video we can play. Use JPG, PNG or WebP for a photograph, and MP4, WebM or MOV for a video.",
    };
  }

  const evidence: { path: string; kind: "photo" | "video" }[] = [];

  for (const file of photos) {
    if (file.size > MAX_PHOTO_BYTES) {
      return {
        ok: false,
        message: `File "${file.name}" exceeds the 5MB size limit. Please upload a smaller photograph.`,
      };
    }
    const saved = await saveUpload("returns", file);
    if (saved.ok) evidence.push({ path: saved.path, kind: "photo" });
  }

  for (const file of videos) {
    if (file.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        message: `File "${file.name}" exceeds the 60MB size limit. Please upload a shorter video.`,
      };
    }
    const saved = await saveVideoUpload("returns", file);
    if (saved.ok) evidence.push({ path: saved.path, kind: "video" });
  }

  let returnId: string;
  try {
    returnId = createReturnRequest({
      orderId,
      userId: user?.id ?? order.user_id,
      type: (type === "replacement" ? "replacement" : type === "accessories" ? "accessories" : "return") as ReturnType,
      reason,
      customerNotes: customerNotes || null,
      serialNumber: serialNumber || null,
      sealedState: policy.requiresSealed ? "sealed" : sealedState ? sealedState : null,
      missingAccessories: missingAccessories || null,
      evidence,
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

