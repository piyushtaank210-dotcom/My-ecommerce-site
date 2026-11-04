"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import type { Product } from "@/lib/types";
import { money } from "@/lib/format";

type Suggestion = Pick<
  Product,
  "slug" | "name" | "brand" | "price" | "image"
>;

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { products: Suggestion[] };
          setResults(data.products);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <form onSubmit={submit} role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search products"
            aria-label="Search products"
            className="input h-10 pl-9 pr-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
      </form>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop">
          {results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((p) => (
                <li key={p.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/product/${p.slug}`);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    {p.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.image}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg bg-gray-50 object-contain p-1"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {p.name}
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        {p.brand}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                      {money(p.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-gray-500">
              {loading ? "Searching…" : `No matches for “${query.trim()}”.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
