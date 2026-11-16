import Link from "next/link";
import {
  Package,
  AlertTriangle,
  PackageX,
  ClipboardCheck,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import {
  inventorySummary,
  listStockBuckets,
  pendingStockChecks,
} from "@/lib/inventory";
import { listAdminProducts } from "@/lib/admin";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { StatCard } from "@/components/admin/ui/StatCard";
import { StockBadge } from "@/components/admin/StockBadge";
import { InventoryAdjustForm } from "@/components/admin/InventoryAdjustForm";
import { StockCheckForm } from "@/components/admin/StockCheckForm";
import { BackorderPolicySelect } from "@/components/admin/BackorderPolicySelect";
import { getBackorderPolicy } from "@/lib/settings";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";

export const metadata = { title: "Inventory" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/**
 * The stock, and where it stands.
 *
 * A product with options is stocked by its options, so each option is its
 * own line here with its own count and its own low-stock threshold. A
 * product without them is one line of its own.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("inventory.view");
  const canManage = can(user.role, "inventory.manage");
  const sp = await searchParams;

  const q = one(sp.q).trim();
  const levelParam = one(sp.level).trim();
  const level = ["in", "low", "out"].includes(levelParam) ? levelParam : "all";
  const productSlug = one(sp.product).trim() || undefined;
  const variantId = one(sp.variant).trim() || undefined;

  const summary = (await inventorySummary());
  const buckets = (await listStockBuckets({ q: q || undefined, level }));
  const pending = (await pendingStockChecks());
  const backorderPolicy = (await getBackorderPolicy());
  const products = (await listAdminProducts()).map((p) => ({
    slug: p.slug,
    name: p.name,
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      stock: v.stock,
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="What is on the shelf, what is running low, and every change that has been made to it."
        actions={
          <>
            <Link href="/admin/inventory/history" className="btn btn-outline btn-sm">
              <History className="h-4 w-4" />
              History
            </Link>
            {canManage && (
              <a href="#adjust" className="btn btn-primary btn-sm">
                <SlidersHorizontal className="h-4 w-4" />
                Adjust stock
              </a>
            )}
          </>
        }
      />

      <div className="admin-stat-row">
        <StatCard
          label="Units on hand"
          value={String(summary.units)}
          hint={`Across ${summary.buckets} stock ${summary.buckets === 1 ? "line" : "lines"}`}
          icon={Package}
        />
        <StatCard
          label="Low stock"
          value={String(summary.low)}
          hint="At or below the threshold"
          icon={AlertTriangle}
          tone={summary.low > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Out of stock"
          value={String(summary.out)}
          hint="Nothing left to sell"
          icon={PackageX}
          tone={summary.out > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Awaiting a check"
          value={String(summary.pendingChecks)}
          hint="Returns not yet looked at"
          icon={ClipboardCheck}
          tone={summary.pendingChecks > 0 ? "warn" : "good"}
        />
      </div>

      {canManage && (
        <div className="admin-section">
          <InventoryAdjustForm
            products={products}
            productSlug={productSlug}
            variantId={variantId}
          />
        </div>
      )}

      <div className="admin-section">
        <Panel
          title="Buying what is not there"
          description="Whether a shopper may order something the shelf does not have."
        >
          <BackorderPolicySelect policy={backorderPolicy} canManage={canManage} />
        </Panel>
      </div>

      {/* Returns waiting to be looked at */}
      {pending.length > 0 && (
        <div className="admin-section">
          <Panel
            tone="warn"
            title="Returns waiting to be checked"
            description="These orders had already left when they were cancelled. The units are on their way back, but they are not sellable stock until somebody has looked at them."
          >
            <ul className="space-y-3">
              {pending.map((p) => (
                <li
                  key={`${p.order_id}-${p.line_id}`}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink">
                        {p.product_name}
                        {p.variant_name && (
                          <span className="font-normal text-gray-500">
                            {" "}
                            · {p.variant_name}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-gray-500">
                        <Link
                          href={`/admin/orders/${p.order_id}`}
                          className="tnum font-medium text-brand hover:underline"
                        >
                          Order {p.order_id}
                        </Link>
                        {" · "}
                        {p.quantity} unit{p.quantity === 1 ? "" : "s"} ·{" "}
                        {p.customer} · {formatDate(p.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <StockCheckForm orderId={p.order_id} canManage={canManage} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {/* The stock itself */}
      <div className="admin-section">
        <Panel
          title="Stock levels"
          description={`${buckets.length} stock ${buckets.length === 1 ? "line" : "lines"}.`}
          bodyClass="admin-panel-body--flush"
          toolbar={
            <>
              <PanelSearch placeholder="Search product or option" />
              <PanelFilter
                name="level"
                label="Stock level"
                value={level}
                options={[
                  { value: "all", label: "Any level" },
                  { value: "low", label: "Low stock" },
                  { value: "out", label: "Out of stock" },
                  { value: "in", label: "In stock" },
                ]}
              />
            </>
          }
        >
          {buckets.length === 0 ? (
            <p className="px-5 py-14 text-center text-[13.5px] text-gray-500">
              Nothing matches those filters.
            </p>
          ) : (
            <div className="admin-table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="admin-table admin-table--fixed" style={{ minWidth: 880 }}>
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[17%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Option</th>
                    <th className="admin-th-num">On hand</th>
                    <th className="admin-th-num">Low at</th>
                    <th>Status</th>
                    <th className="admin-th-num">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key}>
                      <td>
                        <Link
                          href={`/admin/products/${b.product_slug}`}
                          className="admin-cell-title hover:text-brand"
                        >
                          {b.product_name}
                        </Link>
                        {b.product_sku && (
                          <span className="admin-cell-sub tnum">{b.product_sku}</span>
                        )}
                      </td>
                      <td className="text-[13px] text-gray-600">
                        {b.variant_name ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="admin-td-num">
                        <span
                          className={`tnum text-[14px] font-semibold ${
                            b.level === "out"
                              ? "text-red-600"
                              : b.level === "low"
                                ? "text-amber-600"
                                : "text-ink"
                          }`}
                        >
                          {b.stock}
                        </span>
                      </td>
                      <td className="admin-td-num text-[13px] text-gray-500">
                        {b.threshold}
                      </td>
                      <td>
                        <StockBadge level={b.level} />
                      </td>
                      <td className="admin-td-actions">
                        {canManage && (
                          <a
                            href={`/admin/inventory?product=${encodeURIComponent(
                              b.product_slug
                            )}${
                              b.variant_id
                                ? `&variant=${encodeURIComponent(b.variant_id)}`
                                : ""
                            }#adjust`}
                            className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand-tint"
                          >
                            Adjust
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
