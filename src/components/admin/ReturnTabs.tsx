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
    <nav className="admin-tabs" aria-label="Request views">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className="admin-tab"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
