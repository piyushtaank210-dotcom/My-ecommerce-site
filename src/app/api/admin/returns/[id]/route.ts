import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { getReturnRequest } from "@/lib/returns";
import { listAdminActions } from "@/lib/returns-records";
import { RETURN_STATUSES, type ReturnStatus } from "@/lib/return-status";
import { transitionReturnStatus } from "@/lib/returns-records";

/**
 * GET /api/admin/returns/[id] — one request, in full.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const ret = await getReturnRequest(id);
  if (!ret) return fail("That request was not found.", 404);

  const actions = await listAdminActions(id);

  return json({
    request: {
      id: ret.id,
      order_id: ret.order_id,
      type: ret.type,
      status: ret.status,
      reason: ret.reason,
      customer_name: ret.customer_name,
      customer_email: ret.customer_email,
      customer_phone: ret.customer_phone,
      customer_notes: ret.customer_notes,
      admin_notes: ret.admin_notes,
      rejection_reason: ret.rejection_reason,
      delivery_date: ret.delivery_date,
      serial_number: ret.serial_number,
      sealed_state: ret.sealed_state,
      missing_accessories: ret.missing_accessories,
      evidence_excused: ret.evidence_excused,
      created_at: ret.created_at,
      updated_at: ret.updated_at,
      items: ret.items,
      evidence: ret.images.map((im) => ({
        id: im.id,
        kind: im.kind,
        evidence_kind: im.evidence_kind,
        original_name: im.original_name,
        mime_type: im.mime_type,
        size_bytes: im.size_bytes,
        uploaded_at: im.created_at,
        uploaded_by: im.uploaded_by_type,
        uploaded_by_id: im.uploaded_by_id,
        version: im.version,
        superseded: im.superseded,
        sha256: im.sha256,
        note: im.note,
        url: `/api/returns/${ret.id}/evidence/${im.id}`,
        download_url: `/api/returns/${ret.id}/evidence/${im.id}?download=1`,
      })),
      history: ret.events,
      refunds: ret.refunds,
      replacements: ret.replacements,
      inspections: ret.inspections,
    },
    actions,
  });
}

/**
 * PATCH /api/admin/returns/[id] — move a request to another status.
 *
 * The status has to be one the shop knows about, and the change is
 * written to the request's history and to the audit log, and the
 * customer is told.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("returns.manage");
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: { status?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const status = String(body.status ?? "").trim() as ReturnStatus;
  if (!status || !(RETURN_STATUSES as readonly string[]).includes(status)) {
    return fail("That is not a status a request can be in.", 400);
  }

  const result = await transitionReturnStatus({
    returnId: id,
    to: status,
    actor: {
      type: "staff",
      id: guard.user.id,
      name: guard.user.name,
      role: guard.user.role,
    },
    action: `status:${status}`,
    note: body.note ?? null,
    tellCustomer: {
      kind:
        status === "rejected"
          ? "rejected"
          : status === "info_requested"
            ? "evidence_required"
            : status === "approved"
              ? "approved"
              : "under_review",
      title: `Request ${id} — ${status.replace(/_/g, " ")}`,
      body:
        body.note ??
        `Your request ${id} is now ${status.replace(/_/g, " ")}.`,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return json({ ok: true, from: result.from, to: status });
}
