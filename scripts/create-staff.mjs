/**
 * Creates the demo admin and support accounts if they are not there yet.
 *
 *   node scripts/create-staff.mjs
 *
 * Unlike `npm run seed` this does not rebuild the database, so it works
 * against a running dev server.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { STAFF, hashPassword } from "./staff.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data/store.db"));

const find = db.prepare("SELECT id FROM users WHERE email = ?");
const insert = db.prepare(
  "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
);

for (const s of STAFF) {
  if (find.get(s.email)) {
    console.log(`  · ${s.role.padEnd(7)} ${s.email} — already there`);
    continue;
  }
  insert.run(s.name, s.email, hashPassword(s.password), s.role);
  console.log(`  ✓ ${s.role.padEnd(7)} ${s.email}`);
}

db.close();

console.log("\nSign in at /login with:");
for (const s of STAFF) {
  console.log(`  ${s.role.padEnd(7)} ${s.email}  /  ${s.password}`);
}
