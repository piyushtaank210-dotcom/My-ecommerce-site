import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The heading every admin page opens with.
 *
 * The same shape on every page: an optional line of context above the
 * title, the title itself, a sentence that says what the page is for, and
 * the page's own actions on the right.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  back,
  size = "lg",
}: {
  title: ReactNode;
  /** The one sentence that says what this page is for. */
  description?: ReactNode;
  /** A short line above the title — where the page sits, or what it is. */
  eyebrow?: ReactNode;
  /** The page's own buttons. */
  actions?: ReactNode;
  /** Facts about the page, under the title: a count, a link, a date. */
  meta?: ReactNode;
  /** A link back to where this page was reached from. */
  back?: { href: string; label: string };
  size?: "lg" | "sm";
}) {
  return (
    <header className="admin-page-head">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-3 flex w-fit items-center gap-1 text-[12.5px] font-semibold text-gray-500 transition-colors hover:text-ink"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            {back.label}
          </Link>
        )}
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1 className={size === "lg" ? "admin-h1" : "admin-h1-sm"}>{title}</h1>
        {description && <p className="admin-lead">{description}</p>}
        {meta && <div className="admin-meta">{meta}</div>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>
  );
}
