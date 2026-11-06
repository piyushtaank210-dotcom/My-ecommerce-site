/**
 * Types, constants and labels for Returns, Replacements and Refunds.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling `node:sqlite` into a browser
 * bundle is not supported.
 */

export const RETURN_TYPES = ["return", "replacement"] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_TYPE_LABEL: Record<ReturnType, string> = {
  return: "Return for Refund",
  replacement: "Replacement",
};

export const RETURN_STATUSES = [
  "requested",
  "info_requested",
  "approved",
  "pickup_scheduled",
  "received",
  "qc_passed",
  "qc_failed",
  "refund_pending",
  "replacement_pending",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: "Requested",
  info_requested: "More Info Requested",
  approved: "Approved",
  pickup_scheduled: "Pickup Scheduled",
  received: "Item Received",
  qc_passed: "QC Passed",
  qc_failed: "QC Failed",
  refund_pending: "Refund Pending",
  replacement_pending: "Replacement Pending",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const RETURN_STATUS_TONE: Record<ReturnStatus, string> = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  info_requested: "bg-orange-50 text-orange-700 border-orange-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  pickup_scheduled: "bg-purple-50 text-purple-700 border-purple-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  qc_passed: "bg-teal-50 text-teal-700 border-teal-200",
  qc_failed: "bg-orange-50 text-orange-700 border-orange-200",
  refund_pending: "bg-indigo-50 text-indigo-700 border-indigo-200",
  replacement_pending: "bg-cyan-50 text-cyan-700 border-cyan-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
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
  { value: "product_damaged", label: "Product damaged" },
  { value: "wrong_product_received", label: "Wrong product received" },
  { value: "missing_parts", label: "Missing parts or accessories" },
  { value: "product_not_working", label: "Product not working" },
  { value: "defective_product", label: "Defective product" },
  { value: "different_from_description", label: "Different from description" },
  { value: "other", label: "Other" },
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number]["value"];

const LEGACY_REASON_MAP: Record<string, string> = {
  defective: "Defective product",
  damaged: "Product damaged",
  wrong_item: "Wrong product received",
  changed_mind: "Different from description",
};

export function returnReasonLabel(reason: string): string {
  const match = RETURN_REASONS.find((r) => r.value === reason);
  if (match) return match.label;
  if (LEGACY_REASON_MAP[reason]) return LEGACY_REASON_MAP[reason];
  return reason;
}

export const DEFAULT_RETURN_WINDOW_DAYS = 5;
export const RETURN_WINDOW_DAYS = 5;

/**
 * Returns dynamic timeline stages relevant to the request type.
 * Timeline:
 * Request Submitted → Under Review → Approved → Pickup Scheduled → Product Received → Inspection Completed → Refund Initiated / Replacement Dispatched → Completed
 */
export function getTimelineStages(type: ReturnType): {
  key: string;
  label: string;
  description: string;
}[] {
  return [
    { key: "requested", label: "Request Submitted", description: "Your request has been received" },
    { key: "under_review", label: "Under Review", description: "Our team is reviewing the claim" },
    { key: "approved", label: "Approved", description: "Return approved, arranging pickup" },
    { key: "pickup_scheduled", label: "Pickup Scheduled", description: "Courier scheduled to collect parcel" },
    { key: "received", label: "Product Received", description: "Arrived at our inspection center" },
    { key: "qc_passed", label: "Inspection Completed", description: "Quality check passed" },
    {
      key: "settlement",
      label: type === "replacement" ? "Replacement Dispatched" : "Refund Initiated",
      description:
        type === "replacement"
          ? "Brand new unit shipped to you"
          : "Refund credited to original payment source",
    },
    { key: "completed", label: "Completed", description: "Case resolved successfully" },
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
  created_at: string;
};

export type ReturnEvent = {
  id: number;
  return_id: string;
  status: string;
  actor_type: "customer" | "staff" | "system";
  actor_id: number | null;
  actor_name: string | null;
  note: string | null;
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
  created_at: string;
  updated_at: string;
  items: ReturnItem[];
  images: ReturnImage[];
  events: ReturnEvent[];
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
};
