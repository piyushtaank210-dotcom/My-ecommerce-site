import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, CreditCard, Package, RotateCcw } from "lucide-react";
import { getReturnRequestsForOrder, RETURN_STATUS_LABEL, RETURN_STATUS_TONE } from "@/lib/returns";
import { getOrder } from "@/lib/orders";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { STOCK_STATE_LABEL } from "@/lib/stock";
import { getUserById } from "@/lib/auth";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { getCancellationForOrder } from "@/lib/cancellations";
import { OrderCancellationPanel } from "@/components/admin/OrderCancellationPanel";

export const metadata = { title: "Order" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("orders.view");
  const { id } = await params;
  const order = (await getOrder(id));
  if (!order) notFound();

  const customer = order.user_id ? await getUserById(order.user_id) : null;
  const returns = (await getReturnRequestsForOrder(order.id));
  const cancellation = (await getCancellationForOrder(order.id));

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="tnum text-[26px] font-bold text-ink">Order {order.id}</h1>
          {can(user.role, "orders.update") && (
            <OrderStatusSelect orderId={order.id} status={order.status} />
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-gray-500">
          Placed {formatDate(order.created_at)}
          {customer && (
            <>
              {" · "}
              <Link
                href={`/admin/users?q=${encodeURIComponent(customer.email)}`}
                className="text-brand hover:underline"
              >
                {customer.name}
              </Link>
            </>
          )}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 px-5 py-4 text-[15px] font-bold text-ink">
            Items ({order.items.length})
          </h2>
          <ul className="divide-y divide-gray-200">
            {order.items.map((item, i) => (
              <li
                key={`${item.product_slug}-${i}`}
                className="flex items-center gap-4 px-5 py-3.5"
              >
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
                  {item.backordered > 0 && (
                    <span className="mt-1 block text-[11.5px] font-medium text-amber-700">
                      {item.backordered} on backorder — the shelf does not
                      have them yet
                    </span>
                  )}
                  <span className="mt-1 inline-flex items-center gap-1.5">
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

          <dl className="space-y-2 border-t border-gray-200 px-5 py-4 text-[13.5px]">
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

        <div className="space-y-5">
          {cancellation && (
            <OrderCancellationPanel
              cancellation={cancellation}
              orderTotal={order.total}
              canDecide={can(user.role, "orders.update")}
            />
          )}

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

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
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
            <p className="mt-2 text-[12.5px] text-gray-500">
              {order.email} · {order.phone}
            </p>
            {order.notes && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[12.5px] text-gray-600">
                <span className="block font-semibold text-ink">Order note</span>
                {order.notes}
              </p>
            )}
          </section>

          {returns.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
                <RotateCcw className="h-4 w-4 text-brand" />
                Returns & Replacements ({returns.length})
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
