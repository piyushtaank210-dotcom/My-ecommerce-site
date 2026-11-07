import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Uploading a photograph.
 *
 * The file is written to public/uploads/<folder>/ with a name of our own
 * making. The name that came with the upload is never used as a path, so
 * nothing a browser sends can decide where a file lands.
 */

/** The kinds of picture the store accepts. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

/**
 * The kinds of video the store accepts as evidence.
 *
 * An unboxing video is the one piece of evidence that cannot be replaced
 * by a photograph — it shows the box being opened — so it is accepted
 * here and kept apart from the photographs.
 */
export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

/** How big a photograph may be. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How big a video may be. */
export const MAX_VIDEO_UPLOAD_BYTES = 60 * 1024 * 1024;

/** Where uploaded photographs are kept. */
export const UPLOAD_ROOT = join(process.cwd(), "public", "uploads");

/**
 * True when a photograph belongs to a product's own upload folder.
 *
 * A copy of a product carries the original's photographs, and their paths
 * are the original's — so a copy's photographs are not its own, and
 * deleting the copy must not take them off the shelf.
 */
export function isOwnUpload(path: string, slug: string): boolean {
  return path.startsWith(`/uploads/${slug}/`);
}

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/**
 * Saves one photograph and returns the path it will be served from.
 */
export async function saveUpload(
  folder: string,
  file: File
): Promise<UploadResult> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    return {
      ok: false,
      reason: `${
        file.name || "That file"
      } is not a photograph. Use a JPEG, PNG, WebP, GIF or AVIF file.`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `${
        file.name || "That file"
      } is too big. A photograph may be up to 8 MB.`,
    };
  }

  return writeUpload(folder, file, ext);
}

/**
 * Saves one video and returns the path it will be served from.
 */
export async function saveVideoUpload(
  folder: string,
  file: File
): Promise<UploadResult> {
  const ext = ALLOWED_VIDEO_TYPES[file.type];
  if (!ext) {
    return {
      ok: false,
      reason: `${
        file.name || "That file"
      } is not a video we can play. Use an MP4, WebM or MOV file.`,
    };
  }
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `${
        file.name || "That file"
      } is too big. A video may be up to 60 MB.`,
    };
  }

  return writeUpload(folder, file, ext);
}

/**
 * Writes the file out under a name of our own making.
 *
 * The name that came with the upload is never used as a path, so nothing
 * a browser sends can decide where a file lands.
 */
async function writeUpload(
  folder: string,
  file: File,
  ext: string
): Promise<UploadResult> {
  const dir = join(UPLOAD_ROOT, folder);
  await mkdir(dir, { recursive: true });

  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, name), bytes);

  return { ok: true, path: `/uploads/${folder}/${name}` };
}
