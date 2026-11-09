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
