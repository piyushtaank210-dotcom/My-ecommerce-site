/**
 * Lists what the hero actually fetches on a given screen: every picture
 * and every film, and where each one came from.
 *
 *   node scripts/hero-network.mjs [width] [height]
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9262;

const width = Number(process.argv[2] ?? 390);
const height = Number(process.argv[3] ?? 844);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-heronetwork-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });

  const fetched = [];
  await cdp.send("Network.enable");
  cdp.on?.("Network.requestWillBeSent", (p) => {
    const url = p.request?.url ?? "";
    if (/\/hero\//.test(url)) {
      fetched.push({
        file: url.split("/").pop().split("?")[0],
        kind: url.endsWith(".mp4") ? "film" : "picture",
        bytes: p.request?.url ? 0 : 0,
      });
    }
  });

  await cdp.goto(`${BASE}/`);
  await sleep(3500);

  // What is painted on the slide that is on screen.
  const painted = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const layers = [...section.querySelectorAll(':scope > div')];
    const pictureLayer = layers.find((d) => d.classList.contains('grid'));
    const slideDivs = [...pictureLayer.children];
    const shown = [...section.querySelectorAll('[aria-roledescription=slide]')]
      .find((s) => s.getAttribute('aria-hidden') !== 'true');
    const index = [...section.querySelectorAll('[aria-roledescription=slide]')]
      .indexOf(shown);
    const slide = slideDivs[index];
    const pictures = [...slide.querySelectorAll('img')]
      .filter((p) => getComputedStyle(p).display !== 'none')
      .map((p) => p.getAttribute('src'));
    const films = [...slide.querySelectorAll('video')]
      .filter((v) => getComputedStyle(v).display !== 'none')
      .map((v) => v.querySelector('source')?.getAttribute('src'));
    return { index: index + 1, pictures, films };
  })()`);

  console.log(`  screen: ${width}x${height}`);
  console.log(`  the slide on screen: ${painted.index}`);
  console.log(`  the picture painted: ${painted.pictures.join(", ") || "(none)"}`);
  console.log(`  the film painted   : ${painted.films.join(", ") || "(none)"}`);
  console.log("");
  console.log(`  everything fetched from /hero/ (${fetched.length}):`);
  const seen = new Set();
  for (const f of fetched) {
    const key = `${f.kind} ${f.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`    ${f.kind === "film" ? "film   " : "picture"} ${f.file}`);
  }
} finally {
  chrome.kill();
}
