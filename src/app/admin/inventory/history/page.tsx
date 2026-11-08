import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/guard";
import { formatDate } from "@/lib/format";
import { countMovements, listMovements } from "@/lib/inventory";
import { MOVEMENT_LABEL, MOVEMENT_TYPES, MOVEMENT_TONE } from "@/lib/stock";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { Pagination } from "@/components/Pagination";

export const metadata = { title: "Inventory history" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

const PER_PAGE = 40;

/**
 * Every change to a stock level, newest first.
 *
 * What the stock was, what it became, and why it moved — including the
 * movements the orders made on their own.
 */
export default async function AdminInventoryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePermission("inventory.view");
  const sp = await searchParams;

  const q = one(sp.q).trim();
  const typeParam = one(sp.type).trim();
  const type = (MOVEMENT_TYPES as readonly string[]).includes(typeParam)
    ? typeParam
    : "all";
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q: q || undefined,
    type,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const movements = (await listMovements(query));
  const total = (await countMovements({ q: q || undefined, type }));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (type !== "all") p.set("type", type);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/inventory/history${qs ? `?${qs}` : ""}`;
  };

  const from = movements.length ? (page - 1) * PER_PAGE + 1 : 0;
  const to = (page - 1) * PER_PAGE + movements.length;

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Inventory
        </Link>
        <h1 className="mt-2 text-[26px] font-bold text-ink">Inventory history</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          {total === 0
            ? "No changes have been recorded yet."
            : `${total} movement${total === 1 ? "" : "s"} recorded — the stock before, the change, the stock after, and the reason.`}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search product, option, reason or order" />
        <PanelFilter
          name="type"
          label="Kind of change"
          value={type}
          options={[
            { value: "all", label: "Every change" },
            ...MOVEMENT_TYPES.map((t) => ({
              value: t,
              label: MOVEMENT_LABEL[t],
            })),
          ]}
        />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        {movements.length === 0 ? (
          <p className="px-5 py-16 text-center text-[13.5px] text-gray-500">
            Nothing matches those filters.
          </p>
        ) : (
          <>
            <div className="border-b border-gray-200 px-5 py-3 text-[12.5px] text-gray-500">
              Showing {from}–{to} of {total}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-left text-[13.5px]">
                <colgroup>
                  <col className="w-[150px]" />
                  <col className="w-[220px]" />
                  <col className="w-[90px]" />
                  <col className="w-[100px]" />
                  <col className="w-[100px]" />
                  <col className="w-[100px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Option</th>
                    <th className="px-4 py-3 font-semibold">Was</th>
                    <th className="px-4 py-3 font-semibold">Change</th>
                    <th className="px-4 py-3 font-semibold">Now</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {movements.map((m) => (
                    <tr key={m.id} className="bg-white">
                      <td className="px-4 py-3 text-[12.5px] text-gray-500">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {m.product_slug ? (
                          <Link
                            href={`/admin/products/${m.product_slug}`}
                            className="block truncate font-medium text-ink hover:text-brand"
                          >
                            {m.product_name ?? m.product_slug}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-gray-500">
                        {m.variant_name ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="tnum text-gray-500">
                          {m.previous_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`tnum font-semibold ${
                            m.quantity_changed > 0
                              ? "text-green-600"
                              : m.quantity_changed < 0
                                ? "text-red-600"
                                : "text-gray-500"
                          }`}
                        >
                          {m.quantity_changed > 0 ? "+" : ""}
                          {m.quantity_changed}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="tnum font-semibold text-ink">
                          {m.new_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                            MOVEMENT_TONE[m.movement_type] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                        </span>
                        <span className="mt-1 block truncate text-[12px] text-gray-500">
                          {m.reason}
                        </span>
                        {m.note && (
                          <span className="block truncate text-[12px] text-gray-400">
                            {m.note}
                          </span>
                        )}
                        {m.order_id && (
                          <Link
                            href={`/admin/orders/${m.order_id}`}
                            className="tnum block truncate text-[11.5px] text-brand hover:underline"
                          >
                            Order {m.order_id}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
