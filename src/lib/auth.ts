import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { parseRole, type Role } from "./roles";

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

export function findUserByEmail(
  email: string
): (User & { password_hash: string }) | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) return null;
  return { ...mapUser(row), password_hash: str(row.password_hash) };
}

export function getUserById(id: number): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(
  name: string,
  email: string,
  password: string,
  role: Role = "member"
): User {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
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
export function updateUserProfile(
  id: number,
  patch: { name: string; email: string; phone?: string }
): void {
  getDb()
    .prepare("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?")
    .run(
      patch.name.trim(),
      patch.email.trim().toLowerCase(),
      patch.phone?.trim() || null,
      id
    );
}

/** Replaces the password after the current one has been verified. */
export function updateUserPassword(id: number, password: string): void {
  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(password), id);
}

export function setUserRole(id: number, role: Role): void {
  getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
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
  const expires = new Date(Date.now() + MAX_AGE * 1000).toISOString();
  getDb()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expires);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as Row | undefined;

  if (!row) return null;

  if (new Date(str(row.expires_at)).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return mapUser(row);
}
