import Link from "next/link";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/guard";
import { getOrdersForUser } from "@/lib/orders";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { getReturnRequestsForOrder, isReturnEligible } from "@/lib/returns";

export const metadata = { title: "My orders" };

const TONE: Record<string, string> = {
  confirmed: "bg-brand-tint text-brand",
  packed: "bg-indigo-50 text-indigo-700",
  shipped: "bg-sky-50 text-sky-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
};

export default async function AccountOrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = getOrdersForUser(user.id);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-400">
          <Package className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-ink">No orders yet</p>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          When you place an order it will show up here.
        </p>
        <Link href="/category/consoles" className="btn btn-primary btn-sm mt-5">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const retReqs = getReturnRequestsForOrder(o.id);
        const eligible = isReturnEligible(o);

        return (
          <article
            key={o.id}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link
                  href={`/order/${o.id}`}
                  className="tnum text-[15px] font-bold text-brand hover:underline"
                >
                  {o.id}
                </Link>
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  Placed {formatDate(o.created_at)}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize ${
                  TONE[o.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
              </span>
            </header>

            <ul className="mt-4 space-y-2 border-t border-gray-100 pt-3.5">
              {o.items.map((item, i) => (
                <li
                  key={`${item.product_slug}-${i}`}
                  className="flex items-center justify-between gap-4 text-[13px]"
                >
                  <span className="min-w-0 flex-1 truncate text-gray-600">
                    {item.name}
                    {item.variant_name ? (
                      <span className="text-gray-400"> · {item.variant_name}</span>
                    ) : null}
                    <span className="tnum text-gray-400"> × {item.quantity}</span>
                  </span>
                  <span className="tnum shrink-0 font-medium text-ink">
                    {money(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3.5">
              <span className="text-[12.5px] text-gray-500">
                Delivering to {o.city}, {o.state}
              </span>
              <span className="flex items-center gap-3">
                <span className="tnum text-[14px] font-bold text-ink">
                  {money(o.total)}
                </span>
                {retReqs.length > 0 ? (
                  <Link
                    href={`/account/returns/${retReqs[0].id}`}
                    className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[12px] font-semibold text-brand hover:underline"
                  >
                    Return {retReqs[0].id}
                  </Link>
                ) : eligible.eligible ? (
                  <Link
                    href={`/order/${o.id}/return`}
                    className="rounded border border-gray-200 px-2.5 py-0.5 text-[12px] font-medium text-ink hover:border-brand hover:text-brand"
                  >
                    Return / Replace ({eligible.daysRemaining}d left)
                  </Link>
                ) : eligible.isWindowClosed ? (
                  <span className="text-[11.5px] text-gray-400">
                    Return window closed
                  </span>
                ) : null}
                <Link
                  href={`/order/${o.id}`}
                  className="text-[13px] font-medium text-brand hover:underline"
                >
                  View order
                </Link>
              </span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
