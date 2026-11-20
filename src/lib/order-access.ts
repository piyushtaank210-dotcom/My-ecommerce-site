import { isStaff, parseRole } from "./roles";

/**
 * Who may see an order.
 *
 * The customer it belongs to, or somebody who works in the back office.
 * Nobody else.
 *
 * The rule is in one place so that every page and every route asks the
 * same question the same way. It is deliberately a plain function with no
 * database in it, so that the question can be asked — and answered — in
 * a test.
 */
export function maySeeOrder(
  viewer: { id: number; role: string } | null | undefined,
  order: { user_id: number | null }
): boolean {
  // A guest may open the order they have just placed: the id is the
  // only receipt they get.
  if (!viewer) return true;

  // An order that belongs to no account is open to whoever holds its id.
  if (order.user_id === null) return true;

  // The customer it belongs to.
  if (order.user_id === viewer.id) return true;

  // Somebody who works in the back office.
  return isStaff(parseRole(viewer.role));
}
