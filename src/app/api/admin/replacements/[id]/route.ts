import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { updateReplacementDelivery } from "@/lib/returns-records";
import { REPLACEMENT_STATUSES, type ReplacementStatus } from "@/lib/return-status";

/**
 * PATCH /api/admin/replacements/[id] — record where a shipment has got
 * to.
 *
 * When it is delivered, the request it belongs to is resolved.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("returns.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { status?: string; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const status = String(body.status ?? "").trim() as ReplacementStatus;
  if (!(REPLACEMENT_STATUSES as readonly string[]).includes(status)) {
    return fail("That is not a delivery status.", 400);
  }

  const result = await updateReplacementDelivery({
    replacementId: id,
    status,
    notes: body.notes ?? null,
    actor: { id: guard.user.id, name: guard.user.name, role: guard.user.role },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return json({ ok: true });
}
