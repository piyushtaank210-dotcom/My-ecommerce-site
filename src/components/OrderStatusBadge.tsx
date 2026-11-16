import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/order-status";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  type PaymentStatus,
} from "@/lib/order-status";
import {
  ORDER_STATUS_TONE as ADMIN_ORDER_TONE,
  PAYMENT_STATUS_TONE as ADMIN_PAYMENT_TONE,
} from "@/lib/status-tone";

/**
 * An order's status, as a badge.
 *
 * The colours are the shop's own: amber for an order waiting on the
 * back office, the site's blue for one that is on its way, green for
 * one that has arrived, red for one that has been called off. The same
 * badge is used by the back office and by the customer, so that an
 * order reads the same way wherever it is seen.
 *
 * The back office asks for `variant="admin"`, which keeps the words and
 * the meaning but draws the badge in the back office's own smaller
 * palette — so that a colour there means one thing only.
 */
export function OrderStatusBadge({
  status,
  size = "md",
  variant = "default",
}: {
  status: string;
  size?: "sm" | "md";
  variant?: "default" | "admin";
}) {
  const known = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    status as OrderStatus
  );
  const label = orderStatusLabel(status);

  if (variant === "admin") {
    return (
      <span
        data-status-badge={status}
        className={`admin-badge admin-badge--${ADMIN_ORDER_TONE[status] ?? "neutral"}`}
      >
        {status === "pending" && (
          <span className="admin-badge-dot" aria-hidden="true" />
        )}
        {label}
      </span>
    );
  }

  const tone = known
    ? ORDER_STATUS_TONE[status as OrderStatus]
    : "border-gray-200 bg-gray-50 text-gray-600";

  return (
    <span
      data-status-badge={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${
        tone
      } ${
        size === "sm"
          ? "px-2.5 py-0.5 text-[11.5px]"
          : "px-3 py-1 text-[12px]"
      }`}
    >
      {status === "pending" && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

/**
 * Where the money of an order is, as a badge.
 *
 * It is a separate badge from the order's status, and it says something
 * different: an order can be paid for and still be waiting to be
 * confirmed, and an order can be confirmed and still be unpaid.
 */
export function PaymentStatusBadge({
  status,
  size = "md",
  variant = "default",
}: {
  status: string;
  size?: "sm" | "md";
  variant?: "default" | "admin";
}) {
  const known = (Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).includes(
    status as PaymentStatus
  );
  const label = known
    ? PAYMENT_STATUS_LABEL[status as PaymentStatus]
    : status;

  if (variant === "admin") {
    return (
      <span
        data-payment-badge={status}
        className={`admin-badge admin-badge--${ADMIN_PAYMENT_TONE[status] ?? "neutral"}`}
      >
        {label}
      </span>
    );
  }

  const tone = known
    ? PAYMENT_STATUS_TONE[status as PaymentStatus]
    : "border-gray-200 bg-gray-50 text-gray-600";

  return (
    <span
      data-payment-badge={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${
        tone
      } ${
        size === "sm"
          ? "px-2.5 py-0.5 text-[11.5px]"
          : "px-3 py-1 text-[12px]"
      }`}
    >
      {label}
    </span>
  );
}
