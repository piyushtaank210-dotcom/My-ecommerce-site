import { findUserByEmail, updateUserProfile } from "@/lib/auth";
import { fail, json, requireApiUser } from "@/lib/api";
import { getOrdersForUser } from "@/lib/orders";

/** GET /api/account/profile — the signed-in customer's own details. */
export async function GET() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { password_hash: _hash, ...safe } = await findUserByEmail(guard.user.email) ?? {
    ...guard.user,
    password_hash: "",
  };
  return json(safe);
}

/** PATCH /api/account/profile — change name, email or phone. */
export async function PATCH(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  let body: { name?: string; email?: string; phone?: string };
  try {
    body = (await request.json()) as { name?: string; email?: string; phone?: string };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const name = (body.name ?? guard.user.name).trim();
  const email = (body.email ?? guard.user.email).trim().toLowerCase();
  const phone = (body.phone ?? guard.user.phone ?? "").trim();

  if (name.length < 2) return fail("Enter your full name.", 400);
  if (!email.includes("@")) return fail("Enter a valid email address.", 400);

  const clash = await findUserByEmail(email);
  if (clash && clash.id !== guard.user.id) {
    return fail("An account with this email already exists.", 409);
  }

  await updateUserProfile(guard.user.id, { name, email, phone });
  return json({ id: guard.user.id, name, email, phone: phone || null });
}
