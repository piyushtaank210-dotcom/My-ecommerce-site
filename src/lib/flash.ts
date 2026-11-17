/**
 * The little message the shop leaves for the next page.
 *
 * A server action cannot raise a toast — the toast lives in the browser —
 * so a message that has to survive a redirect is written down in a
 * cookie, and the page it lands on reads it and shows it.
 *
 * Nothing here reaches the database or the server, so the browser may
 * read it too.
 */

/** The cookie the message is written in. */
export const FLASH_COOKIE = "pf_flash";

export type FlashKind = "success" | "error" | "info";

export type Flash = {
  message: string;
  kind: FlashKind;
};

/**
 * The message, as it goes into the cookie.
 *
 * It is not encoded here: the cookie store does that itself, and doing it
 * twice would leave the browser holding something that cannot be read
 * back.
 */
export function encodeFlash(flash: Flash): string {
  return JSON.stringify(flash);
}

/**
 * The message in the cookie, if there is one.
 *
 * A cookie that has been tampered with, or that is not a message at all,
 * is ignored rather than shown: it is only ever a sentence on the screen.
 */
export function decodeFlash(raw: string | undefined): Flash | null {
  if (!raw) return null;

  // The browser hands the value back as it was stored, which is the
  // encoded form. It may also have been decoded already.
  const candidates = [tryDecode(raw), raw];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<Flash>;
      if (typeof parsed.message !== "string" || !parsed.message) continue;
      const kind: FlashKind =
        parsed.kind === "error" || parsed.kind === "info"
          ? parsed.kind
          : "success";
      return { message: parsed.message, kind };
    } catch {
      // Not this one — try the next.
    }
  }
  return null;
}

/** The decoded value, or the value itself when it cannot be decoded. */
function tryDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
