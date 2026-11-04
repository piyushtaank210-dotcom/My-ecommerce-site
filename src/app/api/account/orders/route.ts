import { getOrdersForUser } from "@/lib/orders";
import { json, requireApiUser } from "@/lib/api";

/** GET /api/account/orders — the signed-in customer's own order history. */
export async function GET() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  return json({ orders: getOrdersForUser(guard.user.id) });
}
