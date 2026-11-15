import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { fail, json, requireApiUser } from "@/lib/api";
import { recordStagedUpload } from "@/lib/return-uploads";
import { EVIDENCE_KINDS, type EvidenceKind } from "@/lib/return-status";
import { EVIDENCE_TYPES, FILE_TYPE_MESSAGE, readEvidenceBytes } from "@/lib/evidence";
import { sniffFileType } from "@/lib/file-types";
import {
  canSignClientUploads,
  evidenceAccess,
  evidenceStoreToken,
  headObject,
  storageUnavailableReason,
  usingBlob,
} from "@/lib/storage";
import { extensionForType, limitForKind, limitsFor } from "@/lib/upload-tickets";

/**
 * A customer's evidence.
 *
 * The photographs and videos a customer sends with a return or a
 * replacement are private to them and to the back office. They are
 * kept outside the public folder, and they are fetched through a route
 * that checks who is asking.
 *
 * Where they are kept depends on where the shop is running. On a
 * machine it is a folder on the disk. On a serverless deployment the
 * disk cannot be written to, and a request that carries a video is
 * itself too large to be accepted — so the file goes straight to the
 * shop's store and the shop is told afterwards that it arrived.
 *
 * The three steps are:
 *
 *   1. ticket — the shop says where the file should go.
 *   2. the file goes there, and the store signs the upload.
 *   3. commit — the shop checks the file is really there, works out
 *      what it really is from its own bytes, and writes down that it
 *      has arrived.
 *
 * A file that does not get as far as the third step is swept away a
 * day later, so a half-finished form leaves nothing lying around.
 */

type TicketFile = { name: string; type: string; size: number };
type CommittedFile = {
  pathname: string;
  url: string;
  name: string;
  type: string;
  size: number;
  uploadId: string;
  evidenceKind?: string;
};

export async function POST(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  // The store's own request for a signed upload.
  if (body.type === "blob.generate-client-token") {
    return signUpload(request, body);
  }

  const phase = String(body.phase ?? "");
  if (phase === "ticket") return ticket(body);
  if (phase === "commit") return commit(body, guard.user.id);

  return fail("That is not something the shop can be asked to do.", 400);
}

/**
 * The kind of evidence the customer is sending.
 */
function evidenceKindFrom(raw: unknown): EvidenceKind {
  const value = String(raw ?? "other");
  return (EVIDENCE_KINDS as readonly string[]).includes(value)
    ? (value as EvidenceKind)
    : "other";
}

/**
 * The first half of an upload: where the files should go.
 */
async function ticket(body: Record<string, unknown>) {
  const unavailable = storageUnavailableReason();
  if (unavailable) return fail(unavailable, 503);

  const limits = limitsFor("evidence");
  const files = Array.isArray(body.files) ? (body.files as TicketFile[]) : [];
  const evidenceKind = evidenceKindFrom(body.evidenceKind);

  if (!files.length) return fail("Choose at least one file.", 400);
  if (files.length > limits.maxFiles) {
    return fail(`Choose at most ${limits.maxFiles} files at a time.`, 400);
  }

  // On a machine the file goes to the shop, which keeps it.
  if (!usingBlob() || !canSignClientUploads("private")) {
    return json({ mode: "app", endpoint: "/api/returns/evidence" });
  }

  const uploads: {
    index: number;
    pathname: string;
    uploadId: string;
    name: string;
    type: string;
    size: number;
    evidenceKind: EvidenceKind;
  }[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const name = String(file?.name ?? "").trim();
    const type = String(file?.type ?? "").trim();
    const size = Number(file?.size ?? 0);

    if (!limits.contentTypes.includes(type)) {
      return fail(
        `"${name || "That file"}" is not a photograph or a video we can play. ${FILE_TYPE_MESSAGE}`,
        415
      );
    }
    if (!Number.isFinite(size) || size <= 0) {
      return fail(`"${name || "That file"}" is empty.`, 400);
    }
    const limit = limitForKind(type);
    if (size > limit) {
      const mb = Math.round(limit / (1024 * 1024));
      return fail(
        `"${name}" is over ${mb}MB. Please send a smaller file.`,
        413
      );
    }

    const ext = extensionForType(type);
    if (!ext) {
      return fail(
        `"${name || "That file"}" is not a photograph or a video we can play. ${FILE_TYPE_MESSAGE}`,
        415
      );
    }

    const uploadId = `UPL-${randomBytes(8).toString("hex").toUpperCase()}`;
    uploads.push({
      index,
      pathname: `returns/_staging/${uploadId}/${Date.now()}-${randomBytes(8).toString("hex")}${ext}`,
      uploadId,
      name: name || `evidence${ext}`,
      type,
      size,
      evidenceKind,
    });
  }

  return json({
    mode: "direct",
    access: evidenceAccess(),
    tokenUrl: "/api/returns/uploads",
    uploads,
  });
}

