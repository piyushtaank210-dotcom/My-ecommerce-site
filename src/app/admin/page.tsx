import Link from "next/link";
import {
  IndianRupee,
  ShoppingBag,
  Users,
  Package,
  PackageX,
  MessageSquare,
  AlertTriangle,
  ArrowRight,
  Check,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { getAdminStats } from "@/lib/admin";
import { getReturnSummaryStats } from "@/lib/returns";
import { requirePermission } from "@/lib/guard";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = { title: "Overview" };

/**
 * One screen for the whole store: the money, the orders, the people, the
 * catalogue and the queue — with links into each of them.
 */
export default async function AdminDashboardPage() {
  await requirePermission("dashboard.view");
  const stats = getAdminStats();
  const returnStats = getReturnSummaryStats();

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Store overview</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          Everything happening in ConsoleSeller right now.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Revenue"
          value={money(stats.revenue)}
          hint={`${money(stats.revenueLast30)} in the last 30 days`}
          icon={IndianRupee}
          tone="good"
        />
        <StatCard
          label="Orders"
          value={String(stats.orders)}
          hint={`${stats.ordersLast30} in the last 30 days`}
          icon={ShoppingBag}
        />
        <StatCard
          label="Returns & claims"
          value={String(returnStats.requested + returnStats.approved + returnStats.received)}
          hint={`${returnStats.requested} pending review`}
          icon={RotateCcw}
          tone={returnStats.requested > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Customers"
          value={String(stats.customers)}
          hint={`${stats.customersLast30} joined in the last 30 days`}
          icon={Users}
        />
        <StatCard
          label="Open enquiries"
          value={String(stats.openMessages)}
          hint="New and in-progress messages"
          icon={MessageSquare}
          tone={stats.openMessages > 0 ? "warn" : "good"}
        />
      </div>

      {/* The catalogue, counted properly. */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Products"
          value={String(stats.totalProducts)}
          hint={`${stats.products} on the shop floor`}
          icon={Package}
        />
        <StatCard
          label="Published"
          value={String(stats.publishedProducts)}
          hint="On sale"
          icon={Check}
          tone="good"
        />
        <StatCard
          label="Drafts"
          value={String(stats.draftProducts)}
          hint={
            stats.archivedProducts
              ? `${stats.archivedProducts} archived`
              : "Not on sale yet"
          }
          icon={Pencil}
        />
        <StatCard
          label="Low stock"
          value={String(stats.lowStock)}
          hint="At or below their threshold"
          icon={AlertTriangle}
          tone={stats.lowStock > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Out of stock"
          value={String(stats.outOfStock)}
          hint="Nothing left to sell"
          icon={PackageX}
          tone={stats.outOfStock > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Recent orders */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <h2 className="text-[15px] font-bold text-ink">Latest orders</h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
            >
              All orders
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {stats.recentOrders.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-gray-500">
              No orders yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {stats.recentOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="tnum text-[13.5px] font-semibold text-brand hover:underline"
                    >
                      {o.id}
                    </Link>
                    <p className="truncate text-[12.5px] text-gray-500">
                      {o.name} · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="tnum text-[13.5px] font-semibold text-ink">
                      {money(o.total)}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      {formatDate(o.created_at)}
                    </p>
                  </div>
                  <span className="w-24 shrink-0 text-right text-[12px] font-medium capitalize text-gray-600">
                    {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {/* Orders by status */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-[15px] font-bold text-ink">
              Orders by status
            </h2>
            {stats.byStatus.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">No orders yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.byStatus.map((s) => {
                  const max = Math.max(
                    ...stats.byStatus.map((x) => x.count),
                    1
                  );
                  return (
                    <li key={s.status}>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-ink">
                          {ORDER_STATUS_LABEL[s.status as OrderStatus] ??
                            s.status}
                        </span>
                        <span className="tnum text-gray-500">{s.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${(s.count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Top products */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-[15px] font-bold text-ink">Best sellers</h2>
            <p className="mb-4 text-[12px] text-gray-500">
              Counted from the orders that were not cancelled.
            </p>
            {stats.topProducts.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">
                Nothing sold yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.topProducts.map((p) => (
                  <li
                    key={p.slug}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {p.name}
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] text-gray-500">
                      {p.units} × {money(p.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Low stock */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">Running low</h2>
              <Link
                href="/admin/inventory"
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                Inventory
              </Link>
            </div>
            {stats.lowStockProducts.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">
                Everything is comfortably in stock.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {stats.lowStockProducts.map((p) => (
                  <li
                    key={`${p.slug}-${p.variant_name ?? ""}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/admin/products/${p.slug}`}
                        className="block truncate text-[13px] font-medium text-ink hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      {p.variant_name && (
                        <span className="block truncate text-[11.5px] text-gray-500">
                          {p.variant_name}
                        </span>
                      )}
                    </span>
                    <span
                      className={`tnum shrink-0 text-[12.5px] font-semibold ${
                        p.level === "out" ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {p.stock} left
                      <span className="font-normal text-gray-400">
                        {" "}
                        · low at {p.threshold}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
