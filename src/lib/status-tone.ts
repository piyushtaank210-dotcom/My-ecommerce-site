/**
 * The colours a status is shown in, inside the back office.
 *
 * The shop's own badges use a different colour for almost every status,
 * which is a lot of colour to read. The back office keeps a small
 * palette instead, where a colour means one thing:
 *
 *   warn  — it is waiting on somebody
 *   info  — it is moving, somebody has it
 *   good  — it is finished, and it ended well
 *   bad   — it has been refused, or there is nothing left
 *
 * The words beside the colour are still the exact status, so nothing is
 * hidden by grouping them.
 *
 * This module holds no data and imports nothing, so a client component
 * is free to use it.
 */

export type AdminTone = "neutral" | "accent" | "good" | "warn" | "bad" | "info";

/** Where an order has got to. */
export const ORDER_STATUS_TONE: Record<string, AdminTone> = {
  pending: "warn",
  confirmed: "info",
  packed: "info",
  shipped: "accent",
  delivered: "good",
  cancelled: "bad",
};

/** Where the money of an order is. */
export const PAYMENT_STATUS_TONE: Record<string, AdminTone> = {
  pending: "warn",
  paid: "good",
  failed: "bad",
  partially_refunded: "info",
  refunded: "neutral",
};

/** How a piece of stock is doing. */
export const STOCK_LEVEL_TONE: Record<string, AdminTone> = {
  out: "bad",
  low: "warn",
  in: "good",
};

/**
 * Where a return, a replacement or a refund has got to.
 *
 * The customer's own dashboard uses a colour for nearly every status;
 * here they are grouped by what they mean, so that the list reads at a
 * glance.
 */
export const RETURN_STATUS_TONE: Record<string, AdminTone> = {
  // Waiting on somebody.
  requested: "warn",
  under_review: "warn",
  info_requested: "warn",
  // Moving.
  evidence_received: "info",
  approved: "info",
  pickup_scheduled: "info",
  received: "info",
  inspection_in_progress: "info",
  replacement_approved: "info",
  replacement_pending: "info",
  replacement_dispatched: "info",
  refund_approved: "info",
  refund_pending: "info",
  refund_processing: "info",
  // Finished, and it ended well.
  qc_passed: "good",
  refund_completed: "good",
  completed: "good",
  resolved: "good",
  // Refused.
  rejected: "bad",
  qc_failed: "bad",
  // Withdrawn.
  cancelled: "neutral",
};

/** Where a product sits in the catalogue. */
export const PRODUCT_STATUS_TONE: Record<string, AdminTone> = {
  published: "good",
  draft: "warn",
  archived: "neutral",
};

/**
 * Where a parcel is.
 *
 * It is a different thing from where the order is, and it is coloured by
 * what it means: waiting on the courier, moving, finished, or refused.
 */
export const SHIPMENT_STATUS_TONE: Record<string, AdminTone> = {
  pending: "warn",
  picked_up: "info",
  in_transit: "info",
  out_for_delivery: "accent",
  delivered: "good",
  exception: "bad",
  cancelled: "neutral",
  unknown: "neutral",
};

/**
 * What kind of stock movement it was.
 *
 * A sale and an order reopened are the shop's own doing; a restock and a
 * return are good news; a replacement is on its way.
 */
export const MOVEMENT_TONE: Record<string, AdminTone> = {
  sale: "accent",
  resale: "info",
  restock: "good",
  return: "good",
  replacement: "info",
  adjustment: "neutral",
};

/**
 * Where a refund has got to.
 *
 * A refund that has been approved is a promise; only one that has been
 * paid is a fact. The two are told apart here.
 */
export const REFUND_TONE: Record<string, AdminTone> = {
  not_initiated: "neutral",
  pending: "warn",
  processing: "warn",
  completed: "good",
  failed: "bad",
};

/** Where a replacement has got to. */
export const REPLACEMENT_TONE: Record<string, AdminTone> = {
  pending: "warn",
  approved: "info",
  dispatched: "info",
  delivered: "good",
  failed: "bad",
};
