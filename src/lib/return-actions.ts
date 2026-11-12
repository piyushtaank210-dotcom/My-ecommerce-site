"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import {
  cancelReturnRequest,
  getReturnRequest,
  type ReturnType,
} from "./returns";
import { addReturnEvidence, evidenceMayBeAdded } from "./returns-records";
import { claimUploads } from "./return-uploads";
import { submitReturnRequest } from "./return-submit";

export type ReturnActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  returnId?: string;
};

/**
 * Customer Server Action: Submit a Return or Replacement Request
 *
 * Everything is checked again here, on the server, whatever the browser
 * said. The order is looked up and its owner is checked; the delivery
 * date is compared with the order's own record of it; and the claim is
 * refused if the information the chosen reason needs is missing.
 *
 * Where evidence cannot be sent, the customer is asked to say why. That
 * is the alternative to sending it, and it is never a reason on its
 * own to refuse a genuine claim.
 */
export async function createReturnRequestAction(
  _prev: ReturnActionState,
  formData: FormData
): Promise<ReturnActionState> {
  const user = await getCurrentUser();

  let items: {
    orderItemId: number;
    productSlug: string;
    variantId: string | null;
    name: string;
    price: number;
    quantity: number;
  }[] = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = [];
  }

  const result = await submitReturnRequest(
    {
      orderId: String(formData.get("orderId") ?? ""),
      type: String(formData.get("type") ?? "return") as ReturnType,
      reason: String(formData.get("reason") ?? ""),
      customerNotes: String(formData.get("customerNotes") ?? ""),
      items,
      serialNumber: String(formData.get("serialNumber") ?? ""),
      missingAccessories: String(formData.get("missingAccessories") ?? ""),
      sealedState: String(formData.get("sealedState") ?? ""),
      deliveryDate: String(formData.get("deliveryDate") ?? ""),
      contactName: String(formData.get("contactName") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
      contactPhone: String(formData.get("contactPhone") ?? ""),
      evidenceExcused: String(formData.get("evidenceExcused") ?? ""),
      uploadIds: String(formData.get("uploadIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    user ? { id: user.id, email: user.email } : null
  );

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      errors: result.errors,
    };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  revalidatePath(`/order/${orderId}`);
  revalidatePath("/account/orders");
  revalidatePath("/account/returns");
  revalidatePath("/admin/returns");
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/replacements");

  redirect(`/account/returns/${result.returnId}`);
}

/**
 * Customer Server Action: add more evidence to a request.
 *
 * It is only allowed while the case is open and the back office is
 * waiting for more. Evidence that has already been sent is kept — the
 * new files are added as another round rather than replacing them.
 */
export async function addReturnEvidenceAction(
  _prev: ReturnActionState,
  formData: FormData
): Promise<ReturnActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to add evidence." };
  }

  const returnId = String(formData.get("returnId") ?? "").trim();
  const uploadIds = String(formData.get("uploadIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const note = String(formData.get("note") ?? "").trim();

  if (!returnId) return { ok: false, message: "Request ID missing." };
  if (!uploadIds.length) return { ok: false, message: "No files were sent." };

  const ret = await getReturnRequest(returnId);
  if (!ret) return { ok: false, message: "Request not found." };

  // Only the customer the claim belongs to may add to it.
  if (ret.user_id !== null && ret.user_id !== user.id) {
    return { ok: false, message: "You are not authorized to add to this request." };
  }
  if (
    ret.user_id === null &&
    (ret.customer_email ?? "").toLowerCase() !== user.email.toLowerCase()
  ) {
    return { ok: false, message: "You are not authorized to add to this request." };
  }

  if (!evidenceMayBeAdded(ret.status)) {
    return {
      ok: false,
      message:
        "This request has already been decided on, so the evidence cannot be changed. Please contact customer support.",
    };
  }

  const files = await claimUploads({ uploadIds, userId: user.id, returnId });

  if (!files.length) {
    return { ok: false, message: "Those files could not be attached." };
  }

  const result = await addReturnEvidence({
    returnId,
    files,
    uploadedBy: { type: "customer", id: user.id },
    note: note || null,
  });

  if (!result.ok) {
    return { ok: false, message: result.message ?? "Could not add the evidence." };
  }

  revalidatePath(`/account/returns/${returnId}`);
  revalidatePath(`/admin/returns/${returnId}`);
  revalidatePath("/admin/returns");

  return {
    ok: true,
    message: `Thank you — ${files.length} file${files.length === 1 ? "" : "s"} added to your request.`,
    returnId,
  };
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

  const result = (await cancelReturnRequest(returnId, user.id, note));

  if (result.ok) {
    revalidatePath(`/account/returns/${returnId}`);
    revalidatePath("/account/returns");
    revalidatePath("/admin/returns");
  }

  return { ok: result.ok, message: result.message };
}
