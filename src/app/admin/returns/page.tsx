import Link from "next/link";
import { RotateCcw, Clock, Truck, ClipboardCheck, CheckCircle2, IndianRupee, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/guard";
import {
  listReturnRequests,
  countReturnRequests,
  getReturnSummaryStats,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_TYPE_LABEL,
  RETURN_STATUSES,
  RETURN_TYPES,
  returnReasonLabel,
} from "@/lib/returns";
import { money, formatDate } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Returns & Refunds" };

const PER_PAGE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

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
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const returns = listReturnRequests(query);
  const total = countReturnRequests(query);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const stats = getReturnSummaryStats();

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (type !== "all") p.set("type", type);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/returns${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Returns & Refunds</h1>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            Manage customer return claims, reverse pickups, quality checks, and refund settlements.
          </p>
        </div>
      </header>

      {/* KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Pending review"
          value={String(stats.requested)}
          hint="Needs staff approval"
          icon={Clock}
          tone={stats.requested > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Awaiting pickup"
          value={String(stats.approved + stats.pickupScheduled)}
          hint="Approved & scheduled"
          icon={Truck}
        />
        <StatCard
          label="In inspection (QC)"
          value={String(stats.received)}
          hint="Received at warehouse"
          icon={ClipboardCheck}
        />
        <StatCard
          label="Completed"
          value={String(stats.completed)}
          hint="Settled or replaced"
          icon={CheckCircle2}
          tone="good"
        />
        <StatCard
          label="Total refunded"
          value={money(stats.totalRefunded)}
          hint="Settled to customers"
          icon={IndianRupee}
          tone="good"
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search return ID, order ID, customer name or email" />
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
      </div>

      {/* Data Table */}
      {returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <RotateCcw className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No return requests match
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Try adjusting your search query or status filter.
          </p>
          <Link href="/admin/returns" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[950px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Return ID</th>
                <th className="px-4 py-3 font-semibold">Order & Customer</th>
                <th className="px-4 py-3 font-semibold">Type & Reason</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Refund / Value</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {returns.map((ret) => {
                const totalItemQty = ret.items.reduce((sum, it) => sum + it.quantity, 0);
                const valueEst = ret.items.reduce(
                  (sum, it) => sum + it.price * it.quantity,
                  0
                );

                return (
                  <tr key={ret.id} className="bg-white hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/returns/${ret.id}`}
                        className="tnum font-semibold text-brand hover:underline"
                      >
                        {ret.id}
                      </Link>
                      <p className="text-[12px] text-gray-500">
                        {formatDate(ret.created_at)}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{ret.customer_name ?? "Customer"}</p>
                      <p className="text-[12px] text-gray-500">
                        <Link
                          href={`/admin/orders/${ret.order_id}`}
                          className="text-brand hover:underline"
                        >
                          Order {ret.order_id}
                        </Link>
                        {" · "}
                        {ret.customer_email}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">
                        {RETURN_TYPE_LABEL[ret.type]}
                      </span>
                      <p className="text-[12px] text-gray-500">
                        {returnReasonLabel(ret.reason)}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="tnum font-medium text-ink">
                        {totalItemQty} unit{totalItemQty === 1 ? "" : "s"}
                      </span>
                      <p className="truncate max-w-[180px] text-[12px] text-gray-500">
                        {ret.items.map((i) => i.name).join(", ")}
                      </p>
                    </td>

                    <td className="tnum px-4 py-3 font-semibold text-ink">
                      {ret.type === "return" ? money(ret.refund_amount || valueEst) : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold capitalize ${
                          RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {RETURN_STATUS_LABEL[ret.status]}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
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
