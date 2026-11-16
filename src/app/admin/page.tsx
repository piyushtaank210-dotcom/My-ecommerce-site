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
import { getReturnsOverview } from "@/lib/returns-records";
import { requirePermission } from "@/lib/guard";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { StatCard } from "@/components/admin/ui/StatCard";
import { Panel } from "@/components/admin/ui/Panel";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Badge } from "@/components/admin/ui/Badge";
import { ORDER_STATUS_TONE } from "@/lib/status-tone";

export const metadata = { title: "Overview" };

/**
 * One screen for the whole store: the money, the orders, the people, the
 * catalogue and the queue — with links into each of them.
 */
export default async function AdminDashboardPage() {
  await requirePermission("dashboard.view");
  const stats = (await getAdminStats());
  const returnStats = (await getReturnsOverview());

  const pendingReturns = returnStats.newRequests + returnStats.pendingReview;
  const maxStatus = Math.max(...stats.byStatus.map((x) => x.count), 1);

  return (
    <>
      <PageHeader
        eyebrow="Store overview"
        title="Good to see you"
        description="Everything happening in ConsoleSeller right now — the money, the orders, the catalogue and the queue that is waiting on you."
        actions={
          <>
            <Link href="/admin/orders" className="btn btn-outline btn-sm">
              <ShoppingBag className="h-4 w-4" />
              All orders
            </Link>
            <Link href="/admin/products" className="btn btn-primary btn-sm">
              <Package className="h-4 w-4" />
              Open the catalogue
            </Link>
          </>
        }
      />

      {/* The five numbers that matter most. */}
      <div className="admin-stat-row">
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
          label="Pending returns"
          value={String(pendingReturns)}
          hint={`${returnStats.newRequests} new, ${returnStats.pendingReview} under review`}
          icon={RotateCcw}
          tone={pendingReturns > 0 ? "warn" : "good"}
          href="/admin/returns?status=requested"
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
          href="/admin/messages"
        />
      </div>

      {/* The catalogue, counted properly. */}
      <div className="admin-section">
        <div className="admin-section-head">
          <h2 className="admin-h1-sm">The catalogue</h2>
          <Link href="/admin/products" className="admin-links">
            Open the catalogue
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="admin-stat-row">
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
            href="/admin/inventory?level=low"
          />
          <StatCard
            label="Out of stock"
            value={String(stats.outOfStock)}
            hint="Nothing left to sell"
            icon={PackageX}
            tone={stats.outOfStock > 0 ? "warn" : "good"}
            href="/admin/inventory?level=out"
          />
        </div>
      </div>

      <div className="admin-section admin-split">
        {/* Recent orders */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Latest orders"
            description="The last few orders, newest first."
            actions={
              <Link href="/admin/orders" className="admin-links">
                All orders
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            bodyClass="admin-panel-body--flush"
          >
            {stats.recentOrders.length === 0 ? (
              <p className="px-5 py-12 text-center text-[13.5px] text-gray-500">
                No orders yet.
              </p>
            ) : (
              <div className="admin-table-wrap" style={{ border: 0, borderRadius: 0 }}>
                <table className="admin-table" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th className="admin-th-num">Items</th>
                      <th className="admin-th-num">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="tnum text-[13px] font-semibold text-brand hover:underline"
                          >
                            {o.id}
                          </Link>
                          <span className="admin-cell-sub">
                            {formatDate(o.created_at)}
                          </span>
                        </td>
                        <td>
                          <span className="admin-cell-title">{o.name}</span>
                        </td>
                        <td className="admin-td-num text-[12.5px] text-gray-500">
                          {o.item_count}
                        </td>
                        <td className="admin-td-num text-[13px] font-semibold text-ink">
                          {money(o.total)}
                        </td>
                        <td>
                          <Badge tone={ORDER_STATUS_TONE[o.status] ?? "neutral"}>
                            {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Top products */}
          <Panel
            title="Best sellers"
            description="Counted from the orders that were not cancelled."
          >
            {stats.topProducts.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">Nothing sold yet.</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {stats.topProducts.map((p) => (
                  <li
                    key={p.slug}
                    className="flex min-w-0 items-center justify-between gap-3"
                  >
                    <Link
                      href={`/admin/products/${p.slug}`}
                      className="admin-cell-title min-w-0 hover:text-brand"
                    >
                      {p.name}
                    </Link>
                    <span className="tnum shrink-0 text-[12.5px] text-gray-500">
                      {p.units} × {money(p.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Orders by status */}
          <Panel title="Orders by status">
            {stats.byStatus.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">No orders yet.</p>
            ) : (
              <ul className="space-y-3">
                {stats.byStatus.map((s) => (
                  <li key={s.status}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium text-ink">
                        {ORDER_STATUS_LABEL[s.status as OrderStatus] ?? s.status}
                      </span>
                      <span className="tnum text-gray-500">{s.count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(s.count / maxStatus) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Low stock */}
          <Panel
            title="Running low"
            actions={
              <Link href="/admin/inventory" className="admin-links">
                Inventory
              </Link>
            }
          >
            {stats.lowStockProducts.length === 0 ? (
              <p className="text-[13.5px] text-gray-500">
                Everything is comfortably in stock.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.lowStockProducts.map((p) => (
                  <li
                    key={`${p.slug}-${p.variant_name ?? ""}`}
                    className="flex min-w-0 items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/admin/products/${p.slug}`}
                        className="admin-cell-title hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      {p.variant_name && (
                        <span className="admin-cell-sub">{p.variant_name}</span>
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
          </Panel>
        </div>
      </div>
    </>
  );
}
