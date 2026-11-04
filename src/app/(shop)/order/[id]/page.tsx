import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Package,
  MapPin,
  CreditCard,
  ArrowRight,
  Truck,
  RotateCcw,
  Clock,
} from "lucide-react";
import {
  getReturnRequestsForOrder,
  getOrderReturnEligibility,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
} from "@/lib/returns";
import { getOrder } from "@/lib/orders";
import { ORDER_STATUS_LABEL, ORDER_TIMELINE, type OrderStatus } from "@/lib/orders";
import { getProduct } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id}` };
}

/**
 * The order page. It doubles as the thank-you page after checkout and as
 * the order history, so the headline follows where the order has got to.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();

  // A signed-in customer only sees their own orders. Guests can still open
  // the order they just placed — the id is the only receipt they get.
  const viewer = await getCurrentUser();
  if (
    viewer &&
    order.user_id !== null &&
    order.user_id !== viewer.id &&
    !isStaff(viewer.role)
  ) {
    notFound();
  }

  const status = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    order.status as OrderStatus
  )
    ? (order.status as OrderStatus)
    : "confirmed";
  const cancelled = status === "cancelled";
  const step = ORDER_TIMELINE.findIndex((s) => s.status === status);
  const returnRequests = getReturnRequestsForOrder(order.id);
  const eligibility = getOrderReturnEligibility(order);

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span
            className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
              cancelled
                ? "bg-red-50 text-red-600"
                : step >= ORDER_TIMELINE.length - 1
                  ? "bg-green-50 text-green-600"
                  : "bg-brand-tint text-brand"
            }`}
          >
            {cancelled ? (
              <Package className="h-7 w-7" />
            ) : step >= ORDER_TIMELINE.length - 1 ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : (
              <Truck className="h-7 w-7" />
            )}
          </span>
          <h1 className="mt-5 text-[28px] font-bold text-ink">
            {status === "confirmed"
              ? "Order confirmed"
              : `Order ${ORDER_STATUS_LABEL[status]}`}
          </h1>
          <p className="mt-2 text-[14px] text-gray-500">
            {status === "confirmed" ? (
              <>
                Thanks{order.name ? `, ${order.name.split(" ")[0]}` : ""}! We&apos;ve
                received your order and sent a confirmation to{" "}
                <span className="font-medium text-ink">{order.email}</span>.
              </>
            ) : (
              <>
                This order is{" "}
                <span className="font-medium text-ink">
                  {ORDER_STATUS_LABEL[status].toLowerCase()}
                </span>
                . We&apos;ll email {order.email} as soon as that changes.
              </>
            )}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-[13.5px]">
            <span className="text-gray-500">Order ID</span>
            <span className="tnum font-bold text-ink">{order.id}</span>
          </p>
        </div>

        {/* Status */}
        {!cancelled && (
          <ol className="mt-10 grid gap-5 sm:grid-cols-4">
            {ORDER_TIMELINE.map((s, i) => (
              <li key={s.status}>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                      i <= step
                        ? "bg-brand text-white"
                        : "border border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < 3 && (
                    <span
                      className={`hidden h-px flex-1 sm:block ${
                        i < step ? "bg-brand" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
                <p
                  className={`mt-2 text-[13px] font-semibold ${
                    i <= step ? "text-ink" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[12px] text-gray-500">
                  {i <= step ? "Done" : s.note}
                </p>
              </li>
            ))}
          </ol>
        )}

        {cancelled && (
          <p className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-[13.5px] text-red-700">
            This order was cancelled. Nothing was charged — if that is not
            what you expected, get in touch and we will sort it out.
          </p>
        )}

        {/* Items */}
        <section className="mt-10 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-[15px] font-bold text-ink">
            Items ({order.items.length})
          </h2>
          <ul className="divide-y divide-gray-200">
            {order.items.map((item, i) => {
              const itemProduct = getProduct(item.product_slug);
              const key = item.id ?? i + 1;
              const itemEligibility = eligibility.itemEligibilities[key];

              return (
                <li
                  key={`${item.product_slug}-${i}`}
                  className="py-3.5"
                >
                  <div className="flex items-center gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-gray-100 bg-gray-50">
                      {itemProduct?.image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={itemProduct.image}
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/product/${item.product_slug}`}
                        className="block truncate text-[13.5px] font-semibold text-ink hover:text-brand"
                      >
                        {item.name}
                      </Link>
                      {item.variant_name && (
                        <span className="block text-[12px] text-gray-500">
                          {item.variant_name}
                        </span>
                      )}
                      <span className="tnum block text-[12px] text-gray-500">
                        {item.quantity} × {money(item.price)}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[14px] font-bold text-ink">
                      {money(item.price * item.quantity)}
                    </span>
                  </div>

                  {/* Individual Product Return / Replacement Action Bar */}
                  {eligibility.isDelivered && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-2 text-[12.5px]">
                      {itemEligibility?.hasActiveRequest ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[11.5px] font-semibold text-brand">
                            {itemEligibility.activeRequest?.type === "replacement"
                              ? "Replacement"
                              : "Return"}{" "}
                            Active ({itemEligibility.activeRequest?.id})
                          </span>
                          <Link
                            href={`/account/returns/${itemEligibility.activeRequest?.id}`}
                            className="font-medium text-brand hover:underline"
                          >
                            Track status →
                          </Link>
                        </div>
                      ) : itemEligibility?.canReturn ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/order/${order.id}/return?itemId=${key}&type=return`}
                            className="btn btn-outline btn-xs"
                          >
                            Return Product
                          </Link>
                          <Link
                            href={`/order/${order.id}/return?itemId=${key}&type=replacement`}
                            className="btn btn-outline btn-xs"
                          >
                            Replace Product
                          </Link>
                        </div>
                      ) : eligibility.isWindowClosed ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-400">
                          Return Window Closed
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-400">
                          {itemEligibility?.reason || "Non-returnable"}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-[13.5px]">
            <div className="flex justify-between">
              <dt className="text-gray-500">Subtotal</dt>
              <dd className="tnum font-semibold text-ink">{money(order.subtotal)}</dd>
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
              <dt className="text-[15px] font-bold text-ink">Total paid</dt>
              <dd className="tnum text-[20px] font-bold text-ink">
                {money(order.total)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-ink">
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

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-ink">
              <CreditCard className="h-4 w-4 text-brand" />
              Payment
            </h2>
            <p className="text-[13px] text-gray-600">
              {order.payment_method === "emi"
                ? "No Cost EMI"
                : order.payment_method === "cod"
                  ? "Cash on Delivery"
                  : order.payment_method.toUpperCase()}
            </p>
            <p className="mt-1 text-[12.5px] capitalize text-gray-500">
              Placed {formatDate(order.created_at)}
            </p>
          </section>
        </div>

        {/* Returns & Replacements Section */}
        {returnRequests.length > 0 ? (
          <section className="mt-6 rounded-xl border border-brand/20 bg-brand-tint/10 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-ink">
              <RotateCcw className="h-4 w-4 text-brand" />
              Return / Replacement Request
            </h2>
            <div className="space-y-3">
              {returnRequests.map((ret) => (
                <div
                  key={ret.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3.5"
                >
                  <div>
                    <span className="font-bold text-ink">{ret.id}</span>
                    <span className="ml-2 text-[12.5px] text-gray-500">
                      {ret.type === "replacement" ? "Replacement" : "Return & Refund"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold capitalize ${
                        RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {RETURN_STATUS_LABEL[ret.status]}
                    </span>
                    <Link
                      href={`/account/returns/${ret.id}`}
                      className="btn btn-outline btn-xs"
                    >
                      Track return
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : eligibility.eligible ? (
          <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand/20 bg-brand-tint/10 p-5">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
                <RotateCcw className="h-4 w-4 text-brand" />
                Return & Replacement Window Active
              </h2>
              <p className="mt-0.5 text-[12.5px] text-gray-600">
                Delivered on {formatDate(order.delivered_at || order.created_at)}. Return or exchange eligible items until{" "}
                <strong className="text-ink">{eligibility.formattedDeadline}</strong> ({eligibility.daysRemaining}{" "}
                {eligibility.daysRemaining === 1 ? "day" : "days"} remaining).
              </p>
            </div>
            <Link
              href={`/order/${order.id}/return`}
              className="btn btn-primary btn-sm"
            >
              Request return / replacement
            </Link>
          </section>
        ) : eligibility.isWindowClosed ? (
          <section className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-center gap-2 text-[14px] font-bold text-gray-700">
              <Clock className="h-4 w-4 text-gray-400" />
              Return Window Closed
            </div>
            <p className="mt-1 text-[12.5px] text-gray-500">
              The {eligibility.windowDays}-calendar-day return window for this order closed on{" "}
              <span className="font-medium text-gray-700">{eligibility.formattedDeadline}</span>.
            </p>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-4">
          <Link href="/account/orders" className="btn btn-outline">
            <Package className="h-4 w-4" />
            View my orders
          </Link>
          <Link
            href="/category/consoles"
            className="flex items-center gap-1.5 text-[13.5px] font-medium text-brand hover:underline"
          >
            Continue shopping
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
