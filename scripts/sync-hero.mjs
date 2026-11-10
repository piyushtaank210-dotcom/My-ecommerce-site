/**
 * Syncs data/hero.json into the hero_slides table of the SQLite seed
 * file.
 *
 * `npm run seed` rebuilds the whole database and needs the dev server
 * stopped (Windows keeps data/store.db locked). This only touches
 * hero_slides, so it can run against a live dev server.
 *
 * The columns a slide carries for a phone are added first, if they are
 * not there already: they are new, and the table was made before they
 * were thought of. SQLite cannot add a column without being told whether
 * it is there, so each one is checked before its statement runs.
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

/**
 * The columns a slide carries for a phone.
 *
 * They are added if they are not there, and left alone if they are. This
 * is the same rule the migrations use, so the two never disagree.
 */
const PHONE_COLUMNS = [
  ["mobile_image", "mobile_image TEXT"],
  ["mobile_alt", "mobile_alt TEXT"],
  ["mobile_position", "mobile_position TEXT DEFAULT '50% 50%'"],
  ["mobile_video", "mobile_video TEXT"],
  ["mobile_video_poster", "mobile_video_poster TEXT"],
];

const existing = new Set(
  db
    .prepare("PRAGMA table_info(hero_slides)")
    .all()
    .map((c) => c.name)
);

for (const [name, definition] of PHONE_COLUMNS) {
  if (existing.has(name)) continue;
  db.exec(`ALTER TABLE hero_slides ADD COLUMN ${definition}`);
  console.log(`  · added the column ${name}`);
}

const upsert = db.prepare(`
  INSERT INTO hero_slides
    (id, image, alt, image_position, eyebrow, title, body,
     primary_label, primary_href, secondary_label, secondary_href, note, side, position,
     video, video_poster, mobile_image, mobile_alt, mobile_position, mobile_video, mobile_video_poster)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    video = excluded.video,
    video_poster = excluded.video_poster,
    mobile_image = excluded.mobile_image,
    mobile_alt = excluded.mobile_alt,
    mobile_position = excluded.mobile_position,
    mobile_video = excluded.mobile_video,
    mobile_video_poster = excluded.mobile_video_poster
`);

hero.slides.forEach((s, i) => {
  const image = heroImages[s.image] ?? null;
  if (!image) console.warn(`  ! no image for hero slide "${s.id}" (key "${s.image}")`);

  // A slide may name a film to play instead of the photograph.
  const video = s.video ?? null;
  if (video && !existsSync(join(ROOT, "public", video.replace(/^\//, "")))) {
    console.warn(`  ! no file for the video on slide "${s.id}" (${video})`);
  }

  // The still the browser holds while the film downloads. It is the film's
  // own first frame, so the picture on screen does not change when the
  // film takes over.
  const videoPoster = s.video_poster ?? null;
  if (videoPoster && !existsSync(join(ROOT, "public", videoPoster.replace(/^\//, "")))) {
    console.warn(`  ! no file for the poster on slide "${s.id}" (${videoPoster})`);
  }

  // A phone has its own picture, cut for a phone's screen, and its own
  // film cut to the same shape.
  const mobileImage = s.mobile_image ? (heroImages[s.mobile_image] ?? null) : null;
  if (s.mobile_image && !mobileImage) {
    console.warn(`  ! no image for the phone on hero slide "${s.id}" (key "${s.mobile_image}")`);
  }
  const mobileVideo = s.mobile_video ?? null;
  if (mobileVideo && !existsSync(join(ROOT, "public", mobileVideo.replace(/^\//, "")))) {
    console.warn(`  ! no file for the phone's video on slide "${s.id}" (${mobileVideo})`);
  }
  const mobileVideoPoster = s.mobile_video_poster ?? null;
  if (mobileVideoPoster && !existsSync(join(ROOT, "public", mobileVideoPoster.replace(/^\//, "")))) {
    console.warn(`  ! no file for the phone's poster on slide "${s.id}" (${mobileVideoPoster})`);
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
    video,
    videoPoster,
    mobileImage,
    s.mobile_alt ?? null,
    s.mobile_position ?? "50% 50%",
    mobileVideo,
    mobileVideoPoster
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
    "SELECT id, title, mobile_image, mobile_video FROM hero_slides ORDER BY position"
  )
  .all()) {
  console.log(
    `  ${r.id.padEnd(10)} | ${String(r.title).padEnd(38)} | phone: ${r.mobile_image ?? "(none)"}${r.mobile_video ? " + film" : ""}`
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
