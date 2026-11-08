"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FilterOption = { value: string; label: string };

/**
 * A filter dropdown on a back-office listing. It writes to the URL so the
 * filtered view can be shared and reloaded.
 */
export function PanelFilter({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value: string;
  options: FilterOption[];
  label: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  // A value that is not on the list — a filter that no longer exists, or one
  // reached with a hand-written link — would leave the dropdown blank. It
  // falls back to the first option instead.
  const known = options.some((o) => o.value === value);
  const current = known ? value : (options[0]?.value ?? "all");

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const search = new URLSearchParams(params.toString());
    const next = e.target.value;
    if (next && next !== "all") search.set(name, next);
    else search.delete(name);
    search.delete("page");
    const qs = search.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      name={name}
      value={current}
      onChange={onChange}
      aria-label={label}
      className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
