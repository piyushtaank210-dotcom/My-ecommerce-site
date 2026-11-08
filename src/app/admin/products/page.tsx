import Link from "next/link";
import { Plus, PackageSearch } from "lucide-react";
import {
  catalogueFacets,
  countProducts,
  getBrands,
  getCategories,
  hasSalesData,
} from "@/lib/queries";
import { catalogueQuery, listAdminProducts } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { discountPct, money } from "@/lib/format";
import { effectiveStock, productStockLevel, stockLevel } from "@/lib/stock";
import type { SortKey } from "@/lib/types";
import { Pagination } from "@/components/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { ProductListingToggle } from "@/components/admin/ProductListingToggle";
import { ProductRowActions } from "@/components/admin/ProductRowActions";
import { ProductStatusSelect } from "@/components/admin/ProductStatusSelect";
import {
  BulkCheckbox,
  BulkProvider,
  BulkSelectAll,
  BulkToolbar,
  SelectAllMatching,
} from "@/components/admin/ProductBulk";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABEL } from "@/lib/product-status";

export const metadata = { title: "Catalogue" };

const PER_PAGE = 20;

/** The orderings the catalogue can be listed in. */
const SORTS: { value: SortKey; label: string }[] = [
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "newest", label: "Newest first" },
];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("catalog.view");
  const sp = await searchParams;
  const canManage = can(user.role, "catalog.manage");
  const isAdmin = user.role === "admin";

  const q = one(sp.q).trim() || undefined;
  const categoryParam = one(sp.category).trim();
  const brandParam = one(sp.brand).trim();
  const stockParam = one(sp.stock).trim();
  const listingParam = one(sp.listed).trim();
  const statusParam = one(sp.status).trim();
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const categories = (await getCategories());
  const categorySlugs = new Set(categories.map((c) => c.slug));

  // A filter that the catalogue does not know is ignored rather than
  // quietly emptying the list, so the dropdown and the rows always agree.
  const category = categorySlugs.has(categoryParam) ? categoryParam : undefined;
  const brand = brandParam || undefined;
  const stock = ["in", "low", "out"].includes(stockParam) ? stockParam : "all";
  const listing = ["true", "false"].includes(listingParam) ? listingParam : "all";
  const status = (PRODUCT_STATUSES as readonly string[]).includes(statusParam)
    ? statusParam
    : "all";

  // Best selling only means something once something has sold.
  const canSortBySales = (await hasSalesData());

  // The sort key goes into an ORDER BY, so it is checked against the list
  // of known keys rather than passed through — and against the very list
  // the dropdown offers, so a link cannot leave the dropdown blank.
  const SORT_KEYS = [
    "price-asc",
    "price-desc",
    "newest",
    ...(canSortBySales ? ["best-selling"] : []),
  ];
  const sortParam = one(sp.sort);
  const sort = (SORT_KEYS as string[]).includes(sortParam)
    ? (sortParam as SortKey)
    : undefined;

  // The brands on offer follow the category, so the dropdown never offers a
  // brand that cannot be in the list. The brand already chosen stays on it
  // even when the category rules it out, or the filter would vanish
  // without saying why.
  const brandsInCategory = (await getBrands(category, { includeUnlisted: true }));
  const brands =
    brand && !brandsInCategory.includes(brand)
      ? [...brandsInCategory, brand]
      : brandsInCategory;

  // The filters, in one place. The listing, the counts and a bulk action
  // over "everything matching" all read them from here.
  const filters = { q, category, brand, stock, status, listed: listing };
  const query = catalogueQuery(filters);

  // The back office sees the whole catalogue — drafts, archived products and
  // delisted ones — and narrows it with the filters below. The shop only
  // ever sees the published, un-delisted ones.
  //
  // The four are asked for together: the database is a long way off, and
  // asking one at a time makes the page as slow as the sum of them.
  const [products, total, catalogueTotal, facets] = await Promise.all([
    listAdminProducts({
      ...query,
      sort,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    countProducts(query),
    countProducts({ includeUnlisted: true }),
    // How many products each filter would leave, so the numbers beside the
    // dropdowns are the real ones rather than a guess.
    catalogueFacets(query),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const isFiltered =
    Boolean(q || category || brand) ||
    stock !== "all" ||
    status !== "all" ||
    listing !== "all";

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (brand) p.set("brand", brand);
    if (stock !== "all") p.set("stock", stock);
    if (listing !== "all") p.set("listed", listing);
    if (status !== "all") p.set("status", status);
    if (sort) p.set("sort", sort);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/products${qs ? `?${qs}` : ""}`;
  };

  const from = products.length ? (page - 1) * PER_PAGE + 1 : 0;
  const to = (page - 1) * PER_PAGE + products.length;

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-ink">Catalogue</h1>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            {isFiltered ? (
              <>
                <span className="tnum font-medium text-ink">
                  {total} of {catalogueTotal}
                </span>{" "}
                products match
              </>
            ) : (
              <>
                <span className="tnum font-medium text-ink">{catalogueTotal}</span>{" "}
                product{catalogueTotal === 1 ? "" : "s"}
              </>
            )}
            {" — drafts and archived ones stay here, off the shop floor."}
          </p>
        </div>
        {canManage && (
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" />
            Add product
          </Link>
        )}
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search name, brand or SKU" />
        <PanelFilter
          name="category"
          label="Category"
          value={category ?? "all"}
          options={[
            { value: "all", label: `All categories (${facets.category.total})` },
            ...categories.map((c) => ({
              value: c.slug,
              label: `${c.name} (${facets.category.counts[c.slug] ?? 0})`,
            })),
          ]}
        />
        <PanelFilter
          name="brand"
          label="Brand"
          value={brand ?? "all"}
          options={[
            { value: "all", label: `All brands (${facets.brand.total})` },
            ...brands.map((b) => ({
              value: b,
              label: `${b} (${facets.brand.counts[b] ?? 0})`,
            })),
          ]}
        />
        <PanelFilter
          name="stock"
          label="Stock"
          value={stock}
          options={[
            { value: "all", label: `Any stock (${facets.stock.total})` },
            { value: "in", label: `In stock (${facets.stock.counts.in})` },
            { value: "low", label: `Low stock (${facets.stock.counts.low})` },
            { value: "out", label: `Out of stock (${facets.stock.counts.out})` },
          ]}
        />
        <PanelFilter
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: `Any status (${facets.status.total})` },
            ...PRODUCT_STATUSES.map((s) => ({
              value: s,
              label: `${PRODUCT_STATUS_LABEL[s]} (${facets.status.counts[s] ?? 0})`,
            })),
          ]}
        />
        <PanelFilter
          name="listed"
          label="Listing"
          value={listing}
          options={[
            { value: "all", label: `Listed and delisted (${facets.listed.total})` },
            { value: "true", label: `Listed only (${facets.listed.counts.listed})` },
            { value: "false", label: `Delisted only (${facets.listed.counts.delisted})` },
          ]}
        />
        <PanelFilter
          name="sort"
          label="Sort"
          value={sort ?? "all"}
          options={[
            { value: "all", label: "Default order" },
            ...SORTS.map((s) => ({ value: s.value as string, label: s.label })),
            // Best selling only means something once something has sold.
            ...(canSortBySales
              ? [{ value: "best-selling", label: "Best selling" }]
              : []),
          ]}
        />
      </div>

      {products.length === 0 ? (
        total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
            <PackageSearch className="h-9 w-9 text-gray-300" />
            <h2 className="mt-4 text-[16px] font-semibold text-ink">
              Nothing matches those filters
            </h2>
            <p className="mt-1.5 text-[13px] text-gray-500">
              The catalogue holds {catalogueTotal} product
              {catalogueTotal === 1 ? "" : "s"} in all.
            </p>
            <Link href="/admin/products" className="btn btn-outline btn-sm mt-5">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
            <PackageSearch className="h-9 w-9 text-gray-300" />
            <h2 className="mt-4 text-[16px] font-semibold text-ink">
              That page is past the end of the list
            </h2>
            <p className="mt-1.5 text-[13px] text-gray-500">
              There {total === 1 ? "is" : "are"} {total} product
              {total === 1 ? "" : "s"} to show, on {totalPages} page
              {totalPages === 1 ? "" : "s"}.
            </p>
            <Link href={pageLink(1)} className="btn btn-outline btn-sm mt-5">
              Back to the first page
            </Link>
          </div>
        )
      ) : (
        <BulkProvider
          slugs={products.map((p) => p.slug)}
          matchingTotal={total}
          filters={filters}
        >
          {canManage && <BulkToolbar />}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-gray-500">
            <span className="tnum">
              Showing {from}–{to} of {total} product{total === 1 ? "" : "s"}
            </span>
            {canManage && <SelectAllMatching />}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full table-fixed min-w-[1110px] text-left text-[13.5px]">
              {/* Fixed widths so the table fits a normal screen without the
                  middle columns being pushed under the actions. */}
              <colgroup>
                {canManage && <col className="w-9" />}
                <col className="w-[240px]" />
                <col className="w-[170px]" />
                <col className="w-[125px]" />
                <col className="w-[104px]" />
                <col className="w-[115px]" />
                <col className="w-[150px]" />
                <col className="w-[165px]" />
              </colgroup>
              <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
                <tr>
                  {canManage && (
                    <th className="w-10 px-2 py-3">
                      <BulkSelectAll />
                    </th>
                  )}
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Variants</th>
                  <th className="sticky right-0 border-l border-gray-200 bg-gray-50 px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => {
                  const off = discountPct(p.mrp, p.price);
                  // A product with options sells through them, so the
                  // stock that matters is the options' added up.
                  const units = effectiveStock(p);
                  const level = productStockLevel(p);
                  return (
                    <tr key={p.slug} className="bg-white">
                      {canManage && (
                        <td className="px-2 py-3">
                          <BulkCheckbox slug={p.slug} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-50">
                            {p.image && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={p.image}
                                alt=""
                                className="h-full w-full object-contain p-1"
                              />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span
                              title={p.name}
                              className="block truncate font-semibold text-ink"
                            >
                              {p.name}
                            </span>
                            <span className="block truncate text-[12px] text-gray-500">
                              {p.brand ?? "—"} · {p.category_slug ?? "uncategorised"}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={p.sku ?? undefined}
                          className="tnum block truncate text-[11.5px] text-gray-600"
                        >
                          {p.sku ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="tnum block font-semibold text-ink">
                          {money(p.price)}
                        </span>
                        {p.mrp > p.price && (
                          <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
                            <span className="price-strike tnum">
                              {money(p.mrp)}
                            </span>
                            <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700">
                              {off}% off
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={
                            p.variants.length
                              ? `${units} sellable across ${p.variants.length} variant${p.variants.length === 1 ? "" : "s"}. The product's own stock is ${p.stock}.`
                              : undefined
                          }
                          className={`tnum block font-semibold ${
                            level === "out"
                              ? "text-red-600"
                              : level === "low"
                                ? "text-amber-600"
                                : "text-ink"
                          }`}
                        >
                          {units}
                        </span>
                        {p.variants.length > 0 && (
                          <span className="mt-0.5 block text-[11px] text-gray-400">
                            in {p.variants.length} variant
                            {p.variants.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* Both halves of the visibility rule live together:
                            a product is on sale when it is published *and*
                            still listed. */}
                        {canManage ? (
                          <div className="flex flex-col items-start gap-1.5">
                            <ProductStatusSelect
                              slug={p.slug}
                              status={p.status}
                            />
                            <ProductListingToggle
                              slug={p.slug}
                              listed={p.listed}
                            />
                          </div>
                        ) : (
                          <span className="text-[12px] font-semibold text-gray-600">
                            {PRODUCT_STATUS_LABEL[p.status]}
                            {p.listed ? " · Listed" : " · Delisted"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-gray-500">
                        {p.variants.length === 0 ? (
                          "—"
                        ) : (
                          <ul className="space-y-1.5">
                            {p.variants.map((v) => {
                              const vLevel = stockLevel(v.stock, v.low_stock_threshold);
                              return (
                                <li key={v.id}>
                                  <span className="block truncate font-medium text-gray-600">
                                    {v.name}
                                  </span>
                                  <span className="tnum block whitespace-nowrap">
                                    {money(v.price)} ·{" "}
                                    <span
                                      className={
                                        vLevel === "out"
                                          ? "font-semibold text-red-600"
                                          : vLevel === "low"
                                            ? "font-semibold text-amber-600"
                                            : "text-gray-500"
                                      }
                                    >
                                      {v.stock} in stock
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="sticky right-0 border-l border-gray-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {canManage && (
                            <Link
                              href={`/admin/products/${p.slug}`}
                              className="text-[13px] font-medium text-brand hover:underline"
                            >
                              Edit
                            </Link>
                          )}
                          {canManage && (
                            <ProductRowActions
                              slug={p.slug}
                              name={p.name}
                              archived={p.status === "archived"}
                              canDelete={isAdmin}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BulkProvider>
      )}

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
