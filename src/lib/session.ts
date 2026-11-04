import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const COOKIE = "pf_sid";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Reads the session id without mutating cookies — safe during render. */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/** Reads the session id, creating one if needed. Only callable from actions/handlers. */
export async function ensureSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return id;
}