/**
 * The store's request for a signed upload.
 *
 * The shop checks where the file is going before it signs it. The file
 * must be going into the staging folder of an upload the shop itself
 * named, and nowhere else.
 */
async function signUpload(request: Request, body: Record<string, unknown>) {
  const unavailable = storageUnavailableReason();
  if (unavailable) return fail(unavailable, 503);

  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const pathname = String(payload.pathname ?? "");
  const clientPayload = String(payload.clientPayload ?? "");

  let uploadId = "";
  let evidenceKind: EvidenceKind = "other";
  try {
    const parsed = JSON.parse(clientPayload) as Record<string, unknown>;
    uploadId = String(parsed.uploadId ?? "");
    evidenceKind = evidenceKindFrom(parsed.evidenceKind);
  } catch {
    return fail("That upload was not asked for properly.", 400);
  }

  if (!/^UPL-[0-9A-F]{16}$/.test(uploadId)) {
    return fail("That upload was not asked for properly.", 400);
  }
  if (!pathname.startsWith(`returns/_staging/${uploadId}/`) || pathname.includes("..")) {
    return fail("That upload was not asked for properly.", 400);
  }

  const ext = pathname.slice(pathname.lastIndexOf("."));
  if (!Object.values(EVIDENCE_TYPES).some((t) => t.ext === ext)) {
    return fail("That upload was not asked for properly.", 400);
  }

  const limits = limitsFor("evidence");

  try {
    const { handleUpload } = await import("@vercel/blob/client");
    const result = await handleUpload({
      // The evidence is signed with the evidence store's own token, so
      // it lands in the store the shop made for it — and not in the
      // store that holds the pictures.
      token: evidenceStoreToken(),
      body: body as never,
      request,
      onBeforeGenerateToken: async (asked) => {
        if (asked !== pathname) {
          throw new Error("That upload was not asked for properly.");
        }
        return {
          allowedContentTypes: limits.contentTypes,
          maximumSizeInBytes: limits.maxBytes,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "The upload could not be signed for.",
      400
    );
  }
}

/**
 * The second half of an upload: the files have arrived.
 *
 * The shop checks that each file is really there and works out what it
 * really is from its own bytes, and only then writes down that it has
 * arrived.
 */
async function commit(body: Record<string, unknown>, userId: number) {
  const uploads = Array.isArray(body.uploads)
    ? (body.uploads as CommittedFile[])
    : [];
  if (!uploads.length) return fail("No files were sent.", 400);

  const staged = [];

  for (const upload of uploads) {
    const pathname = String(upload?.pathname ?? "");
    const uploadId = String(upload?.uploadId ?? "");
    const name = String(upload?.name ?? "").trim();

    if (!/^UPL-[0-9A-F]{16}$/.test(uploadId)) {
      return fail("That file was not sent to the right place.", 400);
    }
    if (
      !pathname.startsWith(`returns/_staging/${uploadId}/`) ||
      pathname.includes("..")
    ) {
      return fail("That file was not sent to the right place.", 400);
    }

    const storedName = pathname.slice(pathname.lastIndexOf("/") + 1);
    if (!storedName) return fail("That file was not sent to the right place.", 400);

    const info = await headObject(pathname, evidenceAccess());
    if (!info) {
      return fail("One of the files did not arrive. Please try again.", 502);
    }

    // What the file really is, read from its own bytes.
    const bytes = await readEvidenceBytes(
      `_staging/${uploadId}`,
      storedName
    );
    const sniffed = bytes ? sniffFileType(bytes) : null;
    if (sniffed && !EVIDENCE_TYPES[sniffed]) {
      return fail(
        `"${name || "That file"}" is not a photograph or a video we can play. ${FILE_TYPE_MESSAGE}`,
        415
      );
    }
    const mimeType = sniffed ?? info.contentType ?? String(upload?.type ?? "");
    if (!EVIDENCE_TYPES[mimeType]) {
      return fail(
        `"${name || "That file"}" is not a photograph or a video we can play. ${FILE_TYPE_MESSAGE}`,
        415
      );
    }

    const kind = EVIDENCE_TYPES[mimeType].kind;
    const sizeBytes = info.sizeBytes;
    if (sizeBytes > limitForKind(mimeType)) {
      const mb = Math.round(limitForKind(mimeType) / (1024 * 1024));
      return fail(`"${name}" is over ${mb}MB. Please send a smaller file.`, 413);
    }

    const recorded = await recordStagedUpload({
      id: uploadId,
      userId,
      storedName,
      kind,
      evidenceKind: evidenceKindFrom(upload?.evidenceKind),
      mimeType,
      sizeBytes,
      originalName: name || null,
      sha256: null,
    });
    if (!recorded.ok) return fail(recorded.reason, 409);

    staged.push(recorded.upload);
  }

  return NextResponse.json({ uploads: staged }, { status: 201 });
}
