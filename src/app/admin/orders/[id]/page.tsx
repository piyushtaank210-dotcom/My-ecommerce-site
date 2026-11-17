import Link from "next/link";
import { notFound } from "next/navigation";
import {
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
import { getReturnRequestsForOrder } from "@/lib/returns";
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
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { ReturnStatusBadge } from "@/components/admin/ui/StatusBadge";
import { Badge } from "@/components/admin/ui/Badge";
import { REFUND_TONE } from "@/lib/status-tone";

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
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        eyebrow="Sales"
        title={`Order ${order.id}`}
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Placed {formatDate(order.created_at)}
            </span>
            <Link
              href={`/admin/users?q=${encodeURIComponent(customer?.email ?? order.email)}`}
              className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
            >
              <User className="h-3.5 w-3.5" />
              {customer?.name || order.name}
            </Link>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} variant="admin" />
            <PaymentStatusBadge status={order.payment_status} variant="admin" />
          </div>
        }
      />

      <div className="admin-split">
        {/* ------------------------------------------------------ the order */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={`Items (${order.items.length})`}
            bodyClass="admin-panel-body--flush"
          >
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
          </Panel>

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
            <Panel>
              <p className="text-[13px] text-gray-500">
                Your role does not allow the order to be changed.
              </p>
            </Panel>
          )}

          {canUpdate && <OrderStatusSteps orderId={order.id} status={order.status} />}
        </div>

        {/* ---------------------------------------------------- the sidebar */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* The dispatch. */}
          {hasShipping && (
            <Panel
              title={
                <>
                  <Truck className="h-4 w-4 text-brand" />
                  Shipping information
                </>
              }
              bodyClass="admin-panel-body--tight"
            >
              <dl className="admin-facts">
                <div className="admin-fact">
                  <dt>Courier partner</dt>
                  <dd>{order.courier_partner}</dd>
                </div>
                <div className="admin-fact">
                  <dt>Shipping method</dt>
                  <dd>{shippingMethod || "—"}</dd>
                </div>
                <div className="admin-fact">
                  <dt>Tracking / AWB</dt>
                  <dd className="tnum min-w-0 break-all">{order.tracking_id}</dd>
                </div>
                {order.shipping_confirmed_at && (
                  <div className="admin-fact">
                    <dt>Confirmed on</dt>
                    <dd>{formatDate(order.shipping_confirmed_at)}</dd>
                  </div>
                )}
              </dl>
              {trackingUrl && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-links"
                  >
                    Track with {order.courier_partner}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </Panel>
          )}

          {/* The cancellation. */}
          {cancelled && (
            <Panel
              tone="bad"
              title={
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  Cancellation
                </>
              }
              bodyClass="admin-panel-body--tight"
            >
              <dl className="admin-facts">
                <div className="admin-fact">
                  <dt>Reason</dt>
                  <dd className="text-left">{order.cancellation_reason || "Not recorded."}</dd>
                </div>
                {order.cancelled_at && (
                  <div className="admin-fact">
                    <dt>Cancelled on</dt>
                    <dd>{formatDate(order.cancelled_at)}</dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}

          {/* The refund. */}
          {(refund || order.refund_status !== "none") && (
            <Panel
              title={
                <>
                  <Undo2 className="h-4 w-4 text-brand" />
                  Refund
                </>
              }
              bodyClass="admin-panel-body--tight"
            >
              <dl className="admin-facts">
                <div className="admin-fact">
                  <dt>Amount</dt>
                  <dd className="tnum">
                    {order.refund_amount !== null ? money(order.refund_amount) : "—"}
                  </dd>
                </div>
                <div className="admin-fact">
                  <dt>Status</dt>
                  <dd>
                    <Badge tone={REFUND_TONE[order.refund_status] ?? "neutral"}>
                      {order.refund_status === "processed"
                        ? "Paid back"
                        : order.refund_status === "pending"
                          ? "With the payment provider"
                          : order.refund_status === "failed"
                            ? "Failed"
                            : "Not started"}
                    </Badge>
                  </dd>
                </div>
                {order.refund_id && (
                  <div className="admin-fact">
                    <dt>Razorpay refund ID</dt>
                    <dd className="tnum min-w-0 break-all text-[12px]">
                      {order.refund_id}
                    </dd>
                  </div>
                )}
                {order.refunded_at && (
                  <div className="admin-fact">
                    <dt>Paid back on</dt>
                    <dd>{formatDate(order.refunded_at)}</dd>
                  </div>
                )}
              </dl>
              {order.refund_error && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  <span className="block font-semibold">Last error</span>
                  {order.refund_error}
                </p>
              )}
              {order.refund_status === "pending" && (
                <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-500">
                  The payment provider has accepted the refund. It has not
                  reached the customer yet — it takes 3–4 business days.
                </p>
              )}
            </Panel>
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
          <Panel
            title={
              <>
                <MapPin className="h-4 w-4 text-brand" />
                Delivery address
              </>
            }
          >
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
          </Panel>

          {/* The payment. */}
          <Panel
            title={
              <>
                <CreditCard className="h-4 w-4 text-brand" />
                Payment
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-gray-600">
                {paymentMethodLabel(order.payment_method)}
              </p>
              <PaymentStatusBadge status={order.payment_status} variant="admin" />
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
          </Panel>

          {/* Returns and replacements. */}
          {returns.length > 0 && (
            <Panel
              title={
                <>
                  <RotateCcw className="h-4 w-4 text-brand" />
                  Returns &amp; Replacements ({returns.length})
                </>
              }
            >
              <div className="space-y-3">
                {returns.map((ret) => (
                  <div
                    key={ret.id}
                    className="rounded-lg border border-gray-200 p-3 text-[13px]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/admin/returns/${ret.id}`}
                        className="tnum font-bold text-brand hover:underline"
                      >
                        {ret.id}
                      </Link>
                      <ReturnStatusBadge status={ret.status} />
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
            </Panel>
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
    </>
  );
}
