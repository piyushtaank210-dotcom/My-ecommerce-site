import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { saveEvidence, EVIDENCE_ROOT } from "./evidence";
import type { EvidenceKind } from "./return-status";

/**
 * Evidence that has been sent but not yet attached to a request.
 *
 * A customer chooses their photographs and videos and they go straight
 * away, so that the page can show how each file is getting on rather
 * than sitting still until everything has finished. The file waits here
 * until the request is submitted, and is then moved onto the request it
 * belongs to.
 *
 * A file that is never claimed is not kept forever: it is swept away
 * after a day, so that a half-finished form does not leave anything
 * lying around.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);

/** Where files wait before they are attached to a request. */
const STAGING_ROOT = join(process.cwd(), "private", "returns", "_staging");

/** How long an unclaimed file is kept. */
const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A file that has been sent and is waiting.
 */
export type StagedUpload = {
  id: string;
  kind: "photo" | "video";
  evidenceKind: EvidenceKind;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  sha256: string | null;
};

/**
 * Saves a file and records that it is waiting.
 */
export async function stageUpload(input: {
  userId: number | null;
  file: File;
  evidenceKind?: EvidenceKind;
}): Promise<
  | { ok: true; upload: StagedUpload }
  | { ok: false; reason: string }
> {
  const id = `UPL-${randomBytes(8).toString("hex").toUpperCase()}`;

  // The file is written into the customer's own staging folder. It is
  // only moved onto a request once the request exists, and it is only
  // ever read through the authorised route.
  const saved = await saveEvidence(`_staging/${id}`, input.file);
  if (!saved.ok) return { ok: false, reason: saved.reason };

  await getDb()
    .prepare(
      `INSERT INTO return_uploads
         (id, user_id, stored_name, kind, evidence_kind, mime_type, size_bytes, original_name, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.userId,
      saved.storedName,
      saved.kind,
      input.evidenceKind ?? "other",
      saved.mimeType,
      saved.sizeBytes,
      input.file.name || null,
      saved.sha256
    );

  return {
    ok: true,
    upload: {
      id,
      kind: saved.kind,
      evidenceKind: input.evidenceKind ?? "other",
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      originalName: input.file.name || null,
      sha256: saved.sha256,
    },
  };
}

/**
 * Looks at the files that have been sent, without claiming them.
 *
 * The request is checked against what has actually arrived before it is
 * written, so the shop knows what the customer sent before the claim
 * exists.
 */
export async function peekUploads(
  uploadIds: string[],
  userId: number | null
): Promise<(StagedUpload & { storedName: string })[]> {
  if (!uploadIds.length) return [];

  const db = getDb();
  const found: (StagedUpload & { storedName: string })[] = [];

  for (const uploadId of uploadIds) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, stored_name, kind, evidence_kind, mime_type, size_bytes,
                original_name, sha256, return_id
           FROM return_uploads
          WHERE id = ?`
      )
      .get(uploadId)) as Row | undefined;

    if (!row) continue;
    // A file that has already been claimed belongs to another request,
    // and a file that belongs to somebody else is not this customer's.
    if (row.return_id) continue;
    if (userId !== null && num(row.user_id) !== userId) continue;

    found.push({
      id: str(row.id),
      storedName: str(row.stored_name),
      kind: str(row.kind) as "photo" | "video",
      evidenceKind: (str(row.evidence_kind) as EvidenceKind) || "other",
      mimeType: str(row.mime_type),
      sizeBytes: num(row.size_bytes),
      originalName: str(row.original_name),
      sha256: str(row.sha256),
    });
  }

  return found;
}

/**
 * Takes the staged files and moves them onto a request.
 *
 * Only files that belong to the person making the request are taken,
 * and only files that have not already been claimed. The file is moved
 * out of the staging folder and into the folder of the request, so it
 * lives with the claim from that moment on.
 */
export async function claimUploads(input: {
  uploadIds: string[];
  userId: number | null;
  returnId: string;
}): Promise<
  {
    path: string;
    kind: "photo" | "video";
    evidenceKind: EvidenceKind;
    storedName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    originalName: string | null;
    sha256: string | null;
  }[]
