import Link from "next/link";
import {
  Wallet,
  ArrowRight,
  CheckCheck,
  IndianRupee,
  Clock,
  CircleSlash,
  FileText,
} from "lucide-react";
import {
  countRefunds,
  listRefunds,
  listRefundEvents,
  listRefundLines,
} from "@/lib/returns-records";
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABEL,
  REFUND_STATUS_TONE,
} from "@/lib/return-status";
import { gatewayIsConfigured } from "@/lib/gateway-config";
import { money, formatDate } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { PanelDateRange } from "@/components/admin/PanelDateRange";
import { Pagination } from "@/components/Pagination";

const PER_PAGE = 25;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/**
 * The refund records.
 *
 * Every refund the shop has raised — what was owed, what it was worked
 * out from, and whether the money has actually gone back.
 *
 * It is a view inside Returns & Refunds rather than a page of its own,
 * so that the whole of the returns desk is in one place.
 */
export async function RefundRecordsView({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
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

  // The lines each refund was worked out from, and the history of what
  // happened to it. They are gathered together, before the rows are
  // drawn.
  const details = await Promise.all(
    refunds.map(async (r) => ({
      refund: r,
      lines: await listRefundLines(r.id),
      events: await listRefundEvents(r.id),
    }))
  );

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    p.set("view", "refunds");
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/returns${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Refunds on file"
          value={String(all.length)}
          hint="Every refund that has been raised"
          icon={Wallet}
        />
        <StatCard
          label="Not initiated"
          value={String(count("not_initiated"))}
          hint="Decided on, not yet raised"
          icon={CircleSlash}
        />
        <StatCard
          label="Pending"
          value={String(count("pending"))}
          hint="Raised, waiting to be sent"
          icon={Clock}
          tone={count("pending") > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Processing"
          value={String(count("processing"))}
          hint="With the payment provider"
          icon={IndianRupee}
          tone={count("processing") > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Completed"
          value={String(count("completed"))}
          hint={`${money(paid)} paid back`}
          icon={CheckCheck}
          tone="good"
        />
      </div>

      {/* How a refund is settled. The shop pays it by hand until the
          payment gateway is live, and the panel says which it is. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-[12.5px] text-gray-600">
          {gatewayIsConfigured() ? (
            <>
              The payment gateway is set up, so a refund can be sent
              through it. Where the order carries no gateway reference, it
              is paid by hand and the reference of the payment is recorded.
            </>
          ) : (
            <>
              The payment gateway is not set up on this shop, so every
              refund is paid by hand. An administrator records the reference
              of the payment they made, and that is what marks the refund
              as paid. Nothing is ever shown as refunded without that
              reference.
            </>
          )}
        </p>
      </div>

      <div className="mt-5 mb-5 flex flex-wrap items-center gap-3">
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
        </div>
      ) : (
        <div className="space-y-4">
          {details.map(({ refund: r, lines, events }) => (
            <article
              key={r.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {/* The row itself — every field the refund carries. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-[13.5px]">
                  <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Refund ID</th>
                      <th className="px-3 py-3 font-semibold">Order ID</th>
                      <th className="px-3 py-3 font-semibold">Request ID</th>
                      <th className="px-3 py-3 font-semibold">Customer</th>
                      <th className="px-3 py-3 font-semibold">
                        Original Payment Method
                      </th>
                      <th className="px-3 py-3 font-semibold">Refund Amount</th>
                      <th className="px-3 py-3 font-semibold">Refund Status</th>
                      <th className="px-3 py-3 font-semibold">Refund Date</th>
                      <th className="px-3 py-3 font-semibold">
                        Transaction / Gateway Reference
                      </th>
                      <th className="px-3 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="bg-white hover:bg-gray-50/70">
                      <td className="px-3 py-3">
                        <p className="tnum font-semibold text-ink">{r.id}</p>
                        <p className="text-[12px] text-gray-500">
                          {r.settled_by === "gateway"
                            ? "Sent to the gateway"
                            : r.settled_by === "manual"
                              ? "Paid by hand"
                              : "Not sent yet"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/orders/${r.order_id}`}
                          className="tnum font-medium text-brand hover:underline"
                        >
                          {r.order_id}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/returns/${r.return_id}`}
                          className="tnum font-medium text-brand hover:underline"
                        >
                          {r.return_id}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink">
                          {r.customer_name ?? "Customer"}
                        </p>
                        <p className="max-w-[170px] truncate text-[12px] text-gray-500">
                          {r.customer_email}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-gray-600">
                        {r.original_payment_method ?? r.payment_method ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <p className="tnum font-semibold text-ink">
                          {money(r.amount)}
                        </p>
                        {r.calculated_amount !== null &&
                          r.calculated_amount !== r.amount && (
                            <p className="tnum text-[12px] text-gray-500">
                              of {money(r.calculated_amount)} paid
                            </p>
                          )}
                        {r.quantity !== null && (
                          <p className="text-[12px] text-gray-500">
                            {r.quantity} unit{r.quantity === 1 ? "" : "s"}
                          </p>
                        )}
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
                      <td className="px-3 py-3 text-[12.5px] text-gray-600">
                        <p>{formatDate(r.created_at)}</p>
                        {r.completed_at && (
                          <p className="text-[11.5px] text-gray-400">
                            Paid {formatDate(r.completed_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="tnum max-w-[190px] truncate text-[12.5px] text-gray-600">
                          {r.gateway_transaction_id ?? r.gateway_refund_id ?? "—"}
                        </p>
                        {r.confirmed_by_name && (
                          <p className="text-[11.5px] text-gray-400">
                            Confirmed by {r.confirmed_by_name}
                          </p>
                        )}
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
                  </tbody>
                </table>
              </div>

              {/* What the refund was worked out from, and what happened
                  to it. */}
              {(lines.length > 0 || events.length > 0) && (
                <div className="grid gap-5 border-t border-gray-100 bg-gray-50/50 px-4 py-4 lg:grid-cols-2">
                  {lines.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                        <FileText className="h-3.5 w-3.5 text-brand" />
                        Worked out from the order
                      </h3>
                      <ul className="mt-2 space-y-1">
                        {lines.map((l) => (
                          <li
                            key={l.id}
                            className="flex items-baseline justify-between gap-3 text-[12.5px]"
                          >
                            <span className="text-gray-700">
                              {l.name}
                              <span className="text-gray-400">
                                {" · "}
                                {l.quantity} × {money(l.unit_price)}
                              </span>
                            </span>
                            <span className="tnum shrink-0 font-medium text-ink">
                              {money(l.line_amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11.5px] text-gray-500">
                        The price each unit was bought at — never the price on
                        the shelf today.
                      </p>
                    </div>
                  )}

                  {events.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                        <Clock className="h-3.5 w-3.5 text-brand" />
                        Refund history
                      </h3>
                      <ol className="mt-2 space-y-1.5">
                        {events.map((e) => (
                          <li key={e.id} className="text-[12.5px]">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium text-ink">
                                {REFUND_STATUS_LABEL[
                                  e.status as keyof typeof REFUND_STATUS_LABEL
                                ] ?? e.status}
                              </span>
                              <span className="shrink-0 text-[11.5px] text-gray-400">
                                {formatDate(e.created_at)}
                              </span>
                            </div>
                            {e.note && <p className="text-gray-600">{e.note}</p>}
                            {e.reference && (
                              <p className="tnum text-[11.5px] text-gray-400">
                                Reference: {e.reference}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400">
                              By {e.actor_name ?? "the shop"}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
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
