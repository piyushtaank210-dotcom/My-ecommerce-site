import { join } from "node:path";
import {
  deleteObject,
  isBlobUrl,
  keyFromBlobUrl,
  putObject,
  PUBLIC_FOLDER,
  usingBlob,
} from "./storage";
import {
  IMAGE_TYPES,
  VIDEO_TYPES,
  extensionFor,
  sniffFileType,
} from "./file-types";

/**
 * Uploading a photograph.
 *
 * The file is written under a name of our own making. The name that
 * came with the upload is never used as a path, so nothing a browser
 * sends can decide where a file lands.
 *
 * Where it lands depends on where the shop is running: on a machine it
 * is a file in `public/uploads/`, and on a serverless deployment it is
 * a file in the shop's store. Either way the shop gets back an address
 * it can put in the database and show the picture from.
 */

/** The kinds of picture the store accepts. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = IMAGE_TYPES;

/**
 * The kinds of video the store accepts as evidence.
 *
 * An unboxing video is the one piece of evidence that cannot be replaced
 * by a photograph — it shows the box being opened — so it is accepted
 * here and kept apart from the photographs.
 */
export const ALLOWED_VIDEO_TYPES: Record<string, string> = VIDEO_TYPES;

/** How big a photograph may be. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How big a video may be. */
export const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;

/**
 * Where uploaded photographs are kept, on a machine.
 *
 * On a serverless deployment this folder cannot be written to at all,
 * and the shop keeps its pictures in its store instead — see
 * `src/lib/storage.ts`.
 */
export const UPLOAD_ROOT = join(process.cwd(), "public", "uploads");

/**
 * The folder a product's own photographs live in.
 *
 * It is the same for the disk and for the store, so a picture that was
 * uploaded on a machine and a picture that was uploaded on a
 * deployment sit side by side in the same folder.
 */
export function productImageFolder(slug: string): string {
  return `${PUBLIC_FOLDER}/${safeSegment(slug)}`;
}

/** The folder a product's options' photographs live in. */
export function variantImageFolder(slug: string): string {
  return `${productImageFolder(slug)}/variants`;
}

/**
 * A name of the shop's own making.
 *
 * The time it was made and a string of nothing but chance. Nothing
 * about it comes from the browser.
 */
export function uploadName(ext: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

/**
 * Makes a string safe to be one part of a path.
 */
export function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "unknown";
}

/**
 * True when a photograph belongs to a product's own upload folder.
 *
 * A copy of a product carries the original's photographs, and their paths
 * are the original's — so a copy's photographs are not its own, and
 * deleting the copy must not take them off the shelf.
 *
 * The shop's store puts an address in front of the folder, so a
 * photograph kept there is checked against the folder inside that
 * address.
 */
export function isOwnUpload(path: string, slug: string): boolean {
  if (isBlobUrl(path)) {
    const key = keyFromBlobUrl(path);
    if (!key) return false;
    return key.startsWith(`${productImageFolder(slug)}/`);
  }
  return path.startsWith(`/uploads/${safeSegment(slug)}/`);
}

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/**
 * Saves one photograph and returns the path it will be served from.
 *
 * What the file really is is read from its own bytes, not from the name
 * it arrived with and not from the type the browser claimed.
 */
export async function saveUpload(
  folder: string,
  file: File
): Promise<UploadResult> {
  return saveFile(folder, file, IMAGE_TYPES, MAX_UPLOAD_BYTES, "photograph");
}

/**
 * Saves one video and returns the path it will be served from.
 */
export async function saveVideoUpload(
  folder: string,
  file: File
): Promise<UploadResult> {
  return saveFile(folder, file, VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES, "video");
}

/**
 * Saves one file, having checked what it is and how big it is.
 */
async function saveFile(
  folder: string,
  file: File,
  allowed: Record<string, string>,
  limit: number,
  word: "photograph" | "video"
): Promise<UploadResult> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return { ok: false, reason: "That file is empty." };
  }

  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return {
      ok: false,
      reason: `"${file.name || "That file"}" is too big. A ${word} may be up to ${mb} MB.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffFileType(bytes);
  const ext = sniffed ? extensionFor(sniffed) : null;

  if (!sniffed || !ext || !allowed[sniffed]) {
    return {
      ok: false,
      reason: `"${file.name || "That file"}" is not a ${
        word === "photograph" ? "photograph" : "video"
      } we can use. ${
        word === "photograph"
          ? "Use a JPEG, PNG, WebP, GIF or AVIF file."
          : "Use an MP4, WebM or MOV file."
      }`,
    };
  }

  const key = `${folder.replace(/^\/+|\/+$/g, "")}/${uploadName(ext)}`;
  const saved = await putObject({
    key,
    body: bytes,
    contentType: sniffed,
    access: "public",
  });

  if (!saved.ok) return { ok: false, reason: saved.reason };
  return { ok: true, path: saved.url ?? `/${key}` };
}

/**
 * Removes an uploaded photograph.
 *
 * It works out where the photograph lives from the address that was
 * saved, so a picture on the disk and a picture in the shop's store are
 * both removed properly. A photograph that is not the product's own is
 * left alone.
 */
export async function deleteUpload(path: string, slug: string): Promise<void> {
  if (!isOwnUpload(path, slug)) return;

  if (isBlobUrl(path)) {
    const key = keyFromBlobUrl(path);
    if (key) await deleteObject(key, "public");
    return;
  }

  // On the disk the address is `/uploads/...` and the file is under
  // `public/`.
  await deleteObject(path.replace(/^\/+/, ""), "public");
}

/**
 * Whether the shop is keeping its files in its store.
 *
 * The back office asks this before it sends a file: when the shop is
 * on a serverless deployment the file has to go straight to the store
 * rather than through the shop, because the shop cannot hold it.
 */
export function uploadsAreRemote(): boolean {
  return usingBlob();
}
