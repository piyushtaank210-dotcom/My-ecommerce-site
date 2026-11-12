import { getReturnRequest } from "./returns";
import { can, parseRole } from "./roles";

/**
 * Who may see a request.
 *
 * The customer it belongs to, or somebody who works in the back office.
 * Nobody else — and the check is made here, in one place, so that every
 * route and every page asks the same question the same way.
 */
export async function maySeeReturn(
  returnId: string,
  user: { id: number; email: string; role: string }
): Promise<{ ok: boolean; ret: Awaited<ReturnType<typeof getReturnRequest>> }> {
  const ret = await getReturnRequest(returnId);
  if (!ret) return { ok: false, ret: null };

  if (can(parseRole(user.role), "returns.view")) return { ok: true, ret };

  // The customer the claim belongs to.
  if (ret.user_id !== null && ret.user_id === user.id) {
    return { ok: true, ret };
  }
  // A guest order: the claim belongs to whoever used that address.
  if (
    ret.user_id === null &&
    (ret.customer_email ?? "").toLowerCase() === user.email.toLowerCase()
  ) {
    return { ok: true, ret };
  }

  return { ok: false, ret: null };
}
