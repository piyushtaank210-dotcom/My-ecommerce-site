import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "good"
  | "warn"
  | "bad"
  | "info";

/**
 * The one badge the back office uses.
 *
 * Every status — an order, a payment, a return, a piece of stock, a
 * product — is shown in this shape and in these colours, so that a colour
 * means the same thing wherever it is read.
 */
export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  /** A dot in the badge's own colour — for a status that is still live. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`admin-badge admin-badge--${tone} ${className}`.trim()}
    >
      {dot && <span className="admin-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
