import Link from "next/link";
import {
  RotateCcw,
  Clock,
  CircleCheck,
  IndianRupee,
  ArrowRight,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  FileWarning,
  Truck,
  Ban,
  Inbox,
  PackageCheck,
  Wallet,
  CheckCheck,
} from "lucide-react";
import { requirePermission } from "@/lib/guard";
import {
  listReturnRequests,
  countReturnRequests,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_TYPE_LABEL,
  RETURN_STATUSES,
  RETURN_TYPES,
  returnReasonLabel,
} from "@/lib/returns";
import { getReturnsOverview } from "@/lib/returns-records";
import { money, formatDate } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { PanelDateRange } from "@/components/admin/PanelDateRange";
import { ReturnTabs } from "@/components/admin/ReturnTabs";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Returns & Refunds" };

const PER_PAGE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/**
 * The views a request list can be read through. Each one sets the filters
 * that make it what it is, so the URL always says exactly what is being
 * shown.
 */
const TABS: {
  key: string;
  label: string;
  params: Record<string, string | undefined>;
}[] = [
  { key: "all", label: "All Requests", params: {} },
  { key: "new", label: "New Requests", params: { status: "requested" } },
  { key: "returns", label: "Returns", params: { type: "return" } },
  { key: "replacements", label: "Replacements", params: { type: "replacement" } },
  { key: "accessories", label: "Missing Accessories", params: { type: "accessories" } },
  { key: "pending_review", label: "Pending Review", params: { status: "under_review" } },
  {
    key: "evidence_required",
    label: "Evidence Required",
    params: { status: "info_requested" },
  },
  { key: "approved", label: "Approved", params: { status: "approved" } },
  { key: "pickup_pending", label: "Pickup Pending", params: { status: "pickup_scheduled" } },
  { key: "product_received", label: "Product Received", params: { status: "received" } },
  {
    key: "replacement_dispatched",
    label: "Replacement Dispatched",
    params: { status: "replacement_dispatched" },
  },
  { key: "refunds", label: "Refund Requests", params: { refunds: "1" } },
  { key: "completed", label: "Resolved", params: { status: "resolved" } },
  { key: "rejected", label: "Rejected", params: { status: "rejected" } },
];

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermission("returns.view");
  const sp = await searchParams;

  const q = one(sp.q).trim() || undefined;
  const status = one(sp.status) || "all";
  const type = one(sp.type) || "all";
  const refunds = one(sp.refunds) === "1";
  const from = one(sp.from).trim() || undefined;
  const to = one(sp.to).trim() || undefined;
  const sort = one(sp.sort) || "newest";
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    refunds: refunds || undefined,
    from,
    to,
    sort,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const returns = (await listReturnRequests(query));
  const total = (await countReturnRequests(query));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const stats = (await getReturnsOverview());

  /**
   * A link that keeps the search, the dates and the order, and changes
   * only what it is about. The page is dropped, because page four of the
   * old view is not page four of the new one.
   */
  const linkWith = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (refunds) p.set("refunds", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (sort !== "newest") p.set("sort", sort);
    for (const [key, value] of Object.entries(change)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    const qs = p.toString();
    return `/admin/returns${qs ? `?${qs}` : ""}`;
  };

  const pageLink = (n: number) => linkWith({ page: n > 1 ? String(n) : undefined });

  /** A column heading that orders the list, and says which way it goes. */
  const sortLink = (column: string, next: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (refunds) p.set("refunds", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("sort", next);
    return `/admin/returns?${p.toString()}`;
  };

  const sortedBy = (column: string, next: string) =>
    sort === next ? "text-ink" : "text-gray-400 hover:text-gray-600";

  const sortIcon = (column: string, next: string) => {
    if (sort !== next) return <ArrowUpDown className="h-3 w-3" />;
    return next === "oldest" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  // The tab that matches what is on screen. A status wins over a type,
  // because a status is the narrower thing to be looking at.
  const activeTab = (() => {
    const match = TABS.find((t) => {
      const wanted = t.params;
      if (wanted.status && wanted.status !== status) return false;
      if (wanted.type && wanted.type !== type) return false;
      if (wanted.refunds && !refunds) return false;
      // A tab that names nothing only matches when nothing is set.
      if (!Object.keys(wanted).length) {
        return status === "all" && type === "all" && !refunds;
      }
      // A status tab does not claim the screen when a type has been added
      // on top of it, and the other way round.
      if (wanted.status && type !== "all") return false;
      if (wanted.type && status !== "all") return false;
      if (wanted.refunds && (status !== "all" || type !== "all")) return false;
      return true;
    });
    return match?.key ?? "all";
  })();

  const tabs = TABS.map((t) => {
    const change: Record<string, string | undefined> = {};
    // A view sets what it is about and lets go of the rest.
    change.status = t.params.status;
    change.type = t.params.type;
    change.refunds = t.params.refunds;
    return {
      key: t.key,
      label: t.label,
      href: linkWith(change),
      active: t.key === activeTab,
    };
  });

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Returns & Refunds</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          Every return, replacement and refund — where each one stands, and
          what is still to be done.
        </p>
      </header>

      {/* Summary cards — the whole of the returns desk, at a glance. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Total requests"
          value={String(stats.total)}
          hint="Every request ever raised"
          icon={RotateCcw}
        />
        <StatCard
          label="New requests"
          value={String(stats.newRequests)}
          hint="Waiting for a first look"
          icon={Inbox}
          tone={stats.newRequests > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Pending review"
          value={String(stats.pendingReview)}
          hint="Being looked at now"
          icon={Clock}
        />
        <StatCard
          label="Evidence required"
          value={String(stats.evidenceRequired)}
          hint="Waiting on the customer"
          icon={FileWarning}
          tone={stats.evidenceRequired > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Approved replacements"
          value={String(stats.approvedReplacements)}
          hint="Approved, waiting to go out"
          icon={PackageCheck}
        />
        <StatCard
          label="Replacement dispatched"
          value={String(stats.replacementDispatched)}
          hint="On its way to the customer"
          icon={Truck}
        />
        <StatCard
          label="Refund requests"
          value={String(stats.refundRequests)}
          hint="Every refund on a request"
          icon={Wallet}
        />
        <StatCard
          label="Refund approved"
          value={String(stats.refundApproved)}
          hint="Decided, money not yet sent"
          icon={CircleCheck}
        />
        <StatCard
          label="Refund processing"
          value={String(stats.refundProcessing)}
          hint="With the payment provider"
          icon={IndianRupee}
          tone={stats.refundProcessing > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Refund processed"
          value={String(stats.refundProcessed)}
          hint={`${money(stats.totalRefunded)} paid back`}
          icon={CheckCheck}
          tone="good"
        />
        <StatCard
          label="Rejected requests"
          value={String(stats.rejected)}
          hint="Declined, with the reason on file"
          icon={Ban}
        />
        <StatCard
          label="Closed requests"
          value={String(stats.closed)}
          hint="Resolved and finished"
          icon={CircleCheck}
          tone="good"
        />
      </div>

      {/* The records that are kept about refunds and replacements. */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/admin/refunds" className="btn btn-outline btn-sm">
          Refund records
        </Link>
        <Link href="/admin/replacements" className="btn btn-outline btn-sm">
          Replacement records
        </Link>
      </div>

      {/* The views */}
      <div className="mt-6">
        <ReturnTabs tabs={tabs} />
      </div>

      {/* Search, filters and dates */}
      <div className="mt-4 mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search request, order, customer name or email" />
        <PanelFilter
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            ...RETURN_STATUSES.map((s) => ({
              value: s,
              label: RETURN_STATUS_LABEL[s],
            })),
          ]}
        />
        <PanelFilter
          name="type"
          label="Type"
          value={type}
          options={[
            { value: "all", label: "All types" },
            ...RETURN_TYPES.map((t) => ({
              value: t,
              label: RETURN_TYPE_LABEL[t],
            })),
          ]}
        />
        <PanelDateRange from={from} to={to} />
        <PanelFilter
          name="sort"
          label="Order"
          value={sort}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "customer", label: "Customer A–Z" },
            { value: "status", label: "By status" },
          ]}
        />
      </div>

      {/* The table */}
      {returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <RotateCcw className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No requests match
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Try another view, or clear the search and the dates.
          </p>
          <Link href="/admin/returns" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Request ID</th>
                <th className="px-3 py-3 font-semibold">Order ID</th>
                <th className="px-3 py-3 font-semibold">
                  <Link
                    href={sortLink("customer", sort === "customer" ? "newest" : "customer")}
                    className={`inline-flex items-center gap-1 ${sortedBy("customer", "customer")}`}
                  >
                    Customer {sortIcon("customer", "customer")}
                  </Link>
                </th>
                <th className="px-3 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">
                  <Link
                    href={sortLink("date", sort === "newest" ? "oldest" : "newest")}
                    className={`inline-flex items-center gap-1 ${sortedBy("date", "newest")}`}
                  >
                    Request date {sortIcon("date", "newest")}
                  </Link>
                </th>
                <th className="px-3 py-3 font-semibold">
                  <Link
                    href={sortLink("status", sort === "status" ? "newest" : "status")}
                    className={`inline-flex items-center gap-1 ${sortedBy("status", "status")}`}
                  >
                    Status {sortIcon("status", "status")}
                  </Link>
                </th>
                <th className="px-3 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {returns.map((ret) => {
                const items = ret.items;
                const value = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

                return (
                  <tr key={ret.id} className="bg-white hover:bg-gray-50/70">
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/returns/${ret.id}`}
                        className="tnum whitespace-nowrap font-semibold text-brand hover:underline"
                      >
                        {ret.id}
                      </Link>
                      <p className="text-[12px] text-gray-500">
                        {returnReasonLabel(ret.reason)}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/orders/${ret.order_id}`}
                        className="tnum font-medium text-brand hover:underline"
                      >
                        {ret.order_id}
                      </Link>
                    </td>

                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">
                        {ret.customer_name ?? "Customer"}
                      </p>
                      <p className="max-w-[150px] truncate text-[12px] text-gray-500">
                        {ret.customer_email}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <p className="max-w-[150px] truncate font-medium text-ink">
                        {items[0]?.name ?? "—"}
                      </p>
                      <p className="text-[12px] text-gray-500">
                        {items.length > 1
                          ? `+${items.length - 1} more · ${money(value)}`
                          : money(value)}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <span className="whitespace-nowrap font-medium text-ink">
                        {RETURN_TYPE_LABEL[ret.type]}
                      </span>
                      <p className="text-[12px] text-gray-500">
                        {ret.items.reduce((sum, it) => sum + it.quantity, 0)} unit
                        {ret.items.reduce((sum, it) => sum + it.quantity, 0) === 1
                          ? ""
                          : "s"}
                      </p>
                    </td>

                    <td className="px-3 py-3 text-[13px] text-gray-600">
                      {formatDate(ret.created_at)}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                          RETURN_STATUS_TONE[ret.status] ??
                          "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {RETURN_STATUS_LABEL[ret.status]}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/returns/${ret.id}`}
                        className="btn btn-outline btn-xs inline-flex items-center gap-1"
                      >
                        Manage
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex justify-end">
          <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
        </div>
      )}
    </div>
  );
}
