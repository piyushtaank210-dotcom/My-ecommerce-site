import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/order-status";

/**
 * An order's status, as a badge.
 *
 * The colours are the shop's own: the site's blue for an order that is
 * on its way, green for one that has arrived, red for one that has been
 * called off. The same badge is used by the back office and by the
 * customer, so that an order reads the same way wherever it is seen.
 */
export function OrderStatusBadge({
  status,
  awaitingPayment = false,
  size = "md",
}: {
  status: string;
  /** The order has been written but not paid for yet. */
  awaitingPayment?: boolean;
  size?: "sm" | "md";
}) {
  const known = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    status as OrderStatus
  );
  const tone = known
    ? ORDER_STATUS_TONE[status as OrderStatus]
    : "border-gray-200 bg-gray-50 text-gray-600";
  const label = orderStatusLabel(status, { awaitingPayment });

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${
        tone
      } ${
        size === "sm"
          ? "px-2.5 py-0.5 text-[11.5px]"
          : "px-3 py-1 text-[12px]"
      }`}
    >
      {awaitingPayment && status !== "cancelled" && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
