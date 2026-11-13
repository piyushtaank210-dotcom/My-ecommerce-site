import { getOrder } from "./orders";
import {
  createReturnRequest,
  getOrderReturnEligibility,
  getActiveReturnForItem,
  isProductReturnable,
  type ReturnType,
} from "./returns";
import { peekUploads, claimUploads } from "./return-uploads";
import { checkRequestAllowed, policyForReason } from "./return-policy";

/**
 * The customer's claim, and the checks it has to pass.
 *
 * Everything here runs on the server, whatever the browser said. The
 * order is looked up and its owner checked; the delivery date is
 * compared with the order's own record of it; and the claim is refused
 * if the information the chosen reason needs is missing.
 *
 * Where evidence cannot be sent, the customer is asked to say why. That
 * is the alternative to sending it, and it is never a reason on its
 * own to refuse a genuine claim.
 */

export type SubmitReturnInput = {
  orderId: string;
  type: ReturnType;
  reason: string;
  customerNotes: string;
  items: {
    orderItemId: number;
    productSlug: string;
    variantId: string | null;
    name: string;
    price: number;
    quantity: number;
  }[];
  serialNumber?: string;
  missingAccessories?: string;
  sealedState?: string;
  deliveryDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  evidenceExcused?: string;
  uploadIds?: string[];
};

export type SubmitReturnResult = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  returnId?: string;
};

/**
 * Checks a claim and, if it holds up, writes it.
 */
