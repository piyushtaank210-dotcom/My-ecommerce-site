import { NextResponse } from "next/server";
import { fail, requireApiPermission } from "@/lib/api";
import {
  approveReturnRequest,
  rejectReturnRequest,
  requestMoreInformation,
  startReview,
} from "@/lib/returns";
import { recordAdminAction, notifyCustomerAbout } from "@/lib/returns-records";

/**
 * POST /api/admin/returns/[id]/decision
 *
 * The three decisions the back office makes on a claim: pick it up and
 * look at it, accept it, or turn it down. A rejection always carries a
 * reason, and the customer is told what it is.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("returns.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { decision?: string; reason?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const decision = String(body.decision ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const note = String(body.note ?? "").trim();
  const staff = { id: guard.user.id, name: guard.user.name };

  if (decision === "start_review") {
    const result = await startReview(id, staff);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (decision === "approve") {
    const result = await approveReturnRequest(id, staff, note || undefined);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    await recordAdminAction({
      returnId: id,
      action: "approve",
      actor: { type: "staff", id: staff.id, name: staff.name, role: guard.user.role },
      note: note || null,
    });
    return NextResponse.json({ ok: true });
  }

  if (decision === "reject") {
    if (!reason) {
      return fail("A rejection needs a reason, and the customer is shown it.", 400);
    }
    const result = await rejectReturnRequest(id, staff, reason);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (decision === "request_evidence") {
    if (!reason) return fail("Say what is needed from the customer.", 400);
    const result = await requestMoreInformation(id, staff, reason);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    await notifyCustomerAbout(id, {
      kind: "evidence_required",
      title: `We need a little more for request ${id}`,
      body: `${reason}\n\nYou can add the missing evidence on your request page.`,
    });
    return NextResponse.json({ ok: true });
  }

  return fail("That is not a decision the shop makes.", 400);
}
