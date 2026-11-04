/**
 * The three kinds of account in the store.
 *
 *   member  — shops, checks out, manages their own account
 *   support — works the queue: orders and enquiries
 *   admin   — everything, including the catalogue and the user list
 *
 * Permissions live here rather than being sprinkled through the pages, so
 * "can this person do that?" has exactly one answer.
 */

export const ROLES = ["member", "support", "admin"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Anything unrecognised is treated as a plain member. */
export function parseRole(value: unknown): Role {
  const s = String(value ?? "").trim().toLowerCase();
  return isRole(s) ? s : "member";
}

export type Permission =
  | "dashboard.view"
  | "orders.view"
  | "orders.update"
  | "customers.view"
  | "users.manage"
  | "catalog.view"
  | "catalog.manage"
  | "inventory.view"
  | "inventory.manage"
  | "messages.view"
  | "messages.handle"
  | "returns.view"
  | "returns.manage";

/**
 * Support works the queue. They cannot touch the catalogue or accounts.
 *
 * They can see the stock — the order queue needs it — but changing a stock
 * level is a catalogue decision, so that stays with an administrator.
 */
const SUPPORT_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "orders.view",
  "orders.update",
  "customers.view",
  "inventory.view",
  "messages.view",
  "messages.handle",
  "returns.view",
  "returns.manage",
];

const ADMIN_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "orders.view",
  "orders.update",
  "customers.view",
  "users.manage",
  "catalog.view",
  "catalog.manage",
  "inventory.view",
  "inventory.manage",
  "messages.view",
  "messages.handle",
  "returns.view",
  "returns.manage",
];

export function can(
  role: Role | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  if (role === "admin") return ADMIN_PERMISSIONS.includes(permission);
  if (role === "support") return SUPPORT_PERMISSIONS.includes(permission);
  return false;
}

/** True for anyone who belongs in the back office at all. */
export function isStaff(role: Role | null | undefined): boolean {
  return role === "admin" || role === "support";
}

export const ROLE_LABEL: Record<Role, string> = {
  member: "Member",
  support: "Support",
  admin: "Admin",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  member: "Shops the store, checks out and manages their own account.",
  support:
    "Handles customer enquiries and orders. No catalogue or user administration.",
  admin:
    "Full access — catalogue, orders, customers, enquiries and user roles.",
};

/** Tailwind classes for the role pill used across the panels. */
export const ROLE_PILL: Record<Role, string> = {
  member: "bg-gray-100 text-gray-700",
  support: "bg-amber-50 text-amber-700",
  admin: "bg-brand-tint text-brand",
};
