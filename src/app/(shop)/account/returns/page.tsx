import Link from "next/link";
import { RotateCcw, ArrowRight, Package, Truck, CreditCard, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/guard";
import {
  getReturnRequestsForUser,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_TYPE_LABEL,
  returnReasonLabel,
} from "@/lib/returns";
import { getProduct } from "@/lib/queries";
import { money, formatDate } from "@/lib/format";

export const metadata = { title: "My Returns & Replacements — ConsoleSeller" };

export default async function AccountReturnsPage() {
  const user = await requireUser("/account/returns");
  const rawReturns = getReturnRequestsForUser(user.id);

  // Enrich items with images
  const returns = rawReturns.map((ret) => ({
    ...ret,
    items: ret.items.map((it) => ({
      ...it,
      image: getProduct(it.product_slug)?.image ?? null,
    })),
  }));

  if (returns.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-xs">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-brand">
          <RotateCcw className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-[16px] font-bold text-ink">No return or replacement requests</h2>
        <p className="mt-1.5 text-[13.5px] text-gray-500 max-w-md mx-auto">
          Need to return or replace an item? You can submit a request directly from any delivered order within the 5-day return window.
        </p>
        <Link href="/account/orders" className="btn btn-primary btn-sm mt-5">
          View My Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <h1 className="text-[20px] font-bold text-ink">My Returns & Replacements</h1>
        <span className="text-[13px] text-gray-500">
          Total: <strong className="text-ink">{returns.length}</strong>
        </span>
      </div>

      {returns.map((ret) => (
        <article
          key={ret.id}
          className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-xs"
        >
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/account/returns/${ret.id}`}
                  className="tnum text-[15.5px] font-bold text-brand hover:underline"
                >
                  {ret.id}
                </Link>
                <span className="text-gray-300">·</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11.5px] font-semibold text-blue-700 border border-blue-200">
                  {RETURN_TYPE_LABEL[ret.type]}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-gray-500">
                Requested on {formatDate(ret.created_at)} for{" "}
                <Link
                  href={`/order/${ret.order_id}`}
                  className="font-medium text-brand hover:underline"
                >
                  Order {ret.order_id}
                </Link>
              </p>
            </div>

            <span
              className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold capitalize ${
                RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {RETURN_STATUS_LABEL[ret.status] ?? ret.status}
            </span>
          </header>

          {/* Reason */}
          <div className="mt-3 border-t border-gray-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
            <p className="text-gray-600">
              <span className="font-semibold text-ink">Reason: </span>
              {returnReasonLabel(ret.reason)}
            </p>
            {ret.customer_notes && (
              <span className="text-gray-500 italic max-w-md truncate">
                “{ret.customer_notes}”
              </span>
            )}
          </div>

          {/* Admin remarks preview if available */}
          {ret.admin_notes && (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-[12px] text-blue-900">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-brand mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">Store Remarks: </span>
                <span className="text-blue-950">{ret.admin_notes}</span>
              </div>
            </div>
          )}

          {/* Items with thumbnails */}
          <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2">
            {ret.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {item.image ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-contain p-0.5"
                      />
                    </div>
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-100 bg-gray-50 text-gray-400">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                  <span className="truncate font-medium text-ink">
                    {item.name}{" "}
                    <span className="text-gray-400 font-normal">× {item.quantity}</span>
                  </span>
                </div>

                <span className="tnum shrink-0 font-bold text-ink">
                  {money(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div className="text-[12.5px] text-gray-600">
              {ret.status === "completed" && ret.type === "return" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CreditCard className="h-3.5 w-3.5" />
                  Refund of {money(ret.refund_amount)} processed
                </span>
              ) : ret.status === "completed" && ret.type === "replacement" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <Truck className="h-3.5 w-3.5" />
                  Replacement {ret.replacement_order_id || "shipment"} dispatched
                </span>
              ) : ret.pickup_tracking ? (
                <span className="inline-flex items-center gap-1.5 text-purple-700 font-medium">
                  <Truck className="h-3.5 w-3.5" />
                  Pickup scheduled via {ret.pickup_courier} · AWB: {ret.pickup_tracking}
                </span>
              ) : (
                <span>Stage: <strong className="text-ink">{RETURN_STATUS_LABEL[ret.status]}</strong></span>
              )}
            </div>

            <Link
              href={`/account/returns/${ret.id}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            >
              Track request
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </footer>
        </article>
      ))}
    </div>
  );
}
