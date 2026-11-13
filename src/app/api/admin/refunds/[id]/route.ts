import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { updateRefundRecord } from "@/lib/returns-records";
import { REFUND_STATUSES, type RefundStatus } from "@/lib/return-status";

/**
 * PATCH /api/admin/refunds/[id] — move a refund along.
 *
 * A refund is only shown as completed once the payment has been
 * confirmed, and the transaction it was paid under is recorded with it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("returns.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: {
    status?: string;
    gatewayTransactionId?: string;
    gatewayRefundId?: string;
    /** Whether the shop sent it to the gateway or paid it by hand. */
    settledBy?: "gateway" | "manual";
    notes?: string;
    failedReason?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const status = String(body.status ?? "").trim() as RefundStatus;
  if (!(REFUND_STATUSES as readonly string[]).includes(status)) {
    return fail("That is not a refund status.", 400);
  }

  const result = await updateRefundRecord({
    refundId: id,
    status,
    gatewayTransactionId: body.gatewayTransactionId ?? null,
    gatewayRefundId: body.gatewayRefundId ?? null,
    settledBy: body.settledBy ?? null,
    notes: body.notes ?? null,
    failedReason: body.failedReason ?? null,
    actor: { id: guard.user.id, name: guard.user.name, role: guard.user.role },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return json({ ok: true });
}
