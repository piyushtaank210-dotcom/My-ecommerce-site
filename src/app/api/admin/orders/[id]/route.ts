import { getOrder, applyOrderStatus } from "@/lib/orders";
import { fail, json, requireApiPermission } from "@/lib/api";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/orders/[id] — one order in full. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.view");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const order = getOrder(id);
  if (!order) return fail("No such order.", 404);

  return json(order);
}

/**
 * PATCH /api/admin/orders/[id] — move the order along.
 *
 * The stock follows the order: cancelling gives the units back when they
 * never left, and holds them for a check when they did.
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (!body.status || !(ORDER_STATUSES as readonly string[]).includes(body.status)) {
    return fail("Pick a valid status.", 400);
  }

  const result = applyOrderStatus(id, body.status as OrderStatus, guard.user.id);
  if (!result.ok) {
    return fail(result.message ?? "That order could not be changed.", 409);
  }

  return json(getOrder(id));
}
