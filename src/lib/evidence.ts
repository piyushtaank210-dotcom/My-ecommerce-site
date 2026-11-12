import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";

/**
 * The evidence a customer sends with a claim.
 *
 * Evidence is private. It is written outside the public folder and is
 * fetched through a route that checks who is asking: a member of the
 * back office, or the customer the claim belongs to. Nothing else can
 * read it, and no URL points at it directly.
 *
 * What a file is is decided by reading its own bytes, not by what the
 * browser said it was. A file that says it is a photograph but is
 * something else is refused, and the name it arrived with never becomes
 * a path.
 */

/** Where the private evidence lives. */
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
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // Matroska and WebM: 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  // ISO base media, which is what MP4 and MOV are: "ftyp" at offset 4.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }

  return null;
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

  // The claim's own folder, and a name of our own making inside it.
  const dir = join(EVIDENCE_ROOT, ...safeFolder(inputFolder));
  await mkdir(dir, { recursive: true });

  const storedName = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  await writeFile(join(dir, storedName), bytes);

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
 * Reads a file from the private store.
 *
 * It returns nothing rather than an error when the file is not there:
 * a missing file is not a fault worth stopping for.
 *
 * The path is read through a function the bundler cannot follow, so the
 * whole project is not traced into the deployment for the sake of one
 * file.
 */
export async function readEvidenceFile(
  folder: string,
  storedName: string
): Promise<Buffer | null> {
  const full = evidenceFilePath(folder, storedName);
  if (!full) return null;
  try {
    return await readAt(full);
  } catch {
    return null;
  }
}

/**
 * Reads a file at a path that is worked out at run time.
 *
 * The bundler cannot see where the path points, and so it does not drag
 * the whole project into the deployment looking for it.
 */
const readAt = (path: string): Promise<Buffer> => readFile(path);

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
      return await readFile(full);
    } catch {
      return null;
    }
  }
  return null;
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
