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
const HERO = join(ROOT, "public", "hero");

/**
 * The films.
 *
 * `console` is the reveal at the end of the console master: the shot with
 * both consoles, the disc and the controller. It is the picture of the
 * whole range in one frame, so it is the one the hero opens on. The
 * master runs it in two and a half seconds, which is too quick to read,
 * so it is slowed and the frames in between are interpolated — the pull
 * back becomes a drift rather than a rush, and the film is smooth
 * instead of stuttering through duplicated frames.
 *
 * `controller` is the detail shot on the white controller, cropped in far
 * enough to be a different picture from the console film.
 */
const FILMS = [
  {
    id: "console",
    source: "hero-console-master.mp4",
    out: "hero-console-web.mp4",
    poster: "hero-console-web-poster.jpg",
    start: 7.45,
    length: 2.6,
    speed: 1.8,
    fps: 48,
    crop: "iw:round(ih*0.854):0:round((ih-ih*0.854)/2)",
  },
  {
    id: "controller",
    source: "hero-showcase-controller.mp4",
    out: "hero-controller-web.mp4",
    poster: "hero-controller-web-poster.jpg",
    start: 6.6,
    length: 3.4,
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

  // The chain: cut to the hero's shape, slow it if it is too quick, put the
  // frames in between, then sharpen.
  const filters = [`crop=${film.crop}`];
  if (film.speed && film.speed !== 1) {
    filters.push(`setpts=${film.speed}*PTS`);
  }
  if (film.scale) filters.push(`scale=${film.scale}`);
  if (film.speed && film.speed !== 1 && film.fps) {
    // The frames in between a slowed film, worked out from the motion
    // between one frame and the next.
    filters.push(
      "minterpolate=fps=" +
        film.fps +
        ":mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
    );
  }
  filters.push(SHARPEN);

  const result = spawnSync(
    FFMPEG,
    [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(film.start),
      "-t", String(film.length),
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

  const seconds = film.length * (film.speed ?? 1);
  console.log(
    `✓ public/hero/${film.out}  ` +
      `${Math.round(statSync(target).size / 1024)}KB  ` +
      `${seconds.toFixed(2)}s from ${film.start}s`
  );
}

if (failed) process.exit(1);

console.log("\n  the posters must be regenerated from each film's own first frame");
for (const film of FILMS) {
  console.log(
    `  node scripts/hero-frame.mjs public/hero/${film.out} ` +
      `public/hero/${film.poster} 0 1280 614`
  );
}
