/**
 * The signed half of the sign-in cookie.
 *
 * The store keeps its data in a SQLite file. On a serverless host every
 * instance gets its own copy of that file, so a session written on one
 * instance is unknown to the next — the visitor is told they are not signed
 * in and is sent back to the sign-in page, over and over, as requests land
 * on different instances.
 *
 * The fix is to make the cookie carry enough of its own proof: which account
 * it belongs to, and when it runs out, signed so the server can tell a
 * genuine cookie from a forged one. The session row in the database stays
 * exactly as it was, and is still what decides who is signed in when it is
 * there; the signature is the fallback that answers when the row is not.
 *
 * Nothing here imports Next.js, so the test scripts can sign a cookie too.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The key the signature is made with.
 *
 * SESSION_SECRET must be set in the environment and be the same on every
 * instance. The fallback keeps a single-machine install working; it is
 * published in the source, so it is only a safety net, not a secret.
 */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET || "consoleseller-session-secret-change-me";
}

/** How the cookie is put together. The version comes first. */
const VERSION = "v1";

/** The parts of a cookie value, once it has been split. */
export type SignedSession = {
  /** The session row's token — the database still looks it up by this. */
  token: string;
  /** The account the cookie is for. */
  userId: number;
  /** When the cookie runs out, in milliseconds since the epoch. */
  expiresAt: number;
};

/** Signs the payload and joins it into a cookie value. */
export function signSession(
  token: string,
  userId: number,
  expiresAt: number
): string {
  const payload = `${VERSION}.${token}.${userId}.${expiresAt}`;
  const signature = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Checks a cookie value and returns what it says, or null if the cookie is
 * missing, malformed, forged, or has run out.
 *
 * A cookie that is just a token — one written before this existed — has no
 * signature and is handed back as such, so it is looked up in the database
 * the way it always was.
 */
export function verifySession(value: string): SignedSession | null {
  const parts = value.split(".");
  if (parts.length !== 5) return null;

  const [version, token, userId, expiresAt, signature] = parts;
  if (version !== VERSION) return null;

  const payload = `${version}.${token}.${userId}.${expiresAt}`;
  const expected = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");

  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  const id = Number(userId);
  const expiry = Number(expiresAt);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(expiry)) return null;
  if (expiry < Date.now()) return null;

  return { token, userId: id, expiresAt: expiry };
}
