import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, usesPrivateDatabaseCopy } from "./db";
import { parseRole, type Role } from "./roles";
import { signSession, verifySession } from "./session-token";

const COOKIE = "pf_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/* ------------------------------------------------------------- passwords */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/* ----------------------------------------------------------------- users */

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  created_at: string;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

function mapUser(r: Row): User {
  return {
    id: Number(r.id),
    name: str(r.name),
    email: str(r.email),
    phone: strOrNull(r.phone),
    role: parseRole(r.role),
    created_at: str(r.created_at),
  };
}

export async function findUserByEmail(
  email: string
): Promise<(User & { password_hash: string }) | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase())) as Row | undefined;
  if (!row) return null;
  return { ...mapUser(row), password_hash: str(row.password_hash) };
}

export async function getUserById(id: number): Promise<User | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id)) as Row | undefined;
  return row ? mapUser(row) : null;
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role: Role = "member"
): Promise<User> {
  const db = getDb();
  const info = await db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id"
    )
    .run(
      name.trim(),
      email.trim().toLowerCase(),
      hashPassword(password),
      role
    );
  return {
    id: Number(info.lastInsertRowid),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: null,
    role,
    created_at: new Date().toISOString(),
  };
}

/** Changes the name, email and phone on an account. */
export async function updateUserProfile(
  id: number,
  patch: { name: string; email: string; phone?: string }
): Promise<void> {
  await getDb()
    .prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?")
    .run(
      patch.name.trim(),
      patch.email.trim().toLowerCase(),
      patch.phone?.trim() || null,
      id
    );
}

/** Replaces the password after the current one has been verified. */
export async function updateUserPassword(
  id: number,
  password: string
): Promise<void> {
  await getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(password), id);
}

export async function setUserRole(id: number, role: Role): Promise<void> {
  await getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

/* -------------------------------------------------------------- sessions */

/**
 * Where to send someone after they sign in. Only same-site paths are
 * allowed — an absolute URL here would be an open redirect.
 */
export function safeNext(next?: string | null): string {
  if (!next) return "/";
  const s = String(next);
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  return s;
}

export async function startSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + MAX_AGE * 1000;
  await getDb()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, new Date(expiresAt).toISOString());
  const store = await cookies();
  store.set(COOKIE, signSession(token, userId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (raw) {
    // The cookie may be signed or may be a bare token; either way the token
    // is the first part.
    const token = raw.split(".")[1] ?? raw;
    await getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  // The signed part of the cookie says who it is for and when it runs out.
  const signed = verifySession(raw);
  const token = signed?.token ?? raw;

  const row = (await getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token)) as Row | undefined;

  if (row) {
    if (new Date(str(row.expires_at)).getTime() < Date.now()) {
      console.warn(`[auth] the session for ${row.email} had expired`);
      await getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return null;
    }
    return mapUser(row);
  }

  // No session row.
  //
  // On a single machine that means the visitor has been signed out, and
  // that is the end of it: the session row is what decides, and signing out
  // really signs out.
  //
  // On a serverless host it can mean something else entirely — the request
  // landed on an instance with its own copy of the database, which has
  // never heard of this sign-in. There the signature on the cookie is proof
  // enough to carry on with, because without it a visitor is thrown out of
  // the back office every time a request lands on another instance.
  //
  // The fallback is deliberately not used on a normal install, where it
  // would only take away the meaning of signing out.
  if (signed && usesPrivateDatabaseCopy()) {
    const user = await getUserById(signed.userId);
    if (user) {
      console.warn(
        `[auth] the session row for ${user.email} was not on this instance — ` +
          `the signed cookie was used instead`
      );
      return user;
    }
  }

  // The browser sent the cookie but the session behind it is gone. That is
  // the difference between "not signed in" and "signed in once, and the
  // session has since been thrown away" — worth saying out loud, because
  // the second one looks exactly like the first from the outside and sends
  // anyone chasing it looking in the wrong place.
  console.warn(
    `[auth] the ${COOKIE} cookie was sent but no live session matched it`
  );
  return null;
}
