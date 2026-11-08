import { json, fail, requireApiPermission } from "@/lib/api";
import { resolveStockCheck } from "@/lib/inventory";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/inventory/orders/[id]/resolve — settle a return.
 *
 * Body: `{action: "restock"|"write_off", reason}`. The units are not
 * sellable stock until somebody has looked at them and said so.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("inventory.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { action?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; reason?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").trim();

  if (action !== "restock" && action !== "write_off") {
    return fail("Pick what to do with the returned units.", 400);
  }
  if (!reason) return fail("Say why.", 400);

  const result = (await resolveStockCheck(id, action, reason, guard.user.id));
  if (!result.ok) return fail(result.message, 409);

  return json({ ok: true, message: result.message });
}
