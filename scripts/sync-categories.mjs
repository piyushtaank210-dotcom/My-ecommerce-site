/**
 * Syncs the categories in data/catalog.json into the categories table.
 *
 * `npm run seed` rebuilds the whole database and needs the dev server
 * stopped (Windows keeps data/store.db locked). This only touches
 * categories, so it can run against a live dev server — which matters
 * because a reseed would throw away the orders, enquiries and accounts
 * that are already in the store.
 *
 * It upserts and nothing else: a category missing from catalog.json is
 * left alone rather than deleted, because the products that point at it
 * would be left stranded.
 *
 *   node scripts/sync-categories.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const catalog = JSON.parse(
  readFileSync(join(ROOT, "data/catalog.json"), "utf8")
);

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const upsert = db.prepare(`
  INSERT INTO categories (slug, name, icon, blurb, spec_fields, position)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    icon = excluded.icon,
    blurb = excluded.blurb,
    spec_fields = excluded.spec_fields,
    position = excluded.position
`);

catalog.categories.forEach((c, i) => {
  upsert.run(
    c.slug,
    c.name,
    c.icon ?? null,
    c.blurb ?? null,
    JSON.stringify(c.specFields ?? []),
    i
  );
});

for (const r of db
  .prepare(
    "SELECT slug, name, blurb, spec_fields FROM categories ORDER BY position"
  )
  .all()) {
  const fields = JSON.parse(r.spec_fields ?? "[]");
  console.log(
    `  ${r.slug.padEnd(14)} | ${r.name.padEnd(20)} | ${fields.length} specification fields`
  );
}

db.close();
console.log(`\n✓ synced ${catalog.categories.length} categories`);

// Fold the change into the database file itself, so what is committed is the
// shop as it stands rather than the shop as it stood before the last edit.
try {
  new DatabaseSync(join(ROOT, "data", "store.db")).exec(
    "PRAGMA wal_checkpoint(TRUNCATE);"
  );
} catch {
  /* the dev server may be holding it; the log is checkpointed anyway */
}
