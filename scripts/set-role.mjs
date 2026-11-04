/**
 * Gives an account a different role.
 *
 *   node scripts/set-role.mjs <email> <member|support|admin>
 *
 * Works against a running dev server — it only touches the users table.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROLES = ["member", "support", "admin"];

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const role = String(process.argv[3] ?? "").trim().toLowerCase();

if (!email || !ROLES.includes(role)) {
  console.error(
    `Usage: node scripts/set-role.mjs <email> <${ROLES.join("|")}>`
  );
  process.exit(1);
}

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const user = db
  .prepare("SELECT id, name, role FROM users WHERE email = ?")
  .get(email);

if (!user) {
  console.error(`No account with the email ${email}.`);
  db.close();
  process.exit(1);
}

db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
db.close();

console.log(`✓ ${user.name} (${email}) is now ${role}.`);
