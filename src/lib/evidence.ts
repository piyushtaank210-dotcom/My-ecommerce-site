import { join, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  evidenceAccess,
  getObject,
  getObjectStream,
  headBytes,
  putObject,
  PRIVATE_FOLDER,
} from "./storage";
import { sniffFileType } from "./file-types";

/**
 * The evidence a customer sends with a claim.
 *
 * Evidence is private. It is kept outside the public folder — or, on a
 * serverless deployment, in a store that only the shop can read — and
 * is fetched through a route that checks who is asking: a member of the
 * back office, or the customer the claim belongs to. Nothing else can
 * read it, and no URL points at it directly.
 *
 * What a file is is decided by reading its own bytes, not by what the
 * browser said it was. A file that says it is a photograph but is
 * something else is refused, and the name it arrived with never becomes
 * a path.
 */

/** Where the private evidence lives, on a machine. */
export const EVIDENCE_ROOT = join(process.cwd(), "private", "returns");

/** How big a photograph may be. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** How big a video may be. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/** How many photographs a claim may carry. */
export const MAX_PHOTOS = 6;

/** How many videos a claim may carry. */
export const MAX_VIDEOS = 2;

/**
 * The kinds of file that may be sent, and what the shop calls each of
 * them.
 */
export const EVIDENCE_TYPES: Record<string, { ext: string; kind: "photo" | "video" }> = {
  "image/jpeg": { ext: ".jpg", kind: "photo" },
  "image/png": { ext: ".png", kind: "photo" },
  "image/webp": { ext: ".webp", kind: "photo" },
  "video/mp4": { ext: ".mp4", kind: "video" },
  "video/webm": { ext: ".webm", kind: "video" },
  "video/quicktime": { ext: ".mov", kind: "video" },
};

/**
 * What the shop tells the customer when a file is refused.
 */
export const FILE_TYPE_MESSAGE =
  "Use JPG, PNG or WebP for a photograph, and MP4, WebM or MOV for a video.";

/**
 * What the file really is.
 *
 * The bytes are read, not the name and not the type the browser sent.
 * The first few bytes of every format the shop accepts are enough to
 * tell them apart, and a file that matches none of them is not a
 * photograph or a video the shop can play.
 */
export function sniffEvidenceType(bytes: Uint8Array): string | null {
  return sniffFileType(bytes);
}

/**
 * What was saved.
 */
export type SavedEvidence = {
  ok: true;
  /** The name of the file in the private store. */
  storedName: string;
  /** What the file really is. */
  mimeType: string;
  /** Whether it is a photograph or a video. */
  kind: "photo" | "video";
  /** How big it is. */
  sizeBytes: number;
  /** A fingerprint of the bytes. */
  sha256: string;
};

export type EvidenceError = {
  ok: false;
  reason: string;
};

/**
 * The key a piece of evidence is kept under.
 *
 * The folder is the claim's own folder, and the name is the one the
 * shop gave the file.
 */
export function evidenceKey(folder: string, storedName: string): string {
  return `${PRIVATE_FOLDER}/${folder}/${storedName}`;
}

/**
 * Saves one file as evidence.
 *
 * The name it is given is made here, out of the shop's own words: the
 * claim it belongs to, and a random string. The name the file arrived
 * with is kept beside it as a label, but it never decides where the
 * file is written.
 */
