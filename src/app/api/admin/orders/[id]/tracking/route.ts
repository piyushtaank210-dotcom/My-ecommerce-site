import { fail, json, requireApiPermission } from "@/lib/api";
import { refreshShipmentTracking } from "@/lib/shipment-tracking";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/tracking — ask the courier where the parcel
 * is, and write down the answer.
 *
 * It only reads. The shop books its shipments by hand, so nothing here
 * creates a shipment, assigns a courier or books a pickup.
 *
 * The tracking number on the order is the one that is looked up, so the
 * back office never has to type it twice.
 */
export async function POST(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("orders.update");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const result = await refreshShipmentTracking({
    orderId: id,
    userId: guard.user.id,
  });

  if (!result.ok) {
    return fail(result.message, 400);
  }

  return json({ ok: true, message: result.message });
}
