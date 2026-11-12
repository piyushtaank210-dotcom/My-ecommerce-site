import { NextResponse } from "next/server";
import { fail, requireApiUser } from "@/lib/api";
import { stageUpload } from "@/lib/return-uploads";
import { EVIDENCE_KINDS, type EvidenceKind } from "@/lib/return-status";

/**
 * POST /api/returns/evidence
 *
 * Sends evidence up, before the request itself is submitted.
 *
 * The customer picks their photographs and videos and they go straight
 * away, so the page can show how each file is getting on. The files
 * wait until the request is submitted, and are then attached to it.
 */
export async function POST(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

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

  const rawKind = String(form.get("evidenceKind") ?? "other");
  const evidenceKind: EvidenceKind = (EVIDENCE_KINDS as readonly string[]).includes(
    rawKind
  )
    ? (rawKind as EvidenceKind)
    : "other";

  const uploads = [];
  for (const file of files) {
    const result = await stageUpload({
      userId: guard.user.id,
      file,
      evidenceKind,
    });
    if (!result.ok) return fail(result.reason, 400);
    uploads.push(result.upload);
  }

  return NextResponse.json({ uploads }, { status: 201 });
}
