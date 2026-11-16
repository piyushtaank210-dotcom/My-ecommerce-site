import { Badge } from "./Badge";
import {
  PRODUCT_STATUS_TONE,
  RETURN_STATUS_TONE,
} from "@/lib/status-tone";

/**
 * The words for each return status, in the back office's own vocabulary.
 * The shop's longer labels are kept for the customer; here they are
 * shortened so that they fit in a table without wrapping.
 */
const RETURN_LABEL: Record<string, string> = {
  requested: "Requested",
  under_review: "Under review",
  info_requested: "Evidence required",
  evidence_received: "Evidence received",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  pickup_scheduled: "Pickup scheduled",
  received: "Received",
  inspection_in_progress: "Inspecting",
  qc_passed: "Inspection passed",
  qc_failed: "Inspection failed",
  replacement_approved: "Replacement approved",
  replacement_pending: "Replacement approved",
  replacement_dispatched: "Replacement dispatched",
  refund_approved: "Refund approved",
  refund_pending: "Refund processing",
  refund_processing: "Refund processing",
  refund_completed: "Refund paid",
  completed: "Resolved",
  resolved: "Resolved",
};

/**
 * A return, a replacement or a refund, as a badge.
 *
 * The words are the exact status. The colour says where it has got to:
 * waiting, moving, finished or refused.
 */
export function ReturnStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={RETURN_STATUS_TONE[status] ?? "neutral"}>
      {RETURN_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Where a product sits in the catalogue.
 */
export function ProductStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <Badge tone={PRODUCT_STATUS_TONE[status] ?? "neutral"}>{label}</Badge>
  );
}
