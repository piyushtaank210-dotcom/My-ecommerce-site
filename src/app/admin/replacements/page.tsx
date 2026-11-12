import Link from "next/link";
import { Truck, ArrowRight, PackageCheck, Package } from "lucide-react";
import { requirePermission } from "@/lib/guard";
import { countReplacements, listReplacements } from "@/lib/returns-records";
import {
  REPLACEMENT_STATUSES,
  REPLACEMENT_STATUS_LABEL,
} from "@/lib/return-status";
import { formatDate } from "@/lib/format";
import { StatCard } from "@/components/admin/StatCard";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { PanelDateRange } from "@/components/admin/PanelDateRange";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Replacement records" };

const PER_PAGE = 25;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function AdminReplacementsPage({
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

  const replacements = await listReplacements(query);
  const total = await countReplacements(query);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const all = await listReplacements({ limit: 100 });
  const count = (s: string) => all.filter((r) => r.delivery_status === s).length;

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/replacements${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Replacement records</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          Every replacement and every set of missing accessories that has
          gone out — what was sent, with which courier, and where it has
          got to.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Shipments on file"
          value={String(all.length)}
          hint="Every replacement and accessory parcel"
          icon={Truck}
        />
        <StatCard
          label="Dispatched"
          value={String(count("dispatched"))}
          hint="Left the warehouse"
          icon={Package}
        />
        <StatCard
          label="Delivered"
          value={String(count("delivered"))}
          hint="Arrived with the customer"
          icon={PackageCheck}
          tone="good"
        />
        <StatCard
          label="Returned to us"
          value={String(count("returned"))}
          hint="Came back"
          icon={Package}
        />
      </div>

      <div className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search shipment, request, order, customer or tracking" />
        <PanelFilter
          name="status"
          label="Delivery status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            ...REPLACEMENT_STATUSES.map((s) => ({
              value: s,
              label: REPLACEMENT_STATUS_LABEL[s],
            })),
          ]}
        />
        <PanelDateRange from={from} to={to} />
      </div>

      {replacements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <Truck className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No replacements match
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Try another search, or clear the filters.
          </p>
          <Link href="/admin/replacements" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Shipment</th>
                <th className="px-3 py-3 font-semibold">Request / Order</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Serial numbers</th>
                <th className="px-3 py-3 font-semibold">Courier</th>
                <th className="px-3 py-3 font-semibold">Tracking</th>
                <th className="px-3 py-3 font-semibold">Dispatched</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {replacements.map((r) => (
                <tr key={r.id} className="bg-white hover:bg-gray-50/70">
                  <td className="px-3 py-3">
                    <p className="tnum font-semibold text-ink">{r.id}</p>
                    <p className="text-[12px] text-gray-500">
                      {r.kind === "accessories" ? "Missing accessories" : "Replacement"}
                    </p>
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
                  <td className="px-3 py-3">
                    <p className="max-w-[160px] truncate text-ink">
                      {r.product_slug ?? "—"}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      {r.quantity} unit{r.quantity === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="tnum text-[12.5px] text-gray-600">
                      Came in: {r.original_serial ?? "—"}
                    </p>
                    <p className="tnum text-[12.5px] text-gray-600">
                      Going out: {r.replacement_serial ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[13px] text-gray-600">
                    {r.courier_name ?? "—"}
                  </td>
                  <td className="tnum px-3 py-3 text-[12.5px] text-gray-600">
                    {r.tracking_number ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-gray-600">
                    {r.dispatch_date ? formatDate(r.dispatch_date) : "—"}
                    {r.delivered_at && (
                      <p className="text-[11.5px] text-gray-400">
                        Delivered {formatDate(r.delivered_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-block whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-gray-700">
                      {REPLACEMENT_STATUS_LABEL[r.delivery_status] ??
                        r.delivery_status}
                    </span>
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
