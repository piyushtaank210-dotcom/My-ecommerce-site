/**
 * Syncs the variations in data/catalog.json into a live database.
 *
 * `npm run seed` rebuilds the whole database and needs the dev server
 * stopped (Windows keeps data/store.db locked). This only touches what a
 * product varies by and what each option is, so it can run against a live
 * dev server — which matters because a reseed would throw away the orders,
 * enquiries and accounts that are already in the store.
 *
 * The stock is not touched: it belongs to the inventory, and every change to
 * it is written down there.
 *
 *   node scripts/sync-variants.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { inferVariantAttributes } from "../src/lib/variations.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data/store.db"));

const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));

const setProductAttributes = db.prepare(
  "UPDATE products SET attributes = ? WHERE slug = ?"
);
const setVariantAttributes = db.prepare(
  "UPDATE variants SET attributes = ? WHERE id = ?"
);
const setVariantFields = db.prepare(
  "UPDATE variants SET sku = ?, image = ?, barcode = ? WHERE id = ?"
);

let products = 0;
let variants = 0;

db.exec("BEGIN");
try {
  for (const p of catalog.products) {
    const attributes = p.attributes ?? {};
    const before = db
      .prepare("SELECT attributes FROM products WHERE slug = ?")
      .get(p.slug);
    if (!before) {
      console.warn(`  ! no such product: ${p.slug}`);
      continue;
    }
    setProductAttributes.run(JSON.stringify(attributes), p.slug);
    products++;

    for (const v of p.variants ?? []) {
      const id = `${p.slug}::${v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const row = db.prepare("SELECT id FROM variants WHERE id = ?").get(id);
      if (!row) {
        console.warn(`  ! no such option: ${id}`);
        continue;
      }

      const variantAttributes = v.attributes
        ? v.attributes
        : inferVariantAttributes(attributes, v.name);
      setVariantAttributes.run(JSON.stringify(variantAttributes), id);

      // The catalogue only speaks for a code, a photograph and a barcode
      // when it has something to say about them — the back office owns
      // those otherwise.
      if (v.sku || v.image || v.barcode) {
        const current = db
          .prepare("SELECT sku, image, barcode FROM variants WHERE id = ?")
          .get(id);
        setVariantFields.run(
          v.sku ?? current.sku,
          v.image ?? current.image,
          v.barcode ?? current.barcode,
          id
        );
      }
      variants++;
    }
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

console.log("✓ synced the variations");
console.log(`  ${products} products · ${variants} options`);
db.close();

// Fold the change into the database file itself, so what is committed is the
// shop as it stands rather than the shop as it stood before the last edit.
try {
  new DatabaseSync(join(ROOT, "data", "store.db")).exec(
    "PRAGMA wal_checkpoint(TRUNCATE);"
  );
} catch {
  /* the dev server may be holding it; the log is checkpointed anyway */
}
