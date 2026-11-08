import Link from "next/link";
import { Package, AlertTriangle, PackageX, ClipboardCheck, History } from "lucide-react";
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
import { StatCard } from "@/components/admin/StatCard";
import { StockBadge } from "@/components/admin/StockBadge";
import { InventoryAdjustForm } from "@/components/admin/InventoryAdjustForm";
import { StockCheckForm } from "@/components/admin/StockCheckForm";
import { BackorderPolicySelect } from "@/components/admin/BackorderPolicySelect";
import { getBackorderPolicy } from "@/lib/settings";

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
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Inventory</h1>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            What is on the shelf, what is running low, and every change that
            has been made to it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory/history" className="btn btn-outline btn-sm">
            <History className="h-4 w-4" />
            History
          </Link>
          {canManage && (
            <a href="#adjust" className="btn btn-primary btn-sm">
              Adjust stock
            </a>
          )}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="mt-5">
          <InventoryAdjustForm
            products={products}
            productSlug={productSlug}
            variantId={variantId}
          />
        </div>
      )}

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-[15px] font-bold text-ink">Buying what is not there</h2>
        <BackorderPolicySelect policy={backorderPolicy} canManage={canManage} />
      </section>

      {/* Returns waiting to be looked at */}
      {pending.length > 0 && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
          <h2 className="mb-1 text-[15px] font-bold text-ink">
            Returns waiting to be checked
          </h2>
          <p className="mb-4 text-[12.5px] text-gray-600">
            These orders had already left when they were cancelled. The units
            are on their way back, but they are not sellable stock until
            somebody has looked at them.
          </p>

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
        </section>
      )}

      {/* The stock itself */}
      <section className="mt-5 rounded-xl border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <h2 className="text-[15px] font-bold text-ink">Stock levels</h2>
          <span className="tnum text-[12.5px] text-gray-500">
            {buckets.length} line{buckets.length === 1 ? "" : "s"}
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
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
        </div>

        {buckets.length === 0 ? (
          <p className="px-5 py-14 text-center text-[13.5px] text-gray-500">
            Nothing matches those filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-left text-[13.5px]">
              <colgroup>
                <col className="w-[280px]" />
                <col className="w-[170px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Option</th>
                  <th className="px-4 py-3 font-semibold">On hand</th>
                  <th className="px-4 py-3 font-semibold">Low at</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {buckets.map((b) => (
                  <tr key={b.key} className="bg-white">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${b.product_slug}`}
                        className="block truncate font-semibold text-ink hover:text-brand"
                      >
                        {b.product_name}
                      </Link>
                      {b.product_sku && (
                        <span className="tnum block truncate text-[11.5px] text-gray-400">
                          {b.product_sku}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-600">
                      {b.variant_name ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <span className="tnum text-[13px] text-gray-500">
                        {b.threshold}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StockBadge level={b.level} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <a
                          href={`/admin/inventory?product=${encodeURIComponent(
                            b.product_slug
                          )}${
                            b.variant_id
                              ? `&variant=${encodeURIComponent(b.variant_id)}`
                              : ""
                          }#adjust`}
                          className="text-[13px] font-medium text-brand hover:underline"
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
      </section>
    </div>
  );
}
