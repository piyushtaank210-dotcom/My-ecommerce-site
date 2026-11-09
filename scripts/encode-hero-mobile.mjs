/**
 * Encodes the hero's mobile film.
 *
 * The film a phone plays is a different cut from the one a desktop plays.
 * The desktop film is a wide landscape band; the phone's is portrait, cut
 * for the shape of the phone's screen. They are two encodings of the same
 * footage, and each is trimmed to the shape it is shown in, so the browser
 * has nothing left to crop.
 *
 * Three things matter in the encode, and they are the same three the
 * desktop film needs:
 *
 *   1. The index (the `moov` atom) has to sit at the *front* of the file —
 *      `+faststart`. With it at the back, a phone has to download the
 *      whole film before it can play a frame.
 *
 *   2. The frame has to be the shape of the hero on a phone, so the browser
 *      does not crop it.
 *
 *   3. The bitrate has to be a sane one. A phone is often on a phone's
 *      data, so the film's bitrate is lower than the desktop film's and
 *      the frame is left unsharpened — a phone's screen is small enough
 *      that the sharpening would only make the picture crawl.
 *
 * The film has no sound, so the silent audio track is dropped.
 *
 *   node scripts/encode-hero-mobile.mjs
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
const HERO = join(ROOT, "public", "hero");

/**
 * The phone's film.
 *
 * The master opens on a fade up from black: a black frame at the top of
 * the shop is exactly what the desktop film avoids, so the first second is
 * cut and the film starts on the picture itself.
 */
const FILM = {
  id: "mobile",
  source: "hero-mobile-master.mp4",
  out: "hero-mobile-web.mp4",
  poster: "hero-mobile-web-poster.jpg",
  start: 1.0,
  // No length: the film runs to the end of the master.
  length: null,
  /**
   * The phone's shape. The hero on a phone is a tall panel, so the film is
   * trimmed to the height the phone's frame has, at the width it is.
   */
  crop: "iw:ih",
  scale: "1080:1434",
};

/**
 * Finds the encoder.
 *
 * `FFMPEG` wins. Then ffmpeg on the path. Then the places Windows tends to
 * keep one — this machine has no ffmpeg on the path at all, and the only
 * copy on it is the one bundled with a download manager.
 */
function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const onPath = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (onPath.status === 0) return "ffmpeg";

  const known = [
    "C:/Program Files/Softdeluxe/Free Download Manager/ffmpeg.exe",
    "C:/ffmpeg/bin/ffmpeg.exe",
    "C:/Program Files/ffmpeg/bin/ffmpeg.exe",
  ];
  for (const path of known) if (existsSync(path)) return path;
  return "ffmpeg";
}

const FFMPEG = findFfmpeg();
const ENC = process.env.ENC ?? (process.platform === "win32" ? "h264_mf" : "libx264");

// h264_mf takes its bitrate as a peak-constrained VBR; libx264 takes a
// quality figure. Both land in about the same place.
//
// The phone's figure is lower than the desktop film's 2,400 kb/s: a phone
// is often on mobile data, and this film is played on a screen that is
// half the size of the desktop one.
const rate =
  ENC === "h264_mf"
    ? ["-rate_control", "pc_vbr", "-b:v", "1400k"]
    : ["-crf", "23"];

const source = join(HERO, FILM.source);
const target = join(HERO, FILM.out);

if (!existsSync(source)) {
  console.error(`✗ no master film at ${source}`);
  process.exit(1);
}

const filters = [`crop=${FILM.crop}`, `scale=${FILM.scale}`];
const trim = FILM.length ? ["-t", String(FILM.length)] : [];

const result = spawnSync(
  FFMPEG,
  [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(FILM.start),
    ...trim,
    "-i", source,
    "-an",
    "-c:v", ENC,
    ...rate,
    "-vf", filters.join(","),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    target,
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error(`✗ the encoder did not finish on ${FILM.out}`);
  process.exit(1);
}

console.log(
  `✓ public/hero/${FILM.out}  ` +
    `${Math.round(statSync(target).size / 1024)}KB  ` +
    (FILM.length
      ? `${FILM.length}s from ${FILM.start}s`
      : `from ${FILM.start}s to the end of the master`)
);

console.log("\n  the poster must be the film's own first frame");
console.log(
  `  node scripts/hero-frame.mjs public/hero/${FILM.out} ` +
    `public/hero/${FILM.poster} 0 1080 1434`
);
