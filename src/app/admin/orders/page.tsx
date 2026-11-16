import Link from "next/link";
import { ShoppingBag, Inbox } from "lucide-react";
import { countOrders, listOrders } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/orders";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/OrderStatusBadge";
import { Pagination } from "@/components/admin/ui/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";

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

  const orders = (await listOrders(query));
  const total = (await countOrders(query));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // How many orders are waiting to be checked. It is counted on its own
  // so that the banner does not depend on the filter that is on.
  const pendingCount = await countOrders({ q, status: "pending" });

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  };

  /**
   * The link that shows the orders with one status, and how many there
   * are. The count is the number of orders with that status and the
   * search that is on, so that it is the count of what is being looked
   * at.
   */
  const statusTab = async (value: string, label: string) => {
    const count = await countOrders({
      q,
      status: value === "all" ? undefined : value,
    });
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (value !== "all") p.set("status", value);
    const qs = p.toString();
    const active = status === value;
    return (
      <Link
        key={value}
        href={`/admin/orders${qs ? `?${qs}` : ""}`}
        aria-current={active ? "page" : undefined}
        className="admin-tab"
      >
        {label}
        <span className="admin-tab-count">{count}</span>
      </Link>
    );
  };

  const tabs = await Promise.all([
    statusTab("all", "All"),
    ...ORDER_STATUSES.map((s) => statusTab(s, ORDER_STATUS_LABEL[s])),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Orders"
        description={`${total} order${total === 1 ? "" : "s"} — newest first.`}
      />

      {/* The statuses as tabs, each with the number of orders behind
          it. The pending ones are the first thing on the list, because
          they are the ones waiting on the back office. */}
      <nav className="admin-tabs mb-5" aria-label="Orders by status">
        {tabs}
      </nav>

      {pendingCount > 0 && status !== "pending" && (
        <p className="admin-notice admin-notice--warn mb-5">
          <Inbox className="admin-notice-icon h-4 w-4" />
          <span>
            {pendingCount} order{pendingCount === 1 ? " is" : "s are"} waiting to
            be checked.{" "}
            <Link
              href={`/admin/orders${q ? `?q=${encodeURIComponent(q)}&status=pending` : "?status=pending"}`}
              className="font-semibold underline"
            >
              See {pendingCount === 1 ? "it" : "them"}
            </Link>
          </span>
        </p>
      )}

      <div className="admin-toolbar">
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
        <EmptyState
          icon={ShoppingBag}
          title="No orders match"
          description="Nothing here matches the search and the filters. Clear them and the whole list comes back."
          action={
            <Link href="/admin/orders" className="btn btn-outline btn-sm">
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ minWidth: 940 }}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Delivery</th>
                  <th className="admin-th-num">Items</th>
                  <th className="admin-th-num">Total</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="admin-th-num">Open</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} data-hl={o.status === "pending" ? "warn" : undefined}>
                    <td>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="tnum text-[13px] font-semibold text-brand hover:underline"
                      >
                        {o.id}
                      </Link>
                      <span className="admin-cell-sub">{formatDate(o.created_at)}</span>
                    </td>
                    <td>
                      <span className="admin-cell-title">{o.name}</span>
                      <span className="admin-cell-sub">{o.email}</span>
                    </td>
                    <td className="text-[12.5px] text-gray-500">
                      {o.city}, {o.state}
                    </td>
                    <td className="admin-td-num text-gray-500">{o.item_count}</td>
                    <td className="admin-td-num font-semibold text-ink">
                      {money(o.total)}
                    </td>
                    <td>
                      {canUpdate ? (
                        <OrderStatusSelect orderId={o.id} status={o.status} />
                      ) : (
                        <OrderStatusBadge status={o.status} variant="admin" />
                      )}
                    </td>
                    <td>
                      <PaymentStatusBadge status={o.payment_status} variant="admin" />
                    </td>
                    <td className="admin-td-actions">
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

          <div className="admin-table-foot">
            <span className="tnum">
              Showing {(page - 1) * PER_PAGE + 1}–
              {(page - 1) * PER_PAGE + orders.length} of {total}
            </span>
            <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
          </div>
        </>
      )}
    </>
  );
}
