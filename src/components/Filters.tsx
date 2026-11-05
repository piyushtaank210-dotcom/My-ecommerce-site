"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "discount", label: "Biggest discount" },
  { value: "newest", label: "Newest arrivals" },
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(v: string) {
    const sp = new URLSearchParams(params.toString());
    if (v === "featured") sp.delete("sort");
    else sp.set("sort", v);
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Sort products"
      className="input h-10 w-full cursor-pointer text-[13.5px] sm:w-auto"
    >
      {SORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function CategoryFilter({
  categories,
  active,
}: {
  categories: { slug: string; name: string }[];
  active?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(slug?: string) {
    const sp = new URLSearchParams(params.toString());
    if (slug) sp.set("category", slug);
    else sp.delete("category");
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const current = active ?? "";
  const options = [{ slug: "", name: "All products" }, ...categories];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-gray-500">Category:</span>
      {options.map((c) => {
        const on = current === c.slug;
        return (
          <button
            key={c.slug || "all"}
            type="button"
            onClick={() => select(c.slug || undefined)}
            aria-pressed={on}
            className={`rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors sm:py-1 ${
              on
                ? "border-brand bg-brand text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

export function BrandFilter({
  brands,
  active,
}: {
  brands: string[];
  active: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function toggle(brand: string) {
    const sp = new URLSearchParams(params.toString());
    const next = active.includes(brand)
      ? active.filter((b) => b !== brand)
      : [...active, brand];
    if (next.length) sp.set("brand", next.join(","));
    else sp.delete("brand");
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (brands.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-gray-500">Brand:</span>
      {brands.map((b) => {
        const on = active.includes(b);
        return (
          <button
            key={b}
            type="button"
            onClick={() => toggle(b)}
            aria-pressed={on}
            className={`rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors sm:py-1 ${
              on
                ? "border-brand bg-brand text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}