> {
  if (!input.uploadIds.length) return [];

  const db = getDb();
  const claimed: ClaimedUpload[] = [];

  for (const uploadId of input.uploadIds) {
    const row = (await db
      .prepare(
        `SELECT id, user_id, stored_name, kind, evidence_kind, mime_type, size_bytes,
                original_name, sha256, return_id
           FROM return_uploads
          WHERE id = ?`
      )
      .get(uploadId)) as Row | undefined;

    if (!row) continue;
    // The file must belong to the person making the request, and it
    // must not already have been attached to one.
    if (row.return_id) continue;
    if (input.userId !== null && num(row.user_id) !== input.userId) continue;

    const storedName = str(row.stored_name);

    // The file moves from the staging folder to the request's folder.
    const from = join(STAGING_ROOT, uploadId, storedName);
    const to = join(
      process.cwd(),
      "private",
      "returns",
      input.returnId.replace(/[^A-Za-z0-9._-]/g, "_"),
      storedName
    );
    try {
      await mkdir(join(to, ".."), { recursive: true });
      await rename(from, to);
    } catch {
      // The file could not be moved. It is still claimed, and it is
      // still fetched from the staging folder, so nothing is lost.
    }

    await db
      .prepare("UPDATE return_uploads SET return_id = ? WHERE id = ?")
      .run(input.returnId, uploadId);

    claimed.push(
      ({
        path: `/uploads/returns/${input.returnId}/${storedName}`,
        kind: str(row.kind) as "photo" | "video",
        evidenceKind: (str(row.evidence_kind) as EvidenceKind) || "other",
        storedName,
        mimeType: str(row.mime_type),
        sizeBytes: num(row.size_bytes),
        originalName: str(row.original_name),
        sha256: str(row.sha256),
      } as ClaimedUpload)
    );
  }

  return claimed;
}

/** A staged file, once it has been attached to a request. */
export type ClaimedUpload = {
  path: string;
  kind: "photo" | "video";
  evidenceKind: EvidenceKind;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  sha256: string | null;
};

/**
 * Removes the files that were never claimed.
 *
 * It is run when the shop starts up, and it only ever removes files
 * that are more than a day old and belong to no request.
 */
export async function sweepStaleUploads(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STAGING_TTL_MS).toISOString();

  const rows = (await db
    .prepare(
      `SELECT id, stored_name FROM return_uploads
        WHERE return_id IS NULL AND created_at < ?`
    )
    .all(cutoff)) as Row[];

  for (const row of rows) {
    try {
      await rm(join(STAGING_ROOT, str(row.id)), { recursive: true, force: true });
    } catch {
      // The file is already gone.
    }
  }

  if (rows.length) {
    await db
      .prepare("DELETE FROM return_uploads WHERE return_id IS NULL AND created_at < ?")
      .run(cutoff);
  }

  // A folder whose row has already gone is left behind by a run that
  // was interrupted. It is swept by its age on disk, so a file a
  // customer is sending right now is never taken from under them.
  try {
    const { readdir, stat } = await import("node:fs/promises");
    const entries = await readdir(STAGING_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const info = await stat(join(STAGING_ROOT, entry.name));
        if (Date.now() - info.mtimeMs < STAGING_TTL_MS) continue;
        await rm(join(STAGING_ROOT, entry.name), { recursive: true, force: true });
      } catch {
        // The folder is already gone.
      }
    }
  } catch {
    // The staging folder is not there, which is the same as being empty.
  }

  return rows.length;
}

/**
 * Removes the files that belong to a claim which is no longer there.
 *
 * A claim is archived rather than deleted, but a test claim and a
 * claim that was taken off the shop altogether both leave their
 * evidence behind. The files are matched against the claims that are
 * still in the database, and anything that does not match is removed.
 */
export async function sweepOrphanedEvidence(): Promise<number> {
  const db = getDb();

  const claims = (await db
    .prepare("SELECT id FROM return_requests")
    .all()) as { id: string }[];
  const live = new Set(claims.map((c) => str(c.id)));

  let removed = 0;
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    const { readdir } = await import("node:fs/promises");
    entries = await readdir(EVIDENCE_ROOT, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // The staging folder is swept by its own rule.
    if (entry.name === "_staging") continue;
    if (live.has(entry.name)) continue;
    try {
      // A folder that was touched recently may be one a customer is
      // sending into right now, so it is left until it is old enough to
      // be certain that nobody is using it.
      const { stat } = await import("node:fs/promises");
      const info = await stat(join(EVIDENCE_ROOT, entry.name));
      if (Date.now() - info.mtimeMs < STAGING_TTL_MS) continue;
      await rm(join(EVIDENCE_ROOT, entry.name), { recursive: true, force: true });
      removed++;
    } catch {
      // The folder is already gone.
    }
  }

  return removed;
}

/**
 * The uploads a customer has waiting, so a page can show them after a
 * refresh.
 */
export async function listStagedUploads(
  userId: number | null
): Promise<StagedUpload[]> {
  if (userId === null) return [];
  const rows = (await getDb()
    .prepare(
      `SELECT id, kind, evidence_kind, mime_type, size_bytes, original_name, sha256
         FROM return_uploads
        WHERE user_id = ? AND return_id IS NULL
        ORDER BY created_at ASC`
    )
    .all(userId)) as Row[];

  return rows.map((r) => ({
    id: str(r.id),
    kind: str(r.kind) as "photo" | "video",
    evidenceKind: (str(r.evidence_kind) as EvidenceKind) || "other",
    mimeType: str(r.mime_type),
    sizeBytes: num(r.size_bytes),
    originalName: str(r.original_name),
    sha256: str(r.sha256),
  }));
}
