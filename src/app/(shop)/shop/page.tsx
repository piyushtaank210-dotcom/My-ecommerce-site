import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductGrid } from "@/components/ProductGrid";
import { SortSelect, BrandFilter, CategoryFilter } from "@/components/Filters";
import { Pagination } from "@/components/Pagination";
import {
  getCategories,
  getBrands,
  getProducts,
  countProducts,
} from "@/lib/queries";
import type { SortKey } from "@/lib/types";

const PER_PAGE = 12;

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Every console and controller ConsoleSeller stocks — filter by category, sort by price, rating or discount, and add to cart.",
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const categories = getCategories();
  const slugs = categories.map((c) => c.slug);

  // An unknown category in the URL is ignored rather than emptying the grid.
  const requested = one(sp.category);
  const category = slugs.includes(requested) ? requested : undefined;

  const sort = (one(sp.sort) || "featured") as SortKey;
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = { category, sort };
  const total = countProducts(query);
  const products = getProducts({
    ...query,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });
  const brands = getBrands(category);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (sort !== "featured") p.set("sort", sort);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/shop${qs ? `?${qs}` : ""}`;
  };

  const active = categories.find((c) => c.slug === category);

  return (
    <div className="container-x py-8">
      <Breadcrumbs items={[{ label: "Shop" }]} />

      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-ink">
          {active ? active.name : "Shop all products"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-gray-500">
          {active?.blurb ??
            "Consoles and controllers, together in one place. Filter by category, sort the way you like, and add anything to your cart."}
        </p>
        <p className="mt-2 text-[13px] text-gray-500">
          {total} {total === 1 ? "product" : "products"}
        </p>
      </header>

      <div className="mb-6 flex flex-col gap-3 border-y border-gray-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <CategoryFilter
            categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
            active={category}
          />
          <BrandFilter brands={brands} active={[]} />
        </div>
        <div className="w-full sm:w-52">
          <SortSelect value={sort} />
        </div>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 px-6 py-20 text-center">
          <PackageSearch className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            Nothing matches those filters
          </h2>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            Try clearing the category filter to see everything.
          </p>
          <Link href="/shop" className="btn btn-primary btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
