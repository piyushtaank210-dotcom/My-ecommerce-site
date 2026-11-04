/**
 * Lists anything in the catalogue whose address starts with "zz-" — the
 * fixtures the test scripts use. They should all be gone.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data/store.db"));

const rows = db
  .prepare(
    "SELECT slug, name, status, stock FROM products WHERE slug LIKE 'zz-%' OR slug LIKE '%-copy' ORDER BY slug"
  )
  .all();

if (!rows.length) {
  console.log("no leftover fixtures");
} else {
  for (const r of rows) {
    console.log(`  ${r.slug.padEnd(30)} ${r.status.padEnd(10)} stock ${r.stock}`);
  }
  console.log(`${rows.length} leftover`);
}

db.close();
