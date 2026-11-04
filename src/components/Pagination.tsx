import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Page links for a product listing. `pageLink` builds the href for a given
 * page number so each listing keeps its own filters and sort.
 */
export function Pagination({
  page,
  totalPages,
  pageLink,
}: {
  page: number;
  totalPages: number;
  pageLink: (n: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-10 flex justify-center gap-1.5">
      <Link
        href={pageLink(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={`grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 transition-colors ${
          page === 1
            ? "pointer-events-none opacity-40"
            : "hover:border-brand hover:text-brand"
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      {Array.from({ length: totalPages }).map((_, i) => {
        const n = i + 1;
        const active = n === page;
        return (
          <Link
            key={n}
            href={pageLink(n)}
            aria-current={active ? "page" : undefined}
            className={`tnum grid h-9 w-9 place-items-center rounded-lg border text-[13px] font-semibold transition-colors ${
              active
                ? "border-brand bg-brand text-white"
                : "border-gray-200 text-gray-600 hover:border-brand hover:text-brand"
            }`}
          >
            {n}
          </Link>
        );
      })}
      <Link
        href={pageLink(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={`grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 transition-colors ${
          page === totalPages
            ? "pointer-events-none opacity-40"
            : "hover:border-brand hover:text-brand"
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
