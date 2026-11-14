"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const pathname = usePathname();

  function push(nextFrom: string, nextTo: string) {
    const search = new URLSearchParams(params.toString());
    if (nextFrom) search.set("from", nextFrom);
    else search.delete("from");
    if (nextTo) search.set("to", nextTo);
    else search.delete("to");
    search.delete("page");
    const qs = search.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    /*
      On a phone the two dates are stacked, not side by side.

      A date field has a width of its own — it cannot be made narrower
      than the date it is showing — and two of them side by side are
      wider than a phone. The fields are also 16px on a phone, which is
      what stops iOS zooming in when they are tapped, and that makes
      them wider still.
    */
    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
      <input
        type="date"
        name="from"
        value={from ?? ""}
        max={to ?? undefined}
        onChange={(e) => push(e.target.value, to ?? "")}
        aria-label="From date"
        className="input h-9 min-w-0 text-[13px]"
      />
      <span className="text-[12.5px] text-gray-400 sm:text-center">to</span>
      <input
        type="date"
        name="to"
        value={to ?? ""}
        min={from ?? undefined}
        onChange={(e) => push(from ?? "", e.target.value)}
        aria-label="To date"
        className="input h-9 min-w-0 text-[13px]"
      />
    </div>
  );
}
