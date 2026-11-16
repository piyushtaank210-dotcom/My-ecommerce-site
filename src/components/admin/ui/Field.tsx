import type { ReactNode } from "react";

/**
 * One field of a form: its label, the control itself, and whatever is
 * said under it — a hint about what to put there, or the reason it was
 * refused.
 *
 * The label sits above the control, the hint sits below it, and the two
 * never change places. A field that has an error says so in the same
 * place the hint would have been.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className = "",
}: {
  label: ReactNode;
  /** The id of the control the label belongs to. */
  htmlFor?: string;
  /** A sentence under the field that says what belongs in it. */
  hint?: ReactNode;
  /** Why the field was refused. */
  error?: ReactNode;
  /** Marks the label as required. */
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`admin-field ${className}`.trim()}>
      {label != null && (
        <label
          htmlFor={htmlFor}
          className={`admin-label ${required ? "admin-label--required" : ""}`.trim()}
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="admin-error">{error}</p>
      ) : hint ? (
        <p className="admin-hint">{hint}</p>
      ) : null}
    </div>
  );
}