export async function saveEvidence(
  inputFolder: string,
  file: File
): Promise<SavedEvidence | EvidenceError> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return { ok: false, reason: "That file is empty." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffEvidenceType(bytes);

  if (!mimeType || !EVIDENCE_TYPES[mimeType]) {
    return {
      ok: false,
      reason: `"${file.name || "That file"}" is not a photograph or a video we can play. ${FILE_TYPE_MESSAGE}`,
    };
  }

  const { ext, kind } = EVIDENCE_TYPES[mimeType];
  const limit = kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (bytes.length > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return {
      ok: false,
      reason: `"${file.name || "That file"}" is over ${mb}MB. Please send a smaller file.`,
    };
  }

  const storedName = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;

  const saved = await putObject({
    key: evidenceKey(inputFolder, storedName),
    body: bytes,
    contentType: mimeType,
    access: evidenceAccess(),
  });

  if (!saved.ok) return { ok: false, reason: saved.reason };

  return {
    ok: true,
    storedName,
    mimeType,
    kind,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/**
 * Makes a string safe to be one part of a path.
 *
 * A claim id is made by the shop, but a name that came from anywhere
 * else is stripped of everything that could step outside its folder.
 */
function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "unknown";
}

/**
 * Splits a folder into parts that are each safe to be a path of their
 * own.
 *
 * A folder may be more than one part deep — a file waiting to be
 * attached to a request sits in a folder of its own — and each part is
 * cleaned on its own so that nothing can step outside the store.
 */
function safeFolder(folder: string): string[] {
  return folder
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(safeSegment);
}

/**
 * The full path of a file in the private store.
 *
 * The name is checked against the folder it must be in, so that a name
 * that has been tampered with cannot reach another claim's folder or
 * anything outside the store.
 */
export function evidenceFilePath(
  folder: string,
  storedName: string
): string | null {
  const safe = safeSegment(storedName);
  if (safe !== storedName) return null;
  const root = resolve(EVIDENCE_ROOT);
  const full = resolve(join(root, ...safeFolder(folder), safe));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

/**
 * The legacy path of a piece of evidence.
 *
 * Evidence used to be written into the public folder, and those files
 * are still there. They are read from there, and they are still fetched
 * through the same authorised route — the route checks who is asking
 * whether the file is in the new place or the old one.
 */
export function legacyEvidencePath(path: string): string | null {
  if (!path.startsWith("/uploads/")) return null;
  const root = resolve(join(process.cwd(), "public"));
  const full = resolve(join(root, path.replace(/^\/+/, "")));
  if (!full.startsWith(root + sep)) return null;
  return full;
}

/**
 * Reads a file from the private store.
 *
 * It returns nothing rather than an error when the file is not there:
 * a missing file is not a fault worth stopping for.
 */
export async function readEvidenceFile(
  folder: string,
  storedName: string
): Promise<Buffer | null> {
  if (safeSegment(storedName) !== storedName) return null;
  return getObject(evidenceKey(safeFolder(folder).join("/"), storedName), evidenceAccess());
}

/**
 * Reads a piece of evidence as a stream.
 *
 * A video is a large thing to be fetched, and the shop does not hold it
 * in memory to hand it over: it is passed along as it is read.
 */
export async function readEvidenceStream(
  folder: string,
  storedName: string | null,
  legacyPath: string | null
): Promise<{
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number | null;
} | null> {
  if (storedName) {
    if (safeSegment(storedName) !== storedName) return null;
    const found = await getObjectStream(
      evidenceKey(safeFolder(folder).join("/"), storedName),
      evidenceAccess()
    );
    if (found) return found;
  }
  if (legacyPath) {
    const full = legacyEvidencePath(legacyPath);
    if (!full) return null;
    try {
      const { createReadStream } = await import("node:fs");
      const { stat } = await import("node:fs/promises");
      const { Readable } = await import("node:stream");
      const info = await stat(full);
      const web = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
      return { stream: web, sizeBytes: info.size };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Reads a piece of evidence, wherever it is kept.
 *
 * The folder is the claim's own folder, and the name is the one the
 * shop gave the file. Both are checked, so neither can be used to
 * reach a file that belongs to somebody else.
 */
export async function readEvidence(
  folder: string,
  storedName: string | null,
  legacyPath: string | null
): Promise<Buffer | null> {
  if (storedName) {
    const bytes = await readEvidenceFile(folder, storedName);
    if (bytes) return bytes;
  }
  if (legacyPath) {
    const full = legacyEvidencePath(legacyPath);
    if (!full) return null;
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(full);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The first few bytes of a piece of evidence.
 *
 * It is how the shop checks what a file really is when the browser has
 * sent it on its own, straight to the store: the name it arrived with
 * says nothing, but the bytes do.
 */
export async function readEvidenceBytes(
  folder: string,
  storedName: string
): Promise<Uint8Array | null> {
  if (safeSegment(storedName) !== storedName) return null;
  return headBytes(
    evidenceKey(safeFolder(folder).join("/"), storedName),
    evidenceAccess()
  );
}

/**
 * The content type a file is served with.
 *
 * It comes from what the shop recorded when the file was saved, not
 * from what the browser said, and it is never taken from a path.
 */
export function contentTypeFor(storedName: string | null, mimeType: string | null): string {
  if (mimeType && EVIDENCE_TYPES[mimeType]) return mimeType;
  if (!storedName) return "application/octet-stream";
  const lower = storedName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}
