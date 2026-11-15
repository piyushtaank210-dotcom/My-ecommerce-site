/**
 * Where an order sits in its journey, and where its payment sits.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling `node:sqlite` into a browser
 * bundle is not something the bundler can do.
 *
 * There are two statuses, and they are two different things.
 *
 * The **order status** is where the parcel is: it has been received and
 * is waiting to be checked, it has been confirmed, packed, shipped and
 * delivered — or it has been cancelled. It only moves when somebody in
 * the back office moves it. A new order starts at `pending` and stays
 * there until an administrator has checked it and saved the shipping
 * details.
 *
 * The **payment status** is where the money is: it has not been taken, it
 * has been taken, the attempt failed, or it has been given back. It is
 * moved by the payment gateway and by nothing else.
 *
 * The two never move together. A successful payment makes the order
 * *paid*, and does not make it *confirmed* — a customer paying for
 * something does not get to decide that the shop has checked it.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * The steps shown on the order confirmation timeline.
 *
 * The first step is "Order received", not "Order placed": the order is
 * in, but nobody has checked it yet. It only becomes confirmed when the
 * back office says so.
 */
export const ORDER_TIMELINE: {
  status: OrderStatus;
  label: string;
  note: string;
}[] = [
  { status: "pending", label: "Order received", note: "We are checking it" },
  { status: "confirmed", label: "Confirmed", note: "Once we have checked it" },
  { status: "packed", label: "Packed", note: "Within 24 hours" },
  { status: "shipped", label: "Shipped", note: "Tracking by email" },
  { status: "delivered", label: "Delivered", note: "2–4 working days" },
];

/**
 * How each status is coloured.
 *
 * The colours are the ones the shop already uses — amber for something
 * waiting on the shop, the site's own blue for an order that is on its
 * way, green for one that has arrived, red for one that has been called
 * off — so that a status reads the same way everywhere it is shown.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  packed: "border-indigo-200 bg-indigo-50 text-indigo-700",
  shipped: "border-violet-200 bg-violet-50 text-violet-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

/**
 * The steps of the journey, in order.
 *
 * It is what a transition is measured against: an order moves forward
 * along it, or it is cancelled.
 */
const THE_JOURNEY: OrderStatus[] = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
];

/**
 * Whether an order may move from one status to another.
 *
 * The rules are short:
 *
 *   · an order moves forward along the journey, or skips a step or two
 *     (an administrator who forgets to mark an order packed has not
 *     done anything wrong)
 *   · an order may be cancelled from any step before it is delivered —
 *     a delivered order is returned or replaced, not cancelled
 *   · a cancelled order may be opened again, which puts it back to the
 *     start and takes its stock off the shelf once more
 *   · nothing else is allowed: an order cannot go backwards, and a
 *     delivered order cannot be cancelled
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (to === "cancelled") return from !== "delivered";
  if (from === "cancelled") return to === "pending" || to === "confirmed";

  const fromAt = THE_JOURNEY.indexOf(from);
  const toAt = THE_JOURNEY.indexOf(to);
  if (fromAt < 0 || toAt < 0) return false;

  // Forward, and only forward.
  return toAt > fromAt;
}

/**
 * The statuses an order may move to from where it is now.
 *
 * It is what the back office is offered, so that the choice is always
 * one that the server will accept.
 */
export function nextOrderStatuses(from: OrderStatus): OrderStatus[] {
  if (from === "delivered") return [];
  if (from === "cancelled") return ["pending", "confirmed"];
  return [...THE_JOURNEY.slice(THE_JOURNEY.indexOf(from) + 1), "cancelled"];
}

/**
 * The step after the one the order is at.
 *
 * It is what the back office is offered next: an order that has been
 * confirmed can be packed, a packed one shipped, and a shipped one
 * delivered.
 */
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "packed",
  packed: "shipped",
  shipped: "delivered",
};

/** True when a status is one the store knows about. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Where the money of an order is.
 *
 * It is nothing to do with where the parcel is. An order can be paid
 * for and still be waiting to be confirmed, and an order can be
 * cancelled before a rupee of it has been paid.
 */
export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-green-200 bg-green-50 text-green-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  partially_refunded: "border-indigo-200 bg-indigo-50 text-indigo-700",
  refunded: "border-gray-200 bg-gray-50 text-gray-600",
};

/**
 * The label the badge shows.
 *
 * An order the shop does not know about shows what it is called, rather
 * than nothing at all.
 */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
}
