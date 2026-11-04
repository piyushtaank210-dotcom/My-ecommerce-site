"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * The search box on a back-office listing. It writes to the URL rather than
 * holding state, so a search can be shared and survives a refresh.
 */
export function PanelSearch({
  placeholder = "Search",
  param = "q",
}: {
  placeholder?: string;
  param?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get(param) ?? "";
  const [value, setValue] = useState(fromUrl);

  // The URL is the truth. Without this the box would go on showing the last
  // search after the filters were cleared, or after the browser went back —
  // the list would be filtered one way and the box would read another.
  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);

  function submit(next: string) {
    const search = new URLSearchParams(params.toString());
    if (next.trim()) search.set(param, next.trim());
    else search.delete(param);
    search.delete("page");
    const qs = search.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative w-full sm:w-72"
      role="search"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        name={param}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input h-9 pl-9 pr-8 text-[13px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          aria-label="Clear the search"
          className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
