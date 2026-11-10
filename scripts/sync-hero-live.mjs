/**
 * Syncs data/hero.json into the hero_slides table of the shop's own
 * database.
 *
 * `npm run seed` rebuilds the whole database and needs the dev server
 * stopped. `npm run sync-hero` only touches the SQLite seed file. This
 * script touches the live database — the one the shop actually runs on —
 * and only the hero_slides table in it. No other table is read or
 * written, and no row outside hero_slides is touched.
 *
 *   node scripts/sync-hero-live.mjs
 *
 * The columns a slide carries for a phone are added first, if they are
 * not there already: they are new, and the table was made before they
 * were thought of. Adding a column is safe to run again — a column that
 * is there is left alone.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { databaseUrl, sslOption } from "../src/lib/database-url.ts";
import "./lib/env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const hero = JSON.parse(readFileSync(join(ROOT, "data/hero.json"), "utf8"));
const heroImages = JSON.parse(
  readFileSync(join(ROOT, "data/hero-images.json"), "utf8")
);

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

const url = databaseUrl();
const pool = new Pool({ connectionString: url, ssl: sslOption(url) });
const client = await pool.connect();

try {
  for (const [name, definition] of PHONE_COLUMNS) {
    await client.query(
      `ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS ${definition}`
    );
    console.log(`  · column ${name} is there`);
  }

  const upsert = `
    INSERT INTO hero_slides
      (id, image, alt, image_position, eyebrow, title, body,
       primary_label, primary_href, secondary_label, secondary_href, note, side, position,
       video, video_poster, mobile_image, mobile_alt, mobile_position, mobile_video, mobile_video_poster)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (id) DO UPDATE SET
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
  `;

  for (const [i, s] of hero.slides.entries()) {
    const image = heroImages[s.image] ?? null;
    if (!image) console.warn(`  ! no image for hero slide "${s.id}" (key "${s.image}")`);

    // A slide may name a film to play instead of the photograph.
    const video = s.video ?? null;
    if (video && !existsSync(join(ROOT, "public", video.replace(/^\//, "")))) {
      console.warn(`  ! no file for the video on slide "${s.id}" (${video})`);
    }
    const videoPoster = s.video_poster ?? null;
    if (videoPoster && !existsSync(join(ROOT, "public", videoPoster.replace(/^\//, "")))) {
      console.warn(`  ! no file for the poster on slide "${s.id}" (${videoPoster})`);
    }

    // And a phone gets its own picture and its own film, each cut for the
    // shape of a phone's screen.
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

    await client.query(upsert, [
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
      mobileVideoPoster,
    ]);
  }

  // Drop slides that are no longer in hero.json.
  const ids = hero.slides.map((s) => s.id);
  const { rows: existing } = await client.query("SELECT id FROM hero_slides");
  for (const row of existing) {
    if (!ids.includes(row.id)) {
      await client.query("DELETE FROM hero_slides WHERE id = $1", [row.id]);
      console.log(`  - removed stale slide "${row.id}"`);
    }
  }

  const { rows } = await client.query(
    `SELECT id, title, mobile_image, mobile_video FROM hero_slides ORDER BY position`
  );
  console.log("");
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(10)} | ${String(r.title).padEnd(38)} | phone: ${r.mobile_image ?? "(none)"}${r.mobile_video ? " + film" : ""}`
    );
  }

  console.log(`\n✓ synced ${hero.slides.length} hero slides`);
} finally {
  client.release();
  await pool.end();
}
