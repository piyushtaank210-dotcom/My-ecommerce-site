import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductGrid } from "@/components/ProductGrid";
import { SortSelect } from "@/components/Filters";
import { getProducts, countProducts } from "@/lib/queries";
import type { SortKey } from "@/lib/types";

export const metadata: Metadata = {
  title: "Search",
  description: "Search consoles and controllers.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (raw ?? "").trim();
  const sort = ((Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ??
    "featured") as SortKey;

  const query = { q: q || undefined, sort };
  const total = countProducts(query);
  const products = getProducts({ ...query, limit: 48 });

  return (
    <div className="container-x py-8">
      <Breadcrumbs items={[{ label: "Search" }]} />

      <header className="mb-6">
        <h1 className="text-[28px] font-bold text-ink">
          {q ? `Results for “${q}”` : "All products"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          {total} {total === 1 ? "product" : "products"}
        </p>
      </header>

      <div className="mb-6 flex justify-end border-y border-gray-200 py-3">
        <div className="w-full sm:w-52">
          <SortSelect value={sort} />
        </div>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 px-6 py-20 text-center">
          <PackageSearch className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">No matches found</h2>
          <p className="mt-1.5 text-[13.5px] text-gray-500">
            Try a broader term — “PS5”, “DualSense” or “charging”.
          </p>
          <Link href="/search" className="btn btn-primary btn-sm mt-5">
            Browse everything
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
