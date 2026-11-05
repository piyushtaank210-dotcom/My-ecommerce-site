/**
 * A signed-in session for the test scripts.
 *
 * The scripts used to name a staff address outright — `admin@playforge.test`
 * and the like — which meant that renaming an account, or seeding a fresh
 * database, broke them with "no such user". They look the account up by its
 * role instead, so whichever account holds the role is the one that signs in.
 */
import { randomBytes } from "node:crypto";

/**
 * Creates a session token for the first account with the given role.
 *
 * @param db     An open node:sqlite handle on the store database.
 * @param role   The role to sign in as — "admin" or "support".
 */
export function tokenForRole(db, role) {
  const user = db
    .prepare("SELECT id, email FROM users WHERE role = ? ORDER BY id LIMIT 1")
    .get(role);

  if (!user) {
    throw new Error(`no ${role} account to sign in as`);
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600_000).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, user.id, expires);

  return token;
}

/** The email address of the first account with the given role. */
export function emailForRole(db, role) {
  const user = db
    .prepare("SELECT email FROM users WHERE role = ? ORDER BY id LIMIT 1")
    .get(role);

  if (!user) {
    throw new Error(`no ${role} account to sign in as`);
  }

  return user.email;
}
