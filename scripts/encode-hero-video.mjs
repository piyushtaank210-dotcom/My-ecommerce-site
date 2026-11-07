/**
 * Encodes the hero films for the web.
 *
 * There is one master — a ten-second camera move across two controllers on
 * a dark desk — and two films are cut from it. They are separate cuts
 * rather than two cameras because the master is the only footage there is;
 * what makes them read as different shots is the cut and the crop.
 *
 * Three things matter in the encode, and all three were wrong with the film
 * as it first arrived:
 *
 *   1. The index (the `moov` atom) has to sit at the *front* of the file
 *      — `+faststart`. With it at the back, a browser has to download the
 *      whole film before it can play a single frame, which is most of the
 *      "buffering" a visitor sees.
 *
 *   2. The frame has to be the shape of the hero. The hero is a wide band
 *      — about 2.08 to 1 on a desktop — and a 16:9 film put in it is
 *      cropped by a quarter, which reads as the picture being zoomed in.
 *      The frame is trimmed to the hero's shape instead, so the browser
 *      has nothing left to crop.
 *
 *   3. The bitrate has to be a sane one, and the frame a shade sharper.
 *      The film arrived at nearly 3,000 kb/s — close to transparent, and
 *      three times what the picture needs. At 1,200 kb/s it is the same
 *      picture on the wire, and the sharpen puts back the crispness the
 *      smaller file would otherwise lose when a wide screen blows it up.
 *
 * The films have no sound, so the silent audio track is dropped.
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
const SOURCE = join(ROOT, "public", "hero", "hero-showcase-controller.mp4");

/**
 * The films cut from the master.
 *
 * `showcase` is the whole move: it opens on the scene lit — the old film
 * opened on a near-black frame, which is most of why the hero used to look
 * like it had failed to load — and it ends on the wide shot.
 *
 * `controller` is the detail at the end of the move, cropped in on the
 * white controller and its light streaks. It is a different picture from
 * the showcase film, not the same one twice.
 */
const FILMS = [
  {
    id: "showcase",
    out: "hero-showcase-web.mp4",
    poster: "hero-showcase-web-poster.jpg",
    start: 1.6,
    length: 8.4,
    // The hero's own shape, taken from the middle of the frame.
    crop: "iw:round(ih*0.854):0:round((ih-ih*0.854)/2)",
    scale: null,
  },
  {
    id: "controller",
    out: "hero-controller-web.mp4",
    poster: "hero-controller-web-poster.jpg",
    start: 6.6,
    length: 3.4,
    // In on the white controller, on the right of the frame.
    crop: "820:394:460:100",
    scale: "1280:614",
  },
];

/**
 * Finds the encoder.
 *
 * `FFMPEG` wins. Then ffmpeg on the path. Then the places Windows tends to
 * keep one — this machine has no ffmpeg on the path at all, and the only
 * copy on it is the one bundled with a download manager, so without this
 * the script would fail on the machine it was written for.
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

if (!existsSync(SOURCE)) {
  console.error(`✗ no master film at ${SOURCE}`);
  process.exit(1);
}

// h264_mf takes its bitrate as a peak-constrained VBR; libx264 takes a
// quality figure. Both land in about the same place.
const rate =
  ENC === "h264_mf"
    ? ["-rate_control", "pc_vbr", "-b:v", "1200k"]
    : ["-crf", "23"];

// A shade of sharpening, to make up for the frame being blown up on a wide
// screen.
const SHARPEN = "unsharp=5:5:0.8:5:5:0.0";

let failed = false;

for (const film of FILMS) {
  const target = join(ROOT, "public", "hero", film.out);
  const filters = [`crop=${film.crop}`];
  if (film.scale) filters.push(`scale=${film.scale}`);
  filters.push(SHARPEN);

  const result = spawnSync(
    FFMPEG,
    [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(film.start),
      "-t", String(film.length),
      "-i", SOURCE,
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
    console.error(`✗ the encoder did not finish on ${film.out}`);
    failed = true;
    continue;
  }

  console.log(
    `✓ public/hero/${film.out}  ` +
      `${Math.round(statSync(target).size / 1024)}KB  ` +
      `${film.length}s from ${film.start}s`
  );
}

if (failed) process.exit(1);

console.log("\n  the posters must be regenerated from each film's own first frame");
console.log("  node scripts/hero-frame.mjs public/hero/hero-showcase-web.mp4 \\");
console.log("    public/hero/hero-showcase-web-poster.jpg 0 1280 614");
console.log("  node scripts/hero-frame.mjs public/hero/hero-controller-web.mp4 \\");
console.log("    public/hero/hero-controller-web-poster.jpg 0 1280 614");
