import { getDb } from "@/lib/db";
import { getUserById, setUserRole, updateUserPassword } from "@/lib/auth";
import { fail, json, requireApiPermission } from "@/lib/api";
import { isRole } from "@/lib/roles";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/users/[id] — one account. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("customers.view");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const user = getUserById(Number(id));
  if (!user) return fail("No such account.", 404);

  return json(user);
}

/**
 * PATCH /api/admin/users/[id] — change an account.
 *
 * Body may carry `role` (member | support | admin) or `password` (a reset).
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("users.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const userId = Number(id);
  const target = getUserById(userId);
  if (!target) return fail("No such account.", 404);

  let body: { role?: string; password?: string };
  try {
    body = (await request.json()) as { role?: string; password?: string };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (body.role !== undefined) {
    if (!isRole(body.role)) return fail("Pick a valid role.", 400);
    // An admin who demotes themselves locks the back office.
    if (target.id === guard.user.id && body.role !== "admin") {
      return fail("You cannot remove your own admin access.", 400);
    }
    setUserRole(target.id, body.role);
  }

  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return fail("Use at least 8 characters.", 400);
    }
    updateUserPassword(target.id, body.password);
  }

  return json(getUserById(target.id));
}

/** DELETE /api/admin/users/[id] — remove an account. */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("users.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const userId = Number(id);
  if (userId === guard.user.id) {
    return fail("You cannot delete your own account.", 400);
  }
  if (!getUserById(userId)) return fail("No such account.", 404);

  getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
  return json({ deleted: userId });
}
