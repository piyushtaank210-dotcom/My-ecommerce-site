/**
 * Captures each slide of the hero on a phone, so the mobile pictures can
 * be looked at one by one.
 *
 *   node scripts/shot-hero-slides.mjs [width] [height] [prefix]
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9259;

const width = Number(process.argv[2] ?? 390);
const height = Number(process.argv[3] ?? 844);
const prefix = process.argv[4] ?? "hero-phone";
const slides = Number(process.argv[5] ?? 5);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-heroslides-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await cdp.goto(`${BASE}/`);
  await sleep(2500);

  for (let i = 0; i < slides; i++) {
    const state = await cdp.evaluate(`(() => {
      const section = document.querySelector('section[aria-roledescription=carousel]');
      const layers = [...section.querySelectorAll(':scope > div')];
      const pictureLayer = layers.find((d) => d.classList.contains('grid'));
      const slideDivs = [...pictureLayer.children];
      const shown = [...section.querySelectorAll('[aria-roledescription=slide]')]
        .find((s) => s.getAttribute('aria-hidden') !== 'true');
      const painted = [...slideDivs.flatMap((d) => [...d.querySelectorAll('img')])]
        .filter((p) => getComputedStyle(p).display !== 'none')
        .map((p) => p.getAttribute('src'));
      const film = [...slideDivs.flatMap((d) => [...d.querySelectorAll('video')])]
        .find((v) => getComputedStyle(v).display !== 'none');
      return {
        slide: shown?.getAttribute('aria-label') ?? null,
        pictures: painted,
        film: film ? film.getAttribute('poster') : null,
        playing: film ? !film.paused : null,
      };
    })()`);

    console.log(
      `  slide ${state.slide}  picture: ${state.pictures.join(", ") || "(none)"}` +
        (state.film ? `  film: ${state.film}${state.playing ? " (playing)" : ""}` : "")
    );
    await cdp.shot(`${prefix}-${i + 1}`, false);

    if (i < slides - 1) {
      await cdp.evaluate(
        `document.querySelector('[aria-label="Next slide"]')?.click()`
      );
      await sleep(1400);
    }
  }
  console.log(`\n✓ wrote ${slides} shots to .shots/`);
} finally {
  chrome.kill();
}
