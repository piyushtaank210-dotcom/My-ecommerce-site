/**
 * Reports product photographs whose file is not on disk.
 *
 * A photograph that has been removed from the uploads folder but is still
 * in the catalogue is a broken picture on the shop floor.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data/store.db"));

const rows = db
  .prepare(
    "SELECT id, product_slug, path FROM product_images WHERE path LIKE '/uploads/%' ORDER BY product_slug"
  )
  .all();

let missing = 0;
for (const r of rows) {
  const there = existsSync(join(ROOT, "public", r.path));
  if (!there) missing++;
  console.log(
    `${there ? "OK     " : "MISSING"} ${r.product_slug.padEnd(26)} ${r.path}`
  );
}
console.log(`uploaded photographs: ${rows.length}, missing: ${missing}`);

db.close();
