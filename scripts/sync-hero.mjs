/**
 * Syncs data/hero.json into the hero_slides table.
 *
 * `npm run seed` rebuilds the whole database and needs the dev server
 * stopped (Windows keeps data/store.db locked). This only touches
 * hero_slides, so it can run against a live dev server.
 *
 *   node scripts/sync-hero.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const hero = JSON.parse(readFileSync(join(ROOT, "data/hero.json"), "utf8"));
const heroImages = JSON.parse(
  readFileSync(join(ROOT, "data/hero-images.json"), "utf8")
);

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const upsert = db.prepare(`
  INSERT INTO hero_slides
    (id, image, alt, image_position, eyebrow, title, body,
     primary_label, primary_href, secondary_label, secondary_href, note, side, position, video)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    image = excluded.image,
    alt = excluded.alt,
    image_position = excluded.image_position,
    eyebrow = excluded.eyebrow,
    title = excluded.title,
    body = excluded.body,
    primary_label = excluded.primary_label,
    primary_href = excluded.primary_href,
    secondary_label = excluded.secondary_label,
    secondary_href = excluded.secondary_href,
    note = excluded.note,
    side = excluded.side,
    position = excluded.position,
    video = excluded.video
`);

hero.slides.forEach((s, i) => {
  const image = heroImages[s.image] ?? null;
  if (!image) console.warn(`  ! no image for hero slide "${s.id}" (key "${s.image}")`);

  // A slide may name a film to play instead of the photograph.
  const video = s.video ?? null;
  if (video && !existsSync(join(ROOT, "public", video.replace(/^\//, "")))) {
    console.warn(`  ! no file for the video on slide "${s.id}" (${video})`);
  }

  upsert.run(
    s.id,
    image,
    s.alt,
    s.position ?? "50% 50%",
    s.eyebrow ?? null,
    s.title,
    s.body ?? null,
    s.primary?.label ?? null,
    s.primary?.href ?? null,
    s.secondary?.label ?? null,
    s.secondary?.href ?? null,
    s.note ?? null,
    s.side === "right" ? "right" : "left",
    i,
    video
  );
});

// Drop slides that are no longer in hero.json.
const ids = hero.slides.map((s) => s.id);
for (const row of db.prepare("SELECT id FROM hero_slides").all()) {
  if (!ids.includes(row.id)) {
    db.prepare("DELETE FROM hero_slides WHERE id = ?").run(row.id);
    console.log(`  - removed stale slide "${row.id}"`);
  }
}

for (const r of db
  .prepare(
    "SELECT id, title, primary_label, secondary_label FROM hero_slides ORDER BY position"
  )
  .all()) {
  console.log(
    `  ${r.id.padEnd(6)} | ${r.title.padEnd(42)} | ${r.primary_label} / ${r.secondary_label}`
  );
}

db.close();
console.log(`\n✓ synced ${hero.slides.length} hero slides`);

// Fold the change into the database file itself, so what is committed is
// the shop as it stands rather than the shop as it stood before the last
// edit. Without this the change sits in the write-ahead log, which is not
// tracked, and never reaches the repository.
try {
  new DatabaseSync(join(ROOT, "data", "store.db"))
    .exec("PRAGMA wal_checkpoint(TRUNCATE);");
} catch {
  /* the dev server may be holding it; the log is checkpointed anyway */
}
