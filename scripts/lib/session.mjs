/**
 * A signed-in session for the test scripts.
 *
 * The scripts used to name a staff address outright — `admin@playforge.test`
 * and the like — which meant that renaming an account, or seeding a fresh
 * database, broke them with "no such user". They look the account up by its
 * role instead, so whichever account holds the role is the one that signs in.
 *
 * The shop's database is PostgreSQL, and it is the one the scripts talk to.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
// The shop's environment is read first, so that the connection string is
// there before it is asked for.
import "./env.mjs";
import { databaseUrl, sslOption } from "../../src/lib/database-url.ts";

/** The shop's database. */
export function shopDb() {
  const url = databaseUrl();
  return new Pool({ connectionString: url, ssl: sslOption(url) });
}

/**
 * Creates a session token for the first account with the given role.
 *
 * @param role   The role to sign in as — "admin" or "support".
 */
export async function tokenForRole(role) {
  const pool = shopDb();
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT id, email FROM users WHERE role = $1 ORDER BY id LIMIT 1",
        [role]
      );
      if (!rows.length) {
        throw new Error(`no ${role} account to sign in as`);
      }

      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600_000).toISOString();

      // The sessions that have already run out are cleared away first.
      // The shop only removes a session when somebody comes back with it
      // after it expired, so without this the table fills up with rows
      // that can never be used again — every run of every script adds one.
      await client.query(
        "DELETE FROM sessions WHERE user_id = $1 AND expires_at < $2",
        [rows[0].id, new Date().toISOString()]
      );

      await client.query(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
        [token, rows[0].id, expires]
      );
      return token;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/** The email address of the first account with the given role. */
export async function emailForRole(role) {
  const pool = shopDb();
  try {
    const { rows } = await pool.query(
      "SELECT email FROM users WHERE role = $1 ORDER BY id LIMIT 1",
      [role]
    );
    if (!rows.length) {
      throw new Error(`no ${role} account to sign in as`);
    }
    return rows[0].email;
  } finally {
    await pool.end();
  }
}

/**
 * Removes a session token.
 *
 * A script that signs in makes a session, and that session should not be
 * left behind afterwards.
 */
export async function deleteToken(token) {
  const pool = shopDb();
  try {
    await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  } finally {
    await pool.end();
  }
}

/**
 * How many sessions an account has, and how many of them are still live.
 *
 * A script that signs in and signs out uses this to check that the
 * session it made was the one that ended.
 *
 * The expiry is a text column — it came across from SQLite with the rest
 * of the schema — so it is read and compared in JavaScript, which is
 * what the shop's own session check does.
 */
export async function sessionState(email) {
  const pool = shopDb();
  try {
    const { rows } = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!rows.length) return { user: null, total: 0, live: 0 };

    const sessions = await pool.query(
      "SELECT expires_at FROM sessions WHERE user_id = $1",
      [rows[0].id]
    );
    const now = Date.now();
    let live = 0;
    for (const s of sessions.rows) {
      if (new Date(s.expires_at).getTime() >= now) live++;
    }
    return {
      user: rows[0].id,
      total: sessions.rows.length,
      live,
    };
  } finally {
    await pool.end();
  }
}
