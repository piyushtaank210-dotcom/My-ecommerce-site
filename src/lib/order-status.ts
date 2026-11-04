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
