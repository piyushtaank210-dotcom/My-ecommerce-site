/**
 * Types, constants and labels for Returns, Replacements and Refunds.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling `node:sqlite` into a browser
 * bundle is not supported.
 */

import { RETURN_WINDOW_DAYS } from "./return-policy";

export const RETURN_TYPES = ["return", "replacement", "accessories"] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_TYPE_LABEL: Record<ReturnType, string> = {
  return: "Return for Refund",
  replacement: "Replacement",
  accessories: "Missing Accessories",
};

/**
 * The states a request can be in.
 *
 * The list is the shop's own, and the customer sees these same words. A
 * request never jumps: it moves from one state to the next, and every
 * move is written to the request's history with the date it happened and
 * who made it.
 *
 * A few of the older names are kept because requests that were made
 * before the shop grew them still carry them. They say the same thing
 * as the newer name beside them, and the customer's label is the same
 * for both, so nobody is shown a word that means nothing.
 */
export const RETURN_STATUSES = [
  // The claim, from the customer.
  "requested",
  "under_review",
  "info_requested",
  "evidence_received",
  // The decision.
  "approved",
  "rejected",
  "cancelled",
  // The unit coming back.
  "pickup_scheduled",
  "received",
  "inspection_in_progress",
  "qc_passed",
  "qc_failed",
  // The replacement going out.
  "replacement_approved",
  "replacement_pending",
  "replacement_dispatched",
  // The money coming back.
  "refund_approved",
  "refund_pending",
  "refund_processing",
  "refund_completed",
  // The end of it.
  "completed",
  "resolved",
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/**
 * What the customer is told.
 *
 * These are the words the customer reads on their dashboard. The back
 * office reads the same words, so the customer and the shop are never
 * talking about two different things.
 */
export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "Request Submitted",
  under_review: "Under Review",
  info_requested: "Evidence Required",
  evidence_received: "Evidence Received",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  pickup_scheduled: "Return Pickup Scheduled",
  received: "Product Received by ConsoleSeller",
  inspection_in_progress: "Product Inspection in Progress",
  qc_passed: "Inspection Completed",
  qc_failed: "Inspection Failed",
  replacement_approved: "Replacement Approved",
  replacement_pending: "Replacement Approved",
  replacement_dispatched: "Replacement Dispatched",
  refund_approved: "Refund Approved",
  refund_pending: "Refund Processing",
  refund_processing: "Refund Processing",
  refund_completed: "Refund Completed",
  completed: "Request Resolved",
  resolved: "Request Resolved",
};

export const RETURN_STATUS_TONE: Record<ReturnStatus, string> = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  info_requested: "bg-orange-50 text-orange-700 border-orange-200",
  evidence_received: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  pickup_scheduled: "bg-purple-50 text-purple-700 border-purple-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  inspection_in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  qc_passed: "bg-teal-50 text-teal-700 border-teal-200",
  qc_failed: "bg-orange-50 text-orange-700 border-orange-200",
  replacement_approved: "bg-cyan-50 text-cyan-700 border-cyan-200",
  replacement_pending: "bg-cyan-50 text-cyan-700 border-cyan-200",
  replacement_dispatched: "bg-cyan-50 text-cyan-700 border-cyan-200",
  refund_approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  refund_pending: "bg-indigo-50 text-indigo-700 border-indigo-200",
  refund_processing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  refund_completed: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
};

/**
 * The statuses that mean the case is still open.
 *
 * A case is closed when it is resolved, refused or cancelled. Anything
 * else is still being worked on.
 */
export const OPEN_RETURN_STATUSES: ReturnStatus[] = [
  "requested",
  "under_review",
  "info_requested",
  "evidence_received",
  "approved",
  "pickup_scheduled",
  "received",
  "inspection_in_progress",
  "qc_passed",
  "qc_failed",
  "replacement_approved",
  "replacement_pending",
  "replacement_dispatched",
  "refund_approved",
  "refund_pending",
  "refund_processing",
];

/** True when the case has not been closed. */
export function isOpenStatus(status: string): boolean {
  return (OPEN_RETURN_STATUSES as string[]).includes(status);
}

/**
 * The lifecycle of a refund.
 *
 * A refund is approved, then it is processed, and only then is it
 * complete. Nothing shows a customer a completed refund before the
 * money has actually moved.
 */
export const REFUND_STATUSES = [
  "approved",
  "processing",
  "completed",
  "failed",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  approved: "Refund Approved",
  processing: "Refund Processing",
  completed: "Refund Completed",
  failed: "Refund Failed",
};

