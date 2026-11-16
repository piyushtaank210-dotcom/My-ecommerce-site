import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * What a page shows when there is nothing to show.
 *
 * It says what is missing and, where there is one, offers the way out of
 * it — a link that clears the filters, or a button that adds the first
 * thing.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      {Icon && (
        <span className="admin-empty-icon">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h2 className="admin-empty-title">{title}</h2>
      {description && <p className="admin-empty-text">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
