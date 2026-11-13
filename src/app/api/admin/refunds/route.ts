import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { pageParams, paged } from "@/lib/api";
import {
  countRefunds,
  listRefunds,
  createRefundRecord,
  updateRefundRecord,
} from "@/lib/returns-records";
import { REFUND_STATUSES, type RefundStatus } from "@/lib/return-status";

/**
 * GET /api/admin/refunds — every refund, searchable.
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const query = {
    q: url.searchParams.get("q")?.trim() || undefined,
    status: url.searchParams.get("status") || undefined,
    from: url.searchParams.get("from")?.trim() || undefined,
    to: url.searchParams.get("to")?.trim() || undefined,
    limit,
    offset,
  };

  const [rows, total] = await Promise.all([
    listRefunds(query),
    countRefunds(query),
  ]);

  return json(paged(rows, total, page, limit));
}

/**
 * POST /api/admin/refunds — raise a refund against a request.
 *
 * It is a record of its own: what was owed, who approved it, and — when
 * it is paid — the transaction it was paid under.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("returns.manage");
  if ("error" in guard) return guard.error;

  let body: {
    returnId?: string;
    amount?: number;
    paymentMethod?: string;
    notes?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (!body.returnId) return fail("The request is required.", 400);
  // The amount is in rupees, the same as the form and the same as the
  // shop keeps its money.
  const amount = Math.round(Number(body.amount ?? 0));
  if (!amount || amount <= 0) return fail("Enter the amount to refund.", 400);

  const result = await createRefundRecord({
    returnId: body.returnId,
    amount,
    paymentMethod: body.paymentMethod ?? null,
    notes: body.notes ?? null,
    approvedBy: { id: guard.user.id, name: guard.user.name, role: guard.user.role },
  });

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

  return NextResponse.json({ ok: true, refundId: result.id }, { status: 201 });
}
