import Link from "next/link";
import { requirePermission } from "@/lib/guard";
import { formatDate } from "@/lib/format";
import { countMovements, listMovements } from "@/lib/inventory";
import { MOVEMENT_LABEL, MOVEMENT_TYPES } from "@/lib/stock";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { Pagination } from "@/components/admin/ui/Pagination";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { Badge } from "@/components/admin/ui/Badge";
import { MOVEMENT_TONE } from "@/lib/status-tone";

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
    <>
      <PageHeader
        back={{ href: "/admin/inventory", label: "Inventory" }}
        eyebrow="Operations"
        title="Inventory history"
        description={
          total === 0
            ? "No changes have been recorded yet."
            : `${total} movement${total === 1 ? "" : "s"} recorded — the stock before, the change, the stock after, and the reason.`
        }
      />

      <div className="admin-toolbar">
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

      <Panel bodyClass="admin-panel-body--flush">
        {movements.length === 0 ? (
          <p className="px-5 py-16 text-center text-[13.5px] text-gray-500">
            Nothing matches those filters.
          </p>
        ) : (
          <div className="admin-table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="admin-table admin-table--fixed" style={{ minWidth: 980 }}>
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Option</th>
                  <th className="admin-th-num">Was</th>
                  <th className="admin-th-num">Change</th>
                  <th className="admin-th-num">Now</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="text-[12.5px] text-gray-500">
                      {formatDate(m.created_at)}
                    </td>
                    <td>
                      {m.product_slug ? (
                        <Link
                          href={`/admin/products/${m.product_slug}`}
                          className="admin-cell-title hover:text-brand"
                        >
                          {m.product_name ?? m.product_slug}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-[12.5px] text-gray-500">
                      {m.variant_name ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="admin-td-num text-gray-500">
                      {m.previous_stock}
                    </td>
                    <td className="admin-td-num">
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
                    <td className="admin-td-num font-semibold text-ink">
                      {m.new_stock}
                    </td>
                    <td>
                      <Badge tone={MOVEMENT_TONE[m.movement_type] ?? "neutral"}>
                        {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                      </Badge>
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
        )}
      </Panel>

      <div className="admin-table-foot">
        <span className="tnum">
          Showing {from}–{to} of {total}
        </span>
        <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
      </div>
    </>
  );
}
