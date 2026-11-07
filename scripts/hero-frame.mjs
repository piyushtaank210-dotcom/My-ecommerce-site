/**
 * Draws a still from a film and saves it as a JPEG.
 *
 * The hero's poster has to be the film's *own* first frame: the poster is
 * what the browser holds while the film downloads, so if it is a different
 * picture the hero opens on one scene and changes to another a moment
 * later — a flash. This script is how that still is made.
 *
 *   node scripts/hero-frame.mjs <film> <out.jpg> [seconds] [width] [height]
 *
 * `film` may be any path the browser can read. It is served over a short-
 * lived local HTTP server rather than opened as a file:// URL, because a
 * file:// video taints the canvas and the frame cannot be read back out
 * of it.
 *
 * `seconds` is where in the film to look; 0 is the first frame.
 * `width` and `height` are the size of the still; they default to the
 * shape of the hero, so a poster is cut to the same frame as the film.
 */
import { createServer } from "node:http";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const filmArg = process.argv[2];
const outArg = process.argv[3];
if (!filmArg || !outArg) {
  console.error(
    "usage: node scripts/hero-frame.mjs <film> <out.jpg> [seconds] [width] [height]"
  );
  process.exit(1);
}

const film = resolve(filmArg);
const out = resolve(outArg);
const seconds = Number(process.argv[4] ?? 0);
const width = Number(process.argv[5] ?? 1280);
const height = Number(process.argv[6] ?? 614);

const size = statSync(film).size;
const type = film.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";

/* --------------------------------------------------------- the film server */

/** Serves the one file, with the byte ranges a browser needs to seek. */
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/film")) {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : size - 1;
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      createReadStream(film, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": size,
    });
    createReadStream(film).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

/* -------------------------------------------------------------- the browser */

const { chrome, cdp } = await launchChrome({
  port: 9255,
  profile: join(tmpdir(), "consoleseller-heroframe-chrome"),
  dir: join(ROOT, ".shots"),
});

let failed = false;

try {
  await cdp.goto(`http://127.0.0.1:${port}/`);

  const dataUrl = await cdp.evaluate(`(async () => {
    const v = document.createElement('video');
    v.src = '/film';
    v.muted = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    document.body.appendChild(v);

    await new Promise((ok, no) => {
      v.addEventListener('loadedmetadata', ok, { once: true });
      v.addEventListener('error', () => no(new Error('the film would not load')), { once: true });
      setTimeout(() => no(new Error('the film never loaded')), 20000);
    });

    const at = Math.min(${seconds}, Math.max(0, v.duration - 0.05));
    await new Promise((ok, no) => {
      v.addEventListener('seeked', ok, { once: true });
      v.currentTime = at;
      setTimeout(() => no(new Error('the film would not seek')), 20000);
    });
    // One frame after the seek, so the canvas is not given the old picture.
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));

    const c = document.createElement('canvas');
    c.width = ${width};
    c.height = ${height};
    const ctx = c.getContext('2d');
    // Cover the frame: crop to the shape rather than squash it.
    const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.86);
  })()`);

  const base64 = String(dataUrl).split(",")[1] ?? "";
  if (!base64) throw new Error("the frame came back empty");

  writeFileSync(out, Buffer.from(base64, "base64"));
  console.log(`✓ wrote ${out}`);
} catch (err) {
  failed = true;
  console.error(`✗ ${err.message}`);
} finally {
  chrome.kill();
  server.close();
}

process.exit(failed ? 1 : 0);
