import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Package,
  RotateCcw,
  Truck,
  XCircle,
  Undo2,
  ExternalLink,
  User,
  CalendarClock,
} from "lucide-react";
import { getReturnRequestsForOrder, RETURN_STATUS_LABEL, RETURN_STATUS_TONE } from "@/lib/returns";
import { getOrder } from "@/lib/orders";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/payment-method";
import { STOCK_STATE_LABEL } from "@/lib/stock";
import { getUserById } from "@/lib/auth";
import { getCancellationForOrder } from "@/lib/cancellations";
import { getOrderRefund, courierTrackingUrl } from "@/lib/order-dispatch";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/OrderStatusBadge";
import { OrderActionBar } from "@/components/admin/OrderActionBar";
import { OrderStatusSteps } from "@/components/admin/OrderStatusSteps";
import { OrderCancellationPanel } from "@/components/admin/OrderCancellationPanel";

export const metadata = { title: "Order" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("orders.view");
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const customer = order.user_id ? await getUserById(order.user_id) : null;
  const returns = await getReturnRequestsForOrder(order.id);
  const cancellation = await getCancellationForOrder(order.id);
  const refund = await getOrderRefund(order.id);

  const canUpdate = can(user.role, "orders.update");
  const cancelled = order.status === "cancelled";
  const hasShipping = Boolean(order.courier_partner && order.tracking_id);

  const trackingUrl = courierTrackingUrl(order.courier_partner);
  const shippingMethod =
    order.shipping_method === "other"
      ? order.custom_shipping_method
      : order.shipping_method
        ? order.shipping_method.charAt(0).toUpperCase() + order.shipping_method.slice(1)
        : null;

  return (
    <div className="mx-auto max-w-[1280px]">
      {/* ---------------------------------------------------------- header */}
      <header className="mb-6">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Orders
        </Link>

        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="tnum text-[26px] font-bold leading-tight text-ink">
              Order {order.id}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Placed {formatDate(order.created_at)}
              </span>
              <span className="text-gray-300" aria-hidden="true">
                /
              </span>
              <Link
                href={`/admin/users?q=${encodeURIComponent(customer?.email ?? order.email)}`}
                className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
              >
                <User className="h-3.5 w-3.5" />
                {customer?.name || order.name}
              </Link>
            </p>
          </div>

          {/* The order's own status, and the payment's — two separate
              things, shown separately. */}
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ the order */}
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 px-5 py-4 text-[15px] font-bold text-ink">
              Items ({order.items.length})
            </h2>
            <ul className="divide-y divide-gray-200">
              {order.items.map((item, i) => (
                <li
                  key={`${item.product_slug}-${i}`}
                  className="flex items-start gap-4 px-5 py-4"
                >
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/product/${item.product_slug}`}
                      className="block line-clamp-2 text-[13.5px] font-semibold text-ink transition-colors hover:text-brand"
                    >
                      {item.name}
                    </Link>
                    {item.variant_name && (
                      <span className="mt-0.5 block text-[12px] text-gray-500">
                        {item.variant_name}
                      </span>
                    )}
                    <span className="tnum mt-0.5 block text-[12px] text-gray-500">
                      {item.quantity} × {money(item.price)}
                    </span>
                    {item.backordered > 0 && (
                      <span className="mt-1.5 block text-[11.5px] font-medium text-amber-700">
                        {item.backordered} on backorder — the shelf does not have
                        them yet
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          item.stock_state === "awaiting_check"
                            ? "bg-amber-50 text-amber-700"
                            : item.stock_state === "written_off"
                              ? "bg-red-50 text-red-700"
                              : item.stock_state === "deducted"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STOCK_STATE_LABEL[item.stock_state] ?? item.stock_state}
                      </span>
                      {item.stock_state_note && (
                        <span className="text-[11.5px] text-gray-500">
                          {item.stock_state_note}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[14px] font-bold text-ink">
                    {money(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="space-y-2 border-t border-gray-200 bg-gray-50/60 px-5 py-4 text-[13.5px]">
              <div className="flex justify-between">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="tnum font-semibold text-ink">
                  {money(order.subtotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Delivery</dt>
                <dd className="tnum font-semibold text-ink">
                  {order.shipping === 0 ? (
                    <span className="text-green-600">{money(0)}</span>
                  ) : (
                    money(order.shipping)
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-gray-200 pt-2.5">
                <dt className="text-[15px] font-bold text-ink">Total</dt>
                <dd className="tnum text-[20px] font-bold text-ink">
                  {money(order.total)}
                </dd>
              </div>
            </dl>
          </section>

          {/* --------------------------------------------------- the actions */}
          {canUpdate ? (
            <OrderActionBar
              orderId={order.id}
              status={order.status}
              customerName={order.name}
              total={order.total}
              paymentReference={order.payment_reference}
              paymentGateway={order.payment_gateway}
              hasShipping={hasShipping}
              canUpdate={canUpdate}
              refundStatus={order.refund_status}
            />
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-[13px] text-gray-500">
                Your role does not allow the order to be changed.
              </p>
            </section>
          )}

          {canUpdate && <OrderStatusSteps orderId={order.id} status={order.status} />}
        </div>

        {/* ---------------------------------------------------- the sidebar */}
        <div className="space-y-5">
          {/* The dispatch. */}
          {hasShipping && (
            <section className="rounded-xl border border-gray-200 bg-white">
              <h2 className="flex items-center gap-2 border-b border-gray-200 px-5 py-3.5 text-[14px] font-bold text-ink">
                <Truck className="h-4 w-4 text-brand" />
                Shipping information
              </h2>
              <dl className="divide-y divide-gray-100">
                <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Courier partner</dt>
                  <dd className="text-right text-[13px] font-semibold text-ink">
                    {order.courier_partner}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Shipping method</dt>
                  <dd className="text-right text-[13px] font-semibold text-ink">
                    {shippingMethod || "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Tracking / AWB</dt>
                  <dd className="tnum min-w-0 break-all text-right text-[13px] font-semibold text-ink">
                    {order.tracking_id}
                  </dd>
                </div>
                {order.shipping_confirmed_at && (
                  <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                    <dt className="text-[12.5px] text-gray-500">Confirmed on</dt>
                    <dd className="text-right text-[13px] font-semibold text-ink">
                      {formatDate(order.shipping_confirmed_at)}
                    </dd>
                  </div>
                )}
              </dl>
              {trackingUrl && (
                <div className="border-t border-gray-200 px-5 py-3.5">
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    Track with {order.courier_partner}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </section>
          )}

          {/* The cancellation. */}
          {cancelled && (
            <section className="rounded-xl border border-red-200 bg-red-50/40">
              <h2 className="flex items-center gap-2 border-b border-red-200 px-5 py-3.5 text-[14px] font-bold text-ink">
                <XCircle className="h-4 w-4 text-red-600" />
                Cancellation
              </h2>
              <dl className="divide-y divide-red-100">
                <div className="px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Reason</dt>
                  <dd className="mt-1 text-[13px] font-medium text-ink">
                    {order.cancellation_reason || "Not recorded."}
                  </dd>
                </div>
                {order.cancelled_at && (
                  <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                    <dt className="text-[12.5px] text-gray-500">Cancelled on</dt>
                    <dd className="text-right text-[13px] font-semibold text-ink">
                      {formatDate(order.cancelled_at)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* The refund. */}
          {(refund || order.refund_status !== "none") && (
            <section className="rounded-xl border border-gray-200 bg-white">
              <h2 className="flex items-center gap-2 border-b border-gray-200 px-5 py-3.5 text-[14px] font-bold text-ink">
                <Undo2 className="h-4 w-4 text-brand" />
                Refund
              </h2>
              <dl className="divide-y divide-gray-100">
                <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Amount</dt>
                  <dd className="tnum text-right text-[13px] font-semibold text-ink">
                    {order.refund_amount !== null
                      ? money(order.refund_amount)
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <dt className="text-[12.5px] text-gray-500">Status</dt>
                  <dd className="text-right">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                        order.refund_status === "processed"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : order.refund_status === "pending"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : order.refund_status === "failed"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-gray-200 bg-gray-50 text-gray-600"
                      }`}
                    >
                      {order.refund_status === "processed"
                        ? "Paid back"
                        : order.refund_status === "pending"
                          ? "With the payment provider"
                          : order.refund_status === "failed"
                            ? "Failed"
                            : "Not started"}
                    </span>
                  </dd>
                </div>
                {order.refund_id && (
                  <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                    <dt className="text-[12.5px] text-gray-500">Razorpay refund ID</dt>
                    <dd className="tnum min-w-0 break-all text-right text-[12.5px] font-semibold text-ink">
                      {order.refund_id}
                    </dd>
                  </div>
                )}
                {order.refunded_at && (
                  <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                    <dt className="text-[12.5px] text-gray-500">Paid back on</dt>
                    <dd className="text-right text-[13px] font-semibold text-ink">
                      {formatDate(order.refunded_at)}
                    </dd>
                  </div>
                )}
                {order.refund_error && (
                  <div className="px-5 py-3">
                    <dt className="text-[12.5px] text-gray-500">Last error</dt>
                    <dd className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                      {order.refund_error}
                    </dd>
                  </div>
                )}
              </dl>
              {order.refund_status === "pending" && (
                <p className="border-t border-gray-200 px-5 py-3 text-[12px] text-gray-500">
                  The payment provider has accepted the refund. It has not
                  reached the customer yet — it takes 5–7 working days.
                </p>
              )}
            </section>
          )}

          {/* A cancellation the customer asked for. */}
          {cancellation && (
            <OrderCancellationPanel
              cancellation={cancellation}
              orderTotal={order.total}
              canDecide={canUpdate}
            />
          )}

          {/* The address. */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
              <MapPin className="h-4 w-4 text-brand" />
              Delivery address
            </h2>
            <address className="text-[13px] not-italic leading-relaxed text-gray-500">
              <span className="block font-semibold text-ink">{order.name}</span>
              {order.address1}
              {order.address2 && (
                <>
                  <br />
                  {order.address2}
                </>
              )}
              <br />
              {order.city}, {order.state} — {order.pincode}
              <br />
              <span className="tnum">{order.phone}</span>
            </address>
          </section>

          {/* The payment. */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
              <CreditCard className="h-4 w-4 text-brand" />
              Payment
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-gray-600">
                {paymentMethodLabel(order.payment_method)}
              </p>
              <PaymentStatusBadge status={order.payment_status} size="sm" />
            </div>
            {order.payment_gateway && (
              <p className="mt-1.5 text-[12.5px] text-gray-500">
                {order.payment_reference ? (
                  <>
                    Paid through {order.payment_gateway} ·{" "}
                    <span className="tnum break-all">{order.payment_reference}</span>
                  </>
                ) : order.status === "cancelled" ? (
                  <>Cancelled before the payment was made — nothing was taken.</>
                ) : (
                  <>Waiting for the payment to be confirmed — nothing has been taken yet.</>
                )}
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-gray-500">
              {order.email} · {order.phone}
            </p>
            <p className="mt-2 text-[12px] text-gray-400">
              The payment and the order are two different things. A paid
              order is still pending until somebody has checked it.
            </p>
            {order.notes && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[12.5px] text-gray-600">
                <span className="block font-semibold text-ink">Order note</span>
                {order.notes}
              </p>
            )}
          </section>

          {/* Returns and replacements. */}
          {returns.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
                <RotateCcw className="h-4 w-4 text-brand" />
                Returns &amp; Replacements ({returns.length})
              </h2>
              <div className="space-y-3">
                {returns.map((ret) => (
                  <div
                    key={ret.id}
                    className="rounded-lg border border-gray-200 p-3 text-[13px]"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/admin/returns/${ret.id}`}
                        className="tnum font-bold text-brand hover:underline"
                      >
                        {ret.id}
                      </Link>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {RETURN_STATUS_LABEL[ret.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-gray-500">
                      {ret.type === "replacement" ? "Replacement" : "Return & Refund"} ·{" "}
                      {ret.items.length} item{ret.items.length === 1 ? "" : "s"}
                    </p>
                    <Link
                      href={`/admin/returns/${ret.id}`}
                      className="mt-2 block text-[12px] font-medium text-brand hover:underline"
                    >
                      Manage return →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Link
            href={`/order/${order.id}`}
            className="btn btn-outline w-full"
          >
            <Package className="h-4 w-4" />
            See it as the customer does
          </Link>
        </div>
      </div>
    </div>
  );
}
