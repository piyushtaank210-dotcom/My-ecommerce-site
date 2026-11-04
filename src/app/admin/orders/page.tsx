import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { countOrders, listOrders } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/orders";
import { Pagination } from "@/components/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";

export const metadata = { title: "Orders" };

const PER_PAGE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("orders.view");
  const sp = await searchParams;
  const canUpdate = can(user.role, "orders.update");

  const q = one(sp.q).trim() || undefined;
  const status = one(sp.status) || "all";
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    status: status === "all" ? undefined : status,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const orders = listOrders(query);
  const total = countOrders(query);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Orders</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          {total} order{total === 1 ? "" : "s"} — newest first.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search order, name, email or phone" />
        <PanelFilter
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            ...ORDER_STATUSES.map((s) => ({
              value: s,
              label: ORDER_STATUS_LABEL[s],
            })),
          ]}
        />
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <ShoppingBag className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No orders match
          </h2>
          <Link href="/admin/orders" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Delivery</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((o) => (
                <tr key={o.id} className="bg-white">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="tnum font-semibold text-brand hover:underline"
                    >
                      {o.id}
                    </Link>
                    <p className="text-[12px] text-gray-500">
                      {formatDate(o.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{o.name}</p>
                    <p className="text-[12px] text-gray-500">{o.email}</p>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-gray-500">
                    {o.city}, {o.state}
                  </td>
                  <td className="tnum px-4 py-3 text-gray-500">{o.item_count}</td>
                  <td className="tnum px-4 py-3 font-semibold text-ink">
                    {money(o.total)}
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate ? (
                      <OrderStatusSelect orderId={o.id} status={o.status} />
                    ) : (
                      <span className="text-[12.5px] font-medium capitalize text-gray-600">
                        {ORDER_STATUS_LABEL[
                          o.status as keyof typeof ORDER_STATUS_LABEL
                        ] ?? o.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-[13px] font-medium text-brand hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
