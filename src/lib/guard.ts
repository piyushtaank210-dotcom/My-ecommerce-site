import { redirect } from "next/navigation";
import { getCurrentUser, type User } from "./auth";
import { can, isStaff, type Permission } from "./roles";

/**
 * Page guards. Each one either returns the signed-in user or sends them
 * somewhere they can do something useful.
 */
export async function requireUser(next = "/account"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Anyone who works in the back office — admin or support. */
export async function requireStaff(next = "/admin"): Promise<User> {
  const user = await requireUser(next);
  if (!isStaff(user.role)) redirect("/account?denied=admin");
  return user;
}

/** Staff with a particular permission. */
export async function requirePermission(
  permission: Permission,
  next = "/admin"
): Promise<User> {
  const user = await requireStaff(next);
  if (!can(user.role, permission)) redirect("/admin?denied=1");
  return user;
}

/**
 * API guards. Route handlers answer with JSON, so they cannot redirect —
 * they return null and the handler writes the status code.
 */
export async function staffForApi(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && isStaff(user.role) ? user : null;
}

export async function userForApi(): Promise<User | null> {
  return getCurrentUser();
}