export const REFUND_STATUS_TONE: Record<RefundStatus, string> = {
  approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  processing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

/**
 * The lifecycle of a replacement, from the point it is decided on to the
 * point it arrives.
 */
export const REPLACEMENT_STATUSES = [
  "approved",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type ReplacementStatus = (typeof REPLACEMENT_STATUSES)[number];

export const REPLACEMENT_STATUS_LABEL: Record<ReplacementStatus, string> = {
  approved: "Replacement Approved",
  dispatched: "Dispatched",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned to us",
  cancelled: "Cancelled",
};

/**
 * What a piece of evidence is evidence of.
 *
 * The customer says which it is when they send it, so the back office
 * can sort the photographs without asking.
 */
export const EVIDENCE_KINDS = [
  "product",
  "package",
  "serial",
  "unboxing",
  "other",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  product: "The product",
  package: "The packaging",
  serial: "The serial number",
  unboxing: "Unboxing video",
  other: "Other evidence",
};


/**
 * The views a request can be looked at through are the back office's own
 * business — they live with the page that lists them, because each one
 * sets the filters that make it what it is.
 */


/**
 * Where a replacement shipment has got to.
 *
 * A replacement is a delivery, not a decision, so it has its own
 * vocabulary — separate from the request's status, which says what the
 * back office is doing about the claim.
 */
export const REPLACEMENT_DELIVERY_STATUSES = [
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
] as const;

export type ReplacementDeliveryStatus =
  (typeof REPLACEMENT_DELIVERY_STATUSES)[number];

export const REPLACEMENT_DELIVERY_LABEL: Record<
  ReplacementDeliveryStatus,
  string
> = {
  dispatched: "Dispatched",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned to us",
};

export const REPLACEMENT_DELIVERY_TONE: Record<
  ReplacementDeliveryStatus,
  string
> = {
  dispatched: "bg-blue-50 text-blue-700 border-blue-200",
  in_transit: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  returned: "bg-red-50 text-red-700 border-red-200",
};

export const RETURN_REASONS = [
  { value: "product_damaged", label: "Product arrived damaged" },
  { value: "wrong_product_received", label: "Wrong product received" },
  { value: "missing_parts", label: "Missing accessories" },
  { value: "product_not_working", label: "Product does not work" },
  { value: "defective_product", label: "Product is defective" },
  { value: "different_from_description", label: "Different from the description" },
  { value: "change_of_mind", label: "Changed my mind — sealed and unused" },
  { value: "other", label: "Something else" },
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number]["value"];

const LEGACY_REASON_MAP: Record<string, string> = {
  defective: "Product is defective",
  damaged: "Product arrived damaged",
  wrong_item: "Wrong product received",
  // A change of mind used to be filed as "different from description",
  // which is a different claim entirely and had the wrong rules on it.
  changed_mind: "Changed my mind — sealed and unused",
};

export function returnReasonLabel(reason: string): string {
  const match = RETURN_REASONS.find((r) => r.value === reason);
  if (match) return match.label;
  if (LEGACY_REASON_MAP[reason]) return LEGACY_REASON_MAP[reason];
  return reason;
}

export { RETURN_WINDOW_DAYS };
export const DEFAULT_RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;

/**
 * The stages a request travels through, in order.
 *
 * The customer sees this as a timeline with a date against each stage.
 * A missing-accessories case never travels: the unit stays with the
 * customer and the missing parts are sent to them.
 */
export function getTimelineStages(type: ReturnType): {
  key: string;
  label: string;
  description: string;
}[] {
  if (type === "accessories") {
    return [
      { key: "requested", label: "Request Submitted", description: "Your request has been received" },
      { key: "under_review", label: "Under Review", description: "We are checking what is missing" },
      { key: "approved", label: "Approved", description: "We are sending the missing parts" },
      { key: "replacement_dispatched", label: "Accessories Dispatched", description: "The missing parts are on their way to you" },
      { key: "resolved", label: "Request Resolved", description: "Case resolved successfully" },
    ];
  }

  return [
    { key: "requested", label: "Request Submitted", description: "Your request has been received" },
    { key: "under_review", label: "Under Review", description: "Our team is reviewing the claim" },
    { key: "info_requested", label: "Evidence Required", description: "We have asked you for more" },
    { key: "approved", label: "Approved", description: "The claim is accepted, arranging pickup" },
    { key: "pickup_scheduled", label: "Return Pickup Scheduled", description: "Courier pickup arranged" },
    { key: "received", label: "Product Received", description: "Arrived at our inspection centre" },
    { key: "inspection_in_progress", label: "Inspection in Progress", description: "We are checking the unit" },
    { key: "qc_passed", label: "Inspection Completed", description: "The unit has been checked" },
    {
      key: "replacement_dispatched",
      label: type === "replacement" ? "Replacement Dispatched" : "Refund Processing",
      description:
        type === "replacement"
          ? "A brand new unit is on its way to you"
          : "The refund is being sent back to your payment method",
    },
    { key: "resolved", label: "Request Resolved", description: "Case closed" },
  ];
}

/**
 * One thing that could be sent in place of a unit that came back.
 *
 * The value is the product and the option it is stocked by, written as
 * `slug` or `slug::option`, so the choice can travel through a form and
 * be taken apart again on the other side.
 */
export type ReplacementOption = {
  value: string;
  label: string;
  productSlug: string;
  variantId: string | null;
  /** How many are on the shelf. */
  stock: number;
  /** Whether this is the unit that came back. */
  current: boolean;
};

/** The choices for one returned item. */
export type ReplacementCandidate = {
  itemId: number;
  itemName: string;
  quantity: number;
  options: ReplacementOption[];
};

export type ReturnItem = {
  id: number;
  return_id: string;
  order_item_id: number | null;
  product_slug: string;
  variant_id: string | null;
  name: string;
  price: number;
  quantity: number;
  reason_detail: string | null;
  qc_decision: "pending" | "restock" | "write_off" | "reject";
  /** What is going out in place of this unit, when it is not the same one. */
  replacement_product_slug: string | null;
  replacement_variant_id: string | null;
  replacement_quantity: number | null;
};

export type ReturnImage = {
  id: number;
  return_id: string;
  path: string;
  caption: string | null;
  /** Whether this file is a photograph or a video. */
  kind: "photo" | "video";
  /** What the file is evidence of. */
  evidence_kind: EvidenceKind;
  /** The name of the file in the shop's private evidence store. */
  stored_name: string | null;
  /** What the file really is, as far as the shop could tell. */
  mime_type: string | null;
  size_bytes: number | null;
  /** The name the file arrived with. */
  original_name: string | null;
  /** Which round of evidence this is. The first is 1. */
  version: number;
  /** Whether a later round of evidence has replaced this one. */
  superseded: number;
  /** Who sent it. */
  uploaded_by_type: "customer" | "staff";
  uploaded_by_id: number | null;
  sha256: string | null;
  /** The note the customer gave with the file. */
  note: string | null;
  created_at: string;
};

export type ReturnEvent = {
  id: number;
  return_id: string;
  status: string;
  /** The status the request came from, and the one it went to. */
  from_status: string | null;
  to_status: string | null;
  actor_type: "customer" | "staff" | "system";
  actor_id: number | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

/** A refund, on its own row. */
export type ReturnRefund = {
  id: string;
  return_id: string;
  order_id: string;
  user_id: number | null;
  amount: number;
  payment_method: string | null;
  gateway_transaction_id: string | null;
  status: RefundStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string;
  initiated_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** A replacement, on its own row. */
export type ReturnReplacement = {
  id: string;
  return_id: string;
  order_id: string;
  kind: "replacement" | "accessories";
  original_serial: string | null;
  replacement_serial: string | null;
  product_slug: string | null;
  variant_id: string | null;
  quantity: number;
  shipment_ref: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  delivery_status: ReplacementStatus;
  delivered_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** The physical check of a unit that came back. */
export type ReturnInspection = {
  id: string;
  return_id: string;
  inspected_by: number | null;
  inspected_by_name: string | null;
  result: "passed" | "failed";
  serial_seen: string | null;
  condition_notes: string | null;
  notes: string | null;
  inspected_at: string;
  created_at: string;
};

/** One action a member of the back office took. */
export type AdminAction = {
  id: number;
  return_id: string | null;
  action: string;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  metadata: string | null;
  created_at: string;
};

/** A message the shop sent, or meant to send. */
export type Notification = {
  id: number;
  audience: "customer" | "admin";
  user_id: number | null;
  email: string | null;
  return_id: string | null;
  channel: "in_app" | "email";
  kind: string;
  title: string;
  body: string;
  status: "unread" | "read" | "sent" | "not_configured" | "failed";
  dedupe_key: string | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export type ReturnRequest = {
  id: string;
  order_id: string;
  user_id: number | null;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  customer_notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  pickup_courier: string | null;
  pickup_tracking: string | null;
  pickup_date: string | null;
  received_at: string | null;
  qc_status: "pending" | "passed" | "failed";
  qc_notes: string | null;
  refund_amount: number;
  refund_status: "none" | "pending" | "processed" | "failed";
  refund_method: string | null;
  refund_reference: string | null;
  refund_processed_at: string | null;
  replacement_order_id: string | null;
  replacement_courier: string | null;
  replacement_tracking: string | null;
  /** What is going out, when it is not the unit that came back. */
  replacement_product_slug: string | null;
  replacement_variant_id: string | null;
  /** The day the replacement left the warehouse. */
  replacement_dispatch_date: string | null;
  /** Where the replacement has got to. */
  replacement_delivery_status: ReplacementDeliveryStatus | null;
  /** When it was delivered. */
  replacement_delivered_at: string | null;
  /**
   * The serial number of the unit, as the customer reads it off the
   * product.
   */
  serial_number: string | null;
  /**
   * Whether the customer says the unit is still sealed. `null` where the
   * claim does not depend on it.
   */
  sealed_state: "sealed" | "opened" | null;
  /** What the customer says is missing from the box. */
  missing_accessories: string | null;
  /** Where the missing accessories went, when we sent them. */
  accessories_courier: string | null;
  accessories_tracking: string | null;
  accessories_dispatched_at: string | null;
  /** The day the parcel arrived, as the claim records it. */
  delivery_date: string | null;
  /** Who the claim was made by, as it was when it was made. */
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  /** Why any evidence could not be sent. */
  evidence_excused: string | null;
  /** When the case was closed out. */
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  items: ReturnItem[];
  images: ReturnImage[];
  events: ReturnEvent[];
  /** The refunds, replacements and inspections on this request. */
  refunds: ReturnRefund[];
  replacements: ReturnReplacement[];
  inspections: ReturnInspection[];
  customer_name_from_order?: string;
};
