import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { SortSelect, BrandFilter } from "@/components/Filters";
import { getCategory, getBrands, getProducts, countProducts } from "@/lib/queries";
import type { SortKey } from "@/lib/types";

const PER_PAGE = 16;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getCategory(slug));
  if (!category) return { title: "Not found" };
  return {
    title: category.name,
    description: category.blurb ?? undefined,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = (await getCategory(slug));
  if (!category) notFound();

  const brandParam = one(sp.brand);
  const brands = brandParam ? brandParam.split(",").filter(Boolean) : [];
  const sort = (one(sp.sort) || "featured") as SortKey;
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    category: slug,
    brands: brands.length ? brands : undefined,
    sort,
  };

  // The three are asked for together: the database is a long way off, and
  // asking one at a time makes the page as slow as the sum of them.
  const [total, products, allBrands] = await Promise.all([
    countProducts(query),
    getProducts({
      ...query,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    getBrands(slug),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (brands.length) p.set("brand", brands.join(","));
    if (sort !== "featured") p.set("sort", sort);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/category/${slug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="container-x py-8">
      <Breadcrumbs items={[{ label: category.name }]} />

      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-ink">{category.name}</h1>
        {category.blurb && (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-gray-500">
            {category.blurb}
          </p>
        )}
        <p className="mt-2 text-[13px] text-gray-500">
          {total} {total === 1 ? "product" : "products"}
        </p>
      </header>

      <div className="mb-6 flex flex-col gap-3 border-y border-gray-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <BrandFilter brands={allBrands} active={brands} />
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
            Try clearing the brand filter.
          </p>
          <Link href={`/category/${slug}`} className="btn btn-primary btn-sm mt-5">
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
