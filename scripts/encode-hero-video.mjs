/**
 * Encodes the hero films for the web.
 *
 * There are two masters and two films. Each film is a cut from its own
 * master, and each is a different picture — the hero should not show the
 * same footage twice.
 *
 * Three things matter in the encode, and all three were wrong with the
 * film as it first arrived:
 *
 *   1. The index (the `moov` atom) has to sit at the *front* of the file
 *      — `+faststart`. With it at the back, a browser has to download the
 *      whole film before it can play a single frame, which is most of the
 *   "buffering" a visitor sees.
 *
 *   2. The frame has to be the shape of the hero. The hero is a wide band
 *      — about 2.08 to 1 on a desktop — and a 16:9 film put in it is
 *      cropped by a quarter, which reads as the picture being zoomed in.
 *      The frame is trimmed to the hero's shape instead, so the browser
 *      has nothing left to crop.
 *
 *   3. The bitrate has to be a sane one, and the frame a shade sharper.
 *      The film arrived at nearly 3,000 kb/s — close to transparent, and
 *      three times what the picture needs. At 2,400 kb/s it is the same
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
const HERO = join(ROOT, "public", "hero");

/**
 * The films.
 *
 * `console` is the owner's own film, and the hero plays it whole. The
 * master opens on a fade up from black, so the first 0.8s of it is cut:
 * the poster is the film's own first frame, and the still a phone shows
 * is that frame too, so a film that opened on black would put a black
 * box at the top of the shop. The rest of the master runs to its end.
 *
 * The second film on the hero — the detail shot on the white controller —
 * is a committed asset now. Its master was removed when the old films
 * were cleared out, so it cannot be re-cut from footage; if it ever has
 * to change, the master has to come back first. Its poster can still be
 * made at any time, because a poster is drawn from the film itself.
 */
const FILMS = [
  {
    id: "console",
    source: "hero-console-master.mp4",
    out: "hero-console-web.mp4",
    poster: "hero-console-web-poster.jpg",
    start: 0.8,
    // No length: the film runs to the end of the master.
    length: null,
    crop: "iw:round(ih*0.854):0:round((ih-ih*0.854)/2)",
  },
];

/**
 * Every film the hero carries, and the poster that goes with it. The
 * poster of a film is drawn from the film itself, so this list is about
 * the posters rather than about what can be encoded.
 */
const POSTERS = [
  ["hero-console-web.mp4", "hero-console-web-poster.jpg"],
  ["hero-controller-web.mp4", "hero-controller-web-poster.jpg"],
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

// h264_mf takes its bitrate as a peak-constrained VBR; libx264 takes a
// quality figure. Both land in about the same place.
const rate =
  ENC === "h264_mf"
    ? ["-rate_control", "pc_vbr", "-b:v", "2400k"]
    : ["-crf", "20"];

// A shade of sharpening, to make up for the frame being blown up on a wide
// screen.
const SHARPEN = "unsharp=5:5:0.8:5:5:0.0";

let failed = false;

for (const film of FILMS) {
  const source = join(HERO, film.source);
  const target = join(HERO, film.out);

  if (!existsSync(source)) {
    console.error(`✗ no master film at ${source}`);
    failed = true;
    continue;
  }

  // The chain: cut to the hero's shape, then sharpen.
  const filters = [`crop=${film.crop}`];
  if (film.scale) filters.push(`scale=${film.scale}`);
  filters.push(SHARPEN);

  // A film with no length runs to the end of its master.
  const trim = film.length ? ["-t", String(film.length)] : [];

  const result = spawnSync(
    FFMPEG,
    [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(film.start),
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
    console.error(`✗ the encoder did not finish on ${film.out}`);
    failed = true;
    continue;
  }

  console.log(
    `✓ public/hero/${film.out}  ` +
      `${Math.round(statSync(target).size / 1024)}KB  ` +
      (film.length
        ? `${film.length}s from ${film.start}s`
        : `from ${film.start}s to the end of the master`)
  );
}

if (failed) process.exit(1);

console.log("\n  the posters must be regenerated from each film's own first frame");
for (const [film, poster] of POSTERS) {
  console.log(
    `  node scripts/hero-frame.mjs public/hero/${film} ` +
      `public/hero/${poster} 0 1280 614`
  );
}
