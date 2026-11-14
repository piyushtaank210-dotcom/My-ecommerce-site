import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Category } from "@/lib/types";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-gray-500">
        <li>
          <Link
            href="/"
            className="inline-block py-1 transition-colors hover:text-brand"
          >
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            {item.href && i < items.length - 1 ? (
              <Link
                href={item.href}
                className="inline-block py-1 transition-colors hover:text-brand"
              >
                {item.label}
              </Link>
            ) : (
              <span className="inline-block py-1 font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
