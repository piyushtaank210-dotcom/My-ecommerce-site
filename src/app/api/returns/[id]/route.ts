import { NextResponse } from "next/server";
import { fail, json, requireApiUser } from "@/lib/api";
import { getReturnRequest } from "@/lib/returns";
import { evidenceMayBeAdded } from "@/lib/returns-records";
import { claimUploads } from "@/lib/return-uploads";
import { addReturnEvidence } from "@/lib/returns-records";
import { maySeeReturn } from "@/lib/return-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const { ok, ret } = await maySeeReturn(id, guard.user);
  if (!ok || !ret) {
    return fail("That request was not found.", 404);
  }

  return json({
    request: {
      id: ret.id,
      order_id: ret.order_id,
      type: ret.type,
      status: ret.status,
      reason: ret.reason,
      customer_notes: ret.customer_notes,
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
        version: im.version,
        url: `/api/returns/${ret.id}/evidence/${im.id}`,
      })),
      history: ret.events.map((ev) => ({
        status: ev.status,
        note: ev.note,
        actor_type: ev.actor_type,
        actor_name: ev.actor_name,
        at: ev.created_at,
      })),
    },
  });
}

/**
 * POST /api/returns/[id]/evidence — add evidence to a request.
 *
 * The files are sent to /api/returns/evidence first, and their ids are
 * sent here. The claim has to belong to the person asking, and it has
 * to still be open.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const { ok, ret } = await maySeeReturn(id, guard.user);
  if (!ok || !ret) return fail("That request was not found.", 404);

  if (ret.user_id !== null && ret.user_id !== guard.user.id) {
    return fail("You are not authorized to add to this request.", 403);
  }

  if (!evidenceMayBeAdded(ret.status)) {
    return fail(
      "This request has already been decided on, so the evidence cannot be changed.",
      409
    );
  }

  let body: { uploadIds?: string[]; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const uploadIds = (body.uploadIds ?? []).filter(Boolean);
  if (!uploadIds.length) return fail("No files were sent.", 400);

  const files = await claimUploads({
    uploadIds,
    userId: guard.user.id,
    returnId: id,
  });
  if (!files.length) return fail("Those files could not be attached.", 400);

  const result = await addReturnEvidence({
    returnId: id,
    files,
    uploadedBy: { type: "customer", id: guard.user.id },
    note: body.note ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, version: result.version }, { status: 201 });
}
