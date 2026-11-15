import { rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { saveEvidence, EVIDENCE_ROOT, evidenceKey } from "./evidence";
import { deleteObject, evidenceAccess, listObjects, moveObject, usingBlob } from "./storage";
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
 * Takes a staged file away.
 *
 * It is used when a batch of files could not be completed: the ones
 * that did arrive are removed so that a request that was never made
 * does not leave half of it behind.
 */
export async function deleteStagedUpload(
  id: string,
  userId: number | null
): Promise<void> {
  const db = getDb();
  const row = (await db
    .prepare(
      `SELECT user_id, stored_name FROM return_uploads
        WHERE id = ? AND return_id IS NULL`
    )
    .get(id)) as Row | undefined;

  if (!row) return;
  if (userId !== null && num(row.user_id) !== userId) return;

  await deleteObject(
    evidenceKey(`_staging/${id}`, str(row.stored_name)),
    evidenceAccess()
  );
  await db.prepare("DELETE FROM return_uploads WHERE id = ?").run(id);
}

/**
 * Records a file that has already been sent to the shop's store.
 *
 * This is the second half of an upload that went straight to the store:
 * the file is there, and all that is left is to write down that it
 * arrived and what it is.
 */
export async function recordStagedUpload(input: {
  id: string;
  userId: number | null;
  storedName: string;
  kind: "photo" | "video";
  evidenceKind: EvidenceKind;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  sha256: string | null;
}): Promise<
  | { ok: true; upload: StagedUpload }
  | { ok: false; reason: string }
> {
  const db = getDb();

  const existing = await db
    .prepare("SELECT id FROM return_uploads WHERE id = ?")
    .get(input.id);
  if (existing) {
    return { ok: false, reason: "That file has already been sent." };
  }

  await db
    .prepare(
      `INSERT INTO return_uploads
         (id, user_id, stored_name, kind, evidence_kind, mime_type, size_bytes, original_name, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.userId,
      input.storedName,
      input.kind,
      input.evidenceKind,
      input.mimeType,
      input.sizeBytes,
      input.originalName,
      input.sha256
    );

  return {
    ok: true,
    upload: {
      id: input.id,
      kind: input.kind,
      evidenceKind: input.evidenceKind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalName: input.originalName,
      sha256: input.sha256,
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
    const moved = await moveObject(
      evidenceKey(`_staging/${uploadId}`, storedName),
      evidenceKey(input.returnId, storedName),
      evidenceAccess()
    );
    if (!moved) {
      // The file could not be moved. It is still claimed, and the shop
      // looks for it in the staging folder when it is served, so nothing
      // is lost.
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
    await removeStagedFolder(str(row.id));
  }

  if (rows.length) {
    await db
      .prepare("DELETE FROM return_uploads WHERE return_id IS NULL AND created_at < ?")
      .run(cutoff);
  }

  // A folder whose row has already gone is left behind by a run that
  // was interrupted. It is swept by its age, so a file a customer is
  // sending right now is never taken from under them.
  for (const folder of await evidenceFolders("returns/_staging/")) {
    await removeStagedFolder(folder.name);
  }

  return rows.length;
}

/**
 * Removes everything a staged upload left behind.
 *
 * On the disk it is a folder under the staging area; in the shop's
 * store it is the files under the same name.
 */
async function removeStagedFolder(uploadId: string): Promise<void> {
  const folder = `returns/_staging/${uploadId}`;
  for (const file of await listObjects(folder, evidenceAccess())) {
    await deleteObject(file.key, evidenceAccess());
  }
  if (!usingBlob()) {
    try {
      await rm(join(STAGING_ROOT, uploadId), { recursive: true, force: true });
    } catch {
      // The folder is already gone.
    }
  }
}

/**
 * The folders the evidence store holds, and when each was last touched.
 *
 * It is how the sweeps find evidence nobody claimed, and it works the
 * same way on the disk and in the shop's store. The prefix says which
 * part of the store to look at: `returns/` for the claims themselves,
 * `returns/_staging/` for the files waiting to be attached to one.
 */
async function evidenceFolders(
  prefix: string
): Promise<{ name: string; touchedAt: number }[]> {
  const root = prefix.replace(/^returns\//, "").replace(/\/+$/, "");

  if (!usingBlob()) {
    try {
      const { readdir, stat } = await import("node:fs/promises");
      const dir = join(EVIDENCE_ROOT, ...root.split("/").filter(Boolean));
      const entries = await readdir(dir, { withFileTypes: true });
      const out: { name: string; touchedAt: number }[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const info = await stat(join(dir, entry.name)).catch(() => null);
        out.push({ name: entry.name, touchedAt: info?.mtimeMs ?? 0 });
      }
      return out;
    } catch {
      return [];
    }
  }

  const files = await listObjects(prefix, evidenceAccess());
  const folders = new Map<string, number>();
  for (const file of files) {
    const rest = file.key.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) continue;
    const name = rest.slice(0, slash);
    const seen = folders.get(name) ?? 0;
    if (file.uploadedAt > seen) folders.set(name, file.uploadedAt);
  }
  return [...folders.entries()].map(([name, touchedAt]) => ({
    name,
    touchedAt,
  }));
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

  for (const folder of await evidenceFolders("returns/")) {
    // The staging folder is swept by its own rule.
    if (folder.name === "_staging") continue;
    if (live.has(folder.name)) continue;
    // A folder that was touched recently may be one a customer is
    // sending into right now, so it is left until it is old enough to
    // be certain that nobody is using it.
    if (Date.now() - folder.touchedAt < STAGING_TTL_MS) continue;
    for (const file of await listObjects(`returns/${folder.name}`, evidenceAccess())) {
      await deleteObject(file.key, evidenceAccess());
    }
    if (!usingBlob()) {
      try {
        await rm(join(EVIDENCE_ROOT, folder.name), {
          recursive: true,
          force: true,
        });
      } catch {
        // The folder is already gone.
      }
    }
    removed++;
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
