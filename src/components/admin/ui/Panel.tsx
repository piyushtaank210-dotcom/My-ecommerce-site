import type { ReactNode } from "react";

/**
 * A panel — the one container everything in the back office is built out of.
 *
 * A panel has a heading, an optional sentence under it, optional actions on
 * the right, a body and an optional footer. The body can be flush, for a
 * table, or padded, for a form.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  tone,
  toolbar,
  bodyClass = "",
  headClass = "",
  className = "",
  as: Tag = "section",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** A coloured notice rather than an ordinary panel. */
  tone?: "warn" | "bad" | "good" | "info";
  /** The search and the filters, set in the panel's own sub-header. */
  toolbar?: ReactNode;
  bodyClass?: string;
  headClass?: string;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  const toneClass = tone ? `admin-panel--${tone}` : "";
  const hasHead = Boolean(title || description || actions);

  return (
    <Tag
      className={`admin-panel ${toneClass} ${className}`.trim()}
    >
      {hasHead && (
        <div className={`admin-panel-head ${headClass}`.trim()}>
          <div className="min-w-0">
            {title && <h2 className="admin-panel-title">{title}</h2>}
            {description && <p className="admin-panel-sub">{description}</p>}
          </div>
          {actions && <div className="admin-page-actions">{actions}</div>}
        </div>
      )}
      {toolbar && <div className="admin-toolbar admin-toolbar--inset">{toolbar}</div>}
      {children != null && (
        <div className={`admin-panel-body ${bodyClass}`.trim()}>{children}</div>
      )}
      {footer && <div className="admin-panel-foot">{footer}</div>}
    </Tag>
  );
}
