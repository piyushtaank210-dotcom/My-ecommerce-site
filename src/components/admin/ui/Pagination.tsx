import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Page links for a back-office listing.
 *
 * `pageLink` builds the href for a given page number so each listing
 * keeps its own filters and sort. The row sits under the table, on the
 * right, with the count of what is being shown on the left.
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

  // A long list of pages is shown as a window around the one being read,
  // so that the row never runs off the side of the screen.
  const window: number[] = [];
  const from = Math.max(1, Math.min(page - 2, totalPages - 4));
  const to = Math.min(totalPages, from + 4);
  for (let n = from; n <= to; n++) window.push(n);

  const cell =
    "grid h-8 w-8 place-items-center rounded-lg border text-[12.5px] font-semibold transition-colors";

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1.5">
      <Link
        href={pageLink(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        aria-label="Previous page"
        className={`${cell} border-gray-200 text-gray-600 hover:border-brand hover:text-brand ${
          page === 1 ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      {from > 1 && (
        <>
          <Link
            href={pageLink(1)}
            className={`${cell} border-gray-200 text-gray-600 hover:border-brand hover:text-brand`}
          >
            1
          </Link>
          {from > 2 && (
            <span className="px-1 text-[12.5px] text-gray-400">…</span>
          )}
        </>
      )}

      {window.map((n) => (
        <Link
          key={n}
          href={pageLink(n)}
          aria-current={n === page ? "page" : undefined}
          className={`${cell} tnum ${
            n === page
              ? "border-brand bg-brand text-white"
              : "border-gray-200 text-gray-600 hover:border-brand hover:text-brand"
          }`}
        >
          {n}
        </Link>
      ))}

      {to < totalPages && (
        <>
          {to < totalPages - 1 && (
            <span className="px-1 text-[12.5px] text-gray-400">…</span>
          )}
          <Link
            href={pageLink(totalPages)}
            className={`${cell} border-gray-200 text-gray-600 hover:border-brand hover:text-brand`}
          >
            {totalPages}
          </Link>
        </>
      )}

      <Link
        href={pageLink(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        aria-label="Next page"
        className={`${cell} border-gray-200 text-gray-600 hover:border-brand hover:text-brand ${
          page === totalPages ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
