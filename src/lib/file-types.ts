/**
 * What a file really is.
 *
 * A browser says a file is a JPEG. A browser is usually right, but it
 * is a piece of software on the other end of a wire and it can be
 * wrong — on purpose. So the shop reads the first few bytes of every
 * file it is given and decides from those, and the name the file
 * arrived with never decides anything.
 *
 * The first few bytes of every format the shop accepts are enough to
 * tell them apart. A file that matches none of them is not a
 * photograph or a video the shop can play, and it is refused.
 */

/** The kinds of picture the store accepts, and the name it gives them. */
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

/** The kinds of video the store accepts as evidence. */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

/**
 * The type of a file, read from its own bytes.
 *
 * Returns nothing for a file that is none of the ones the shop takes.
 */
export function sniffFileType(bytes: Uint8Array): string | null {
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

  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
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

  // ISO base media, which is what MP4, MOV and AVIF are: "ftyp" at
  // offset 4.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith("qt")) return "video/quicktime";
    if (brand === "avif" || brand === "avis") return "image/avif";
    return "video/mp4";
  }

  return null;
}

/**
 * The extension a type is stored under.
 *
 * It comes from the type that was read from the bytes, so a file that
 * says it is a PNG and is not one is refused before it is given a name.
 */
export function extensionFor(mimeType: string): string | null {
  return IMAGE_TYPES[mimeType] ?? VIDEO_TYPES[mimeType] ?? null;
}

/**
 * Whether a type is one the shop takes as a photograph.
 */
export function isImageType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && IMAGE_TYPES[mimeType]);
}

/**
 * Whether a type is one the shop takes as a video.
 */
export function isVideoType(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && VIDEO_TYPES[mimeType]);
}
