import { IMAGE_TYPES } from "./file-types";
import { EVIDENCE_TYPES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "./evidence";
import { MAX_UPLOAD_BYTES } from "./uploads";

/**
 * What the shop will accept, and how much of it.
 *
 * These are the rules the back office and the customer are both held
 * to, and they are written down in one place so that the ticket the
 * shop hands out and the file the shop finally accepts cannot drift
 * apart.
 */

/** The places a file can be sent from. */
export type UploadTarget = "product-images" | "variant-image" | "evidence";

/** What one file is, as the browser describes it. */
export type TicketFile = {
  name: string;
  type: string;
  size: number;
};

/**
 * The limits for a target.
 *
 * `maxBytes` is the largest a single file may be. The store refuses
 * anything bigger than this on the shop's behalf, so the limit is
 * enforced by the thing that receives the file and not only by the
 * shop afterwards.
 */
export function limitsFor(target: UploadTarget): {
  contentTypes: string[];
  maxBytes: number;
  maxFiles: number;
  /** What the shop calls a file of this kind, in a sentence. */
  label: string;
} {
  switch (target) {
    case "product-images":
    case "variant-image":
      return {
        contentTypes: Object.keys(IMAGE_TYPES),
        maxBytes: MAX_UPLOAD_BYTES,
        maxFiles: 12,
        label: "photograph",
      };
    case "evidence":
      return {
        contentTypes: Object.keys(EVIDENCE_TYPES),
        maxBytes: MAX_VIDEO_BYTES,
        maxFiles: 8,
        label: "file",
      };
  }
}

/**
 * The limit for one file of a known kind.
 *
 * A photograph of evidence is smaller than a video of it, and the
 * limit follows the kind rather than being the largest of the two for
 * everything.
 */
export function limitForKind(mimeType: string | null): number {
  if (mimeType && EVIDENCE_TYPES[mimeType]?.kind === "photo") {
    return MAX_PHOTO_BYTES;
  }
  return MAX_VIDEO_BYTES;
}

/**
 * The extension a file is stored under, from the type it was sent as.
 */
export function extensionForType(type: string): string | null {
  return IMAGE_TYPES[type] ?? EVIDENCE_TYPES[type]?.ext ?? null;
}