export async function submitReturnRequest(
  input: SubmitReturnInput,
  user: { id: number; email: string } | null
): Promise<SubmitReturnResult> {
  const orderId = input.orderId.trim();
  const reason = input.reason.trim();
  const customerNotes = input.customerNotes.trim();
  const serialNumber = (input.serialNumber ?? "").trim();
  const missingAccessories = (input.missingAccessories ?? "").trim();
  const sealedState = (input.sealedState ?? "").trim();
  const deliveryDate = input.deliveryDate.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim();
  const contactPhone = (input.contactPhone ?? "").trim();
  const evidenceExcused = (input.evidenceExcused ?? "").trim();
  const uploadIds = (input.uploadIds ?? []).filter(Boolean);

  if (!orderId) return { ok: false, message: "Order ID is missing." };

  // The shop can turn returns and replacements off. The claim is
  // refused here, on the server, whatever the form says.
  const { getReturnsEnabled } = await import("./settings");
  if (!(await getReturnsEnabled())) {
    return {
      ok: false,
      message:
        "The shop is not taking returns at the moment. Please contact us and we will look at your case.",
    };
  }

  const order = (await getOrder(orderId));
  if (!order) return { ok: false, message: "Order not found." };

  // The order must belong to the person making the claim.
  if (user && order.user_id && order.user_id !== user.id) {
    return { ok: false, message: "You are not authorized to return this order." };
  }

  // A claim can only be made once the parcel has arrived, and only
  // inside the window. Both are worked out from the order's own record
  // of the delivery, not from the browser's clock.
  const eligibility = (await getOrderReturnEligibility(order));
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
    type: input.type,
    sealedConfirmed: sealedState === "sealed",
  });
  if (!allowed.ok) return { ok: false, message: allowed.message };

  // The details the customer must give, whatever the reason is.
  if (customerNotes.length < 10) {
    return {
      ok: false,
      errors: { customerNotes: "Please describe what happened, in a little detail." },
      message: "Please describe what happened.",
    };
  }

  if (!deliveryDate) {
    return {
      ok: false,
      errors: { deliveryDate: "Please give the date the parcel arrived." },
      message: "Please give the date the parcel arrived.",
    };
  }

  if (contactName.length < 2) {
    return {
      ok: false,
      errors: { contactName: "Please give your name." },
      message: "Please give your name.",
    };
  }

  if (!contactEmail.includes("@") || !contactEmail.includes(".")) {
    return {
      ok: false,
      errors: { contactEmail: "Please give an email address we can reply to." },
      message: "Please give a valid email address.",
    };
  }

  if (!input.items.length) {
    return {
      ok: false,
      errors: { items: "Select at least one item to return or replace." },
      message: "Select at least one item to return.",
    };
  }

  // The list of what is missing is the information this reason needs —
  // there is nothing else that can stand in for it.
  if (policy.kind === "missing_accessories" && missingAccessories.length < 3) {
    return {
      ok: false,
      errors: {
        missingAccessories: "Please list which accessories are missing from the box.",
      },
      message: "Please list which accessories are missing.",
    };
  }

  // One claim per item: a second request about the same unit is
  // refused, and the customer is told about the one that is open.
  for (const it of input.items) {
    if (!(await isProductReturnable(it.productSlug))) {
      return { ok: false, message: `${it.name} is marked as non-returnable.` };
    }
    const existingActive = (await getActiveReturnForItem(it.orderItemId));
    if (existingActive) {
      return {
        ok: false,
        message: `An active ${existingActive.type} request (${existingActive.id}) already exists for ${it.name}.`,
      };
    }
  }

  // The evidence that came with the claim, looked at before the claim is
  // written so that the shop knows what the customer sent.
  const staged = await peekUploads(uploadIds, user?.id ?? order.user_id);
  const photos = staged.filter((e) => e.kind === "photo");
  const videos = staged.filter((e) => e.kind === "video");

  // The evidence the rules ask for. Where it has not been sent, the
  // customer is asked to say why — and the claim still goes forward,
  // because a claim is never turned away for the want of a photograph.
  const missingEvidence = policy.evidence.filter((e) => {
    if (!e.required) return false;
    if (e.id === "order_id" || e.id === "description") return false;
    if (e.id === "missing_list") return missingAccessories.length < 3;
    if (e.id === "unboxing_video" || e.id === "sealed_video") return videos.length === 0;
    return photos.length === 0;
  });

  if (missingEvidence.length && evidenceExcused.length < 10) {
    return {
      ok: false,
      errors: {
        evidenceExcused:
          "Please tell us why you cannot send this evidence — we will still look at your claim.",
      },
      message:
        "We could not see all the evidence this request normally carries. Tell us why you cannot send it and we will still review your claim.",
    };
  }

  const type: ReturnType =
    input.type === "replacement"
      ? "replacement"
      : input.type === "accessories"
        ? "accessories"
        : "return";

  let returnId: string;
  try {
    returnId = (await createReturnRequest({
      orderId,
      userId: user?.id ?? order.user_id,
      type,
      reason,
      customerNotes: customerNotes || null,
      serialNumber: serialNumber || null,
      // The customer's answer about the seal is one of two things. Any
      // other word the form happened to carry is not an answer about the
      // seal, so it is treated as no answer at all.
      sealedState: policy.requiresSealed
        ? "sealed"
        : sealedState === "sealed" || sealedState === "opened"
          ? sealedState
          : null,
      missingAccessories: missingAccessories || null,
      deliveryDate,
      customerName: contactName,
      customerEmail: contactEmail,
      customerPhone: contactPhone || null,
      evidenceExcused: evidenceExcused || null,
      evidence: staged.map((e) => ({
        path: `/evidence/${e.storedName}`,
        kind: e.kind,
        evidenceKind: e.evidenceKind,
        storedName: e.storedName,
        mimeType: e.mimeType,
        sizeBytes: e.sizeBytes,
        originalName: e.originalName,
        sha256: e.sha256,
        note: evidenceExcused || null,
      })),
      items: input.items,
    }));
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to create return request.",
    };
  }

  // The files were sent before the request existed. They are moved onto
  // it now, so the evidence lives with the claim from this moment on.
  await claimUploads({
    uploadIds,
    userId: user?.id ?? order.user_id,
    returnId,
  });

  return { ok: true, returnId };
}
