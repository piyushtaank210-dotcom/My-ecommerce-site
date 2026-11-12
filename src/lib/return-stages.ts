import type { ReturnType } from "./return-status";

/**
 * The stages a customer's request travels through.
 *
 * This is a module of its own, with no runtime import of anything, so
 * that it can be read from anywhere without a circular reference
 * getting in the way. The type import above is erased when the code is
 * compiled, so it costs nothing at runtime.
 */

/**
 * The stages for one kind of request.
 *
 * The customer sees these as a timeline with a date against each stage.
 * The keys are the statuses the request actually takes, so a stage can
 * always be dated from the request's own history.
 */
export const CUSTOMER_STAGES = {
  return: [
    { key: "requested", label: "Request Submitted" },
    { key: "under_review", label: "Under Review" },
    { key: "info_requested", label: "Evidence Required" },
    { key: "approved", label: "Approved" },
    { key: "pickup_scheduled", label: "Return Pickup Scheduled" },
    { key: "received", label: "Product Received" },
    { key: "qc_passed", label: "Inspection Completed" },
    { key: "refund_approved", label: "Refund Approved" },
    { key: "refund_completed", label: "Refund Completed" },
    { key: "resolved", label: "Request Resolved" },
  ],
  replacement: [
    { key: "requested", label: "Request Submitted" },
    { key: "under_review", label: "Under Review" },
    { key: "info_requested", label: "Evidence Required" },
    { key: "approved", label: "Approved" },
    { key: "pickup_scheduled", label: "Return Pickup Scheduled" },
    { key: "received", label: "Product Received" },
    { key: "qc_passed", label: "Inspection Completed" },
    { key: "replacement_dispatched", label: "Replacement Dispatched" },
    { key: "resolved", label: "Request Resolved" },
  ],
  accessories: [
    { key: "requested", label: "Request Submitted" },
    { key: "under_review", label: "Under Review" },
    { key: "approved", label: "Approved" },
    { key: "replacement_dispatched", label: "Accessories Dispatched" },
    { key: "resolved", label: "Request Resolved" },
  ],
} as const;

/**
 * The stages for one kind of request.
 */
export function customerStagesFor(
  type: ReturnType
): readonly { key: string; label: string }[] {
  return CUSTOMER_STAGES[type] ?? CUSTOMER_STAGES.return;
}

/**
 * Where a request sits on the customer's timeline, given its status.
 *
 * It is a stage index, or -1 for a status the timeline does not show. A
 * rejected or cancelled request has its own ending and is not drawn on
 * the journey at all.
 */
export function customerStageIndex(status: string): number {
  const order: Record<string, number> = {
    requested: 0,
    under_review: 1,
    info_requested: 2,
    evidence_received: 2,
    approved: 3,
    pickup_scheduled: 4,
    received: 5,
    inspection_in_progress: 6,
    qc_passed: 7,
    qc_failed: 7,
    replacement_approved: 8,
    replacement_pending: 8,
    replacement_dispatched: 8,
    refund_approved: 9,
    refund_pending: 9,
    refund_processing: 9,
    refund_completed: 10,
    completed: 11,
    resolved: 11,
  };
  return order[status] ?? -1;
}
