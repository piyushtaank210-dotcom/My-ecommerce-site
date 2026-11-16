import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * One number on the dashboard.
 *
 * The same shape everywhere: a label, a number, and a sentence about
 * where the number came from. A card that leads somewhere is a link, so
 * that it can be reached with the keyboard and read as a link by a
 * screen reader.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad";
  /** Where the card leads, when it leads anywhere. */
  href?: string;
}) {
  const iconTone =
    tone === "good"
      ? "admin-stat-icon--good"
      : tone === "warn"
        ? "admin-stat-icon--warn"
        : tone === "bad"
          ? "admin-stat-icon--bad"
          : "";

  const card = (
    <>
      <div className="admin-stat-top">
        <p className="admin-stat-label">{label}</p>
        <span className={`admin-stat-icon ${iconTone}`.trim()}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="admin-stat-value">{value}</p>
      {hint && <p className="admin-stat-hint">{hint}</p>}
    </>
  );

  if (!href) return <div className="admin-stat">{card}</div>;

  return (
    <Link href={href} className="admin-stat">
      {card}
    </Link>
  );
}
