import Link from "next/link";
import { Wallet, ArrowRight, CheckCheck, IndianRupee, Clock, Ban } from "lucide-react";
import { requirePermission } from "@/lib/guard";
import {
  countRefunds,
  listRefunds,
} from "@/lib/returns-records";
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABEL,
  REFUND_STATUS_TONE,
} from "@/lib/return-status";
import { money, formatDate } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { PanelDateRange } from "@/components/admin/PanelDateRange";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Refund records" };

const PER_PAGE = 25;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermission("returns.view");
  const sp = await searchParams;

  const q = one(sp.q).trim() || undefined;
  const status = one(sp.status) || "all";
  const from = one(sp.from).trim() || undefined;
  const to = one(sp.to).trim() || undefined;
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    status: status === "all" ? undefined : status,
    from,
    to,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const refunds = await listRefunds(query);
  const total = await countRefunds(query);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // The counters, drawn from the records themselves.
  const all = await listRefunds({ limit: 100 });
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const paid = all
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.amount, 0);

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/refunds${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Refund records</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          Every refund that has been approved, and what became of it. A
          refund is only shown as completed once the payment has actually
          been confirmed.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Refunds on file"
          value={String(all.length)}
          hint="Every refund that has been raised"
          icon={Wallet}
        />
        <StatCard
          label="Approved"
          value={String(count("approved"))}
          hint="Decided, money not yet sent"
          icon={Clock}
        />
        <StatCard
          label="Processing"
          value={String(count("processing"))}
          hint="With the payment provider"
          icon={IndianRupee}
        />
        <StatCard
          label="Completed"
          value={String(count("completed"))}
          hint={`${money(paid)} paid back`}
          icon={CheckCheck}
          tone="good"
        />
        <StatCard
          label="Failed"
          value={String(count("failed"))}
          hint="Did not go through"
          icon={Ban}
          tone={count("failed") > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search refund, request, order, customer or transaction" />
        <PanelFilter
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            ...REFUND_STATUSES.map((s) => ({
              value: s,
              label: REFUND_STATUS_LABEL[s],
            })),
          ]}
        />
        <PanelDateRange from={from} to={to} />
      </div>

      {refunds.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <Wallet className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No refunds match
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Try another search, or clear the filters.
          </p>
          <Link href="/admin/refunds" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Refund ID</th>
                <th className="px-3 py-3 font-semibold">Request / Order</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Method</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Transaction</th>
                <th className="px-3 py-3 font-semibold">Approved</th>
                <th className="px-3 py-3 font-semibold">Completed</th>
                <th className="px-3 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {refunds.map((r) => (
                <tr key={r.id} className="bg-white hover:bg-gray-50/70">
                  <td className="px-3 py-3">
                    <p className="tnum font-semibold text-ink">{r.id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/returns/${r.return_id}`}
                      className="tnum font-medium text-brand hover:underline"
                    >
                      {r.return_id}
                    </Link>
                    <p className="tnum text-[12px] text-gray-500">{r.order_id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-ink">
                      {r.customer_name ?? "Customer"}
                    </p>
                    <p className="max-w-[160px] truncate text-[12px] text-gray-500">
                      {r.customer_email}
                    </p>
                  </td>
                  <td className="tnum px-3 py-3 font-semibold text-ink">
                    {money(r.amount)}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-gray-600">
                    {r.payment_method ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                        REFUND_STATUS_TONE[r.status] ??
                        "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      {REFUND_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.failed_reason && (
                      <p className="mt-1 max-w-[220px] text-[12px] text-red-600">
                        {r.failed_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="tnum max-w-[160px] truncate text-[12.5px] text-gray-600">
                      {r.gateway_transaction_id ?? "—"}
                    </p>
                    {r.initiated_at && (
                      <p className="text-[11.5px] text-gray-400">
                        Sent {formatDate(r.initiated_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-gray-600">
                    <p>{r.approved_by_name ?? "—"}</p>
                    <p className="text-[11.5px] text-gray-400">
                      {formatDate(r.approved_at)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-gray-600">
                    {r.completed_at ? formatDate(r.completed_at) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/returns/${r.return_id}`}
                      className="btn btn-outline btn-xs inline-flex items-center gap-1"
                    >
                      Manage
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
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
