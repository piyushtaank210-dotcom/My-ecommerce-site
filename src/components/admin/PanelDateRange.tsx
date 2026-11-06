"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * The date range on a back-office listing. It writes to the URL so the
 * window of time being looked at can be shared and reloaded.
 */
export function PanelDateRange({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(nextFrom: string, nextTo: string) {
    const search = new URLSearchParams(params.toString());
    if (nextFrom) search.set("from", nextFrom);
    else search.delete("from");
    if (nextTo) search.set("to", nextTo);
    else search.delete("to");
    search.delete("page");
    const qs = search.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        name="from"
        value={from ?? ""}
        max={to ?? undefined}
        onChange={(e) => push(e.target.value, to ?? "")}
        aria-label="From date"
        className="input h-9 text-[13px]"
      />
      <span className="text-[12.5px] text-gray-400">to</span>
      <input
        type="date"
        name="to"
        value={to ?? ""}
        min={from ?? undefined}
        onChange={(e) => push(from ?? "", e.target.value)}
        aria-label="To date"
        className="input h-9 text-[13px]"
      />
    </div>
  );
}
