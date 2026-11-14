"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/**
 * The chips that filter a list.
 *
 * On a phone they run in one line that slides sideways under the finger,
 * rather than wrapping onto three lines and pushing the products down the
 * page. The row is pulled out to the edge of the screen and given back
 * its gutter, so a chip can be half off the edge — which is the sign
 * that there is more of the row to come.
 *
 * From the tablet breakpoint the row wraps as it always did.
 */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  // Whether the fade at the edge of the row is wanted. It is wanted while
  // there is more of the row to the right, and not wanted once the row has
  // been scrolled to its end — a chip that fades away at the end of the
  // row is a chip that looks like there is more of it.
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const el = row.current;
    if (!el) return;

    const update = () => {
      // From the tablet breakpoint the row wraps and there is nothing to
      // slide, so there is nothing to fade either.
      if (window.matchMedia("(min-width: 640px)").matches) {
        setFade(false);
        return;
      }
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setFade(!atEnd);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={row}
      className={`no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 ${
        fade ? "scroll-fade" : ""
      }`}
    >
      <span className="shrink-0 text-[13px] text-gray-500">{label}</span>
      {children}
    </div>
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
    <ChipRow label="Category:">
      {options.map((c) => {
        const on = current === c.slug;
        return (
          <button
            key={c.slug || "all"}
            type="button"
            onClick={() => select(c.slug || undefined)}
            aria-pressed={on}
            className={`tap-lg shrink-0 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors sm:py-1 ${
              on
                ? "border-brand bg-brand text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </ChipRow>
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
    <ChipRow label="Brand:">
      {brands.map((b) => {
        const on = active.includes(b);
        return (
          <button
            key={b}
            type="button"
            onClick={() => toggle(b)}
            aria-pressed={on}
            className={`tap-lg shrink-0 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors sm:py-1 ${
              on
                ? "border-brand bg-brand text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {b}
          </button>
        );
      })}
    </ChipRow>
  );
}
