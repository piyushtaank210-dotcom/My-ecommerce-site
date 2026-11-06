import Link from "next/link";

/**
 * The row of views a request list can be read through — the coarse way in,
 * one click, rather than a dropdown to hunt through.
 */
export function ReturnTabs({
  tabs,
}: {
  tabs: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <nav
      aria-label="Request views"
      className="-mx-1 flex flex-wrap gap-1 overflow-x-auto pb-1"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            t.active
              ? "bg-ink text-white"
              : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
