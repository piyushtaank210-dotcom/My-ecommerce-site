import { NextResponse } from "next/server";
import { fail, requireApiUser } from "@/lib/api";
import { stageUpload, deleteStagedUpload } from "@/lib/return-uploads";
import { EVIDENCE_KINDS, type EvidenceKind } from "@/lib/return-status";
import { storageUnavailableReason } from "@/lib/storage";

/**
 * POST /api/returns/evidence
 *
 * Sends evidence up, before the request itself is submitted.
 *
 * The customer picks their photographs and videos and they go straight
 * away, so the page can show how each file is getting on. The files
 * wait until the request is submitted, and are then attached to it.
 *
 * This is the way in for a shop that keeps its files on its own disk.
 * A shop whose files live in a store has the browser send them to the
 * store directly, through `/api/returns/uploads`, so that a video is
 * not asked to travel through the shop at all.
 */
export async function POST(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const unavailable = storageUnavailableReason();
  if (unavailable) return fail(unavailable, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Send the files as a form.", 400);
  }

  const files = form.getAll("files").filter(
    (f): f is File => typeof File !== "undefined" && f instanceof File
  );

  if (!files.length) return fail("No files were sent.", 400);
  if (files.length > 8) {
    return fail("Send at most eight files at a time.", 400);
  }

  const rawKind = String(form.get("evidenceKind") ?? "other");
  const evidenceKind: EvidenceKind = (EVIDENCE_KINDS as readonly string[]).includes(
    rawKind
  )
    ? (rawKind as EvidenceKind)
    : "other";

  const uploads = [];
  const staged: string[] = [];

  for (const file of files) {
    const result = await stageUpload({
      userId: guard.user.id,
      file,
      evidenceKind,
    });
    if (!result.ok) {
      // The files that did arrive are taken away again, so a request
      // that could not be completed does not leave half of it lying
      // around.
      for (const id of staged) await deleteStagedUpload(id, guard.user.id);
      return fail(result.reason, 400);
    }
    staged.push(result.upload.id);
    uploads.push(result.upload);
  }

  return NextResponse.json({ uploads }, { status: 201 });
}
