/**
 * Encodes the hero film for the web.
 *
 * Two things matter here, and both were wrong with the film as it first
 * arrived:
 *
 *   1. The index (the `moov` atom) has to sit at the *front* of the file
 *      — `+faststart`. With it at the back, a browser has to download the
 *      whole film before it can play a single frame, which is most of the
 *      "buffering" a visitor sees.
 *
 *   2. The bitrate has to be a sane one. The film arrived at nearly
 *      3,000 kb/s — close to transparent, and three times what the
 *      picture needs. At 1,200 kb/s it is the same picture on the screen
 *      and a third of the bytes on the wire.
 *
 * The film has no sound, so the silent audio track is dropped.
 *
 *   node scripts/encode-hero-video.mjs
 *
 * FFMPEG points at the encoder if it is not on the path. ENC names the
 * encoder: h264_mf is what Windows has, libx264 is what everything else
 * has.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const ENC = process.env.ENC ?? (process.platform === "win32" ? "h264_mf" : "libx264");

const SOURCE = join(ROOT, "public", "hero", "hero-showcase.mp4");
const TARGET = join(ROOT, "public", "hero", "hero-showcase-web.mp4");

if (!existsSync(SOURCE)) {
  console.error(`✗ no film to encode at ${SOURCE}`);
  process.exit(1);
}

const before = statSync(SOURCE).size;

// h264_mf takes its bitrate as a peak-constrained VBR; libx264 takes a
// quality figure. Both land in about the same place.
const rate =
  ENC === "h264_mf"
    ? ["-rate_control", "pc_vbr", "-b:v", "1200k"]
    : ["-crf", "23"];

const result = spawnSync(
  FFMPEG,
  [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", SOURCE,
    "-an",
    "-c:v", ENC,
    ...rate,
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    TARGET,
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("✗ the encoder did not finish");
  process.exit(result.status ?? 1);
}

const after = statSync(TARGET).size;
console.log(`✓ wrote public/hero/${TARGET.split(/[\\/]/).pop()}`);
console.log(
  `  ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB ` +
    `(${Math.round((1 - after / before) * 100)}% smaller)`
);
console.log("  the poster must be regenerated from this file's first frame");
