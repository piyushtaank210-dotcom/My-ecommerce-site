/**
 * Where an order sits in its journey.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling `node:sqlite` into a browser
 * bundle is not something the bundler can do.
 */
export const ORDER_STATUSES = [
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The steps shown on the order confirmation timeline. */
export const ORDER_TIMELINE: {
  status: OrderStatus;
  label: string;
  note: string;
}[] = [
  { status: "confirmed", label: "Order placed", note: "We have your order" },
  { status: "packed", label: "Packed", note: "Within 24 hours" },
  { status: "shipped", label: "Shipped", note: "Tracking by email" },
  { status: "delivered", label: "Delivered", note: "2–4 working days" },
];

/** True when a status is one the store knows about. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * How each status is coloured.
 *
 * The colours are the ones the shop already uses — the site's own blue
 * for an order that is on its way, green for one that has arrived, red
 * for one that has been called off — so that a status reads the same
 * way everywhere it is shown.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  packed: "border-indigo-200 bg-indigo-50 text-indigo-700",
  shipped: "border-violet-200 bg-violet-50 text-violet-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

/**
 * The step after the one the order is at.
 *
 * It is what the back office is offered next: an order that has been
 * confirmed can be packed, a packed one shipped, and a shipped one
 * delivered.
 */
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "packed",
  packed: "shipped",
  shipped: "delivered",
};

/**
 * The label the badge shows.
 *
 * An order that was written for the gateway but has not been paid for
 * yet is *pending*, even though the order itself is already confirmed —
 * it is waiting for the money, and saying so is more useful than saying
 * it is confirmed.
 */
export function orderStatusLabel(
  status: string,
  options: { awaitingPayment?: boolean } = {}
): string {
  if (options.awaitingPayment && status !== "cancelled") return "Pending";
  return ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
}
