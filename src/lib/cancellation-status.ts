/**
 * Types, constants and labels for cancellation requests.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling `node:sqlite` into a browser
 * bundle is not something the bundler can do.
 */

/**
 * A request to cancel an order.
 *
 * Cancellation is not a return. An order that has not left the warehouse
 * is cancelled and the stock goes straight back on the shelf; one that has
 * been delivered is dealt with under the return rules instead. Where the
 * order is in between, the request is recorded and the back office
 * decides, because the goods are already on their way.
 */
export const CANCELLATION_STATUSES = ["requested", "approved", "rejected"] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];

export const CANCELLATION_STATUS_LABEL: Record<CancellationStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Declined",
};

/** Where the order was when the customer asked. */
export type CancellationDispatchState =
  | "before_dispatch"
  | "after_dispatch"
  | "after_delivery";

export const CANCELLATION_DISPATCH_LABEL: Record<CancellationDispatchState, string> = {
  before_dispatch: "Before dispatch",
  after_dispatch: "After dispatch",
  after_delivery: "After delivery",
};

export type OrderCancellation = {
  id: string;
  order_id: string;
  user_id: number | null;
  dispatch_state: CancellationDispatchState;
  reason: string;
  status: CancellationStatus;
  admin_notes: string | null;
  rejection_reason: string | null;
  refund_amount: number;
  refund_status: "none" | "pending" | "processed" | "failed";
  refund_reference: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_email?: string;
};
