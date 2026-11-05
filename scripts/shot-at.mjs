/**
 * Captures a screenshot at a given scroll position, so a single section can
 * be looked at on its own instead of squinting at a whole-page shot.
 *
 *   node scripts/shot-at.mjs <url> <name> <width> <height> <scrollY> [waitMs]
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const target = process.argv[2] ?? "/";
const name = process.argv[3] ?? "shot";
const width = Number(process.argv[4] ?? 375);
const height = Number(process.argv[5] ?? 780);
const scrollY = Number(process.argv[6] ?? 0);
const waitMs = Number(process.argv[7] ?? 2500);

const { chrome, cdp } = await launchChrome({
  port: 9227,
  profile: join(tmpdir(), "consoleseller-scroll-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });

  const url = target.startsWith("http") ? target : `${BASE}${target}`;
  console.log("navigating to", url);

  await cdp.goto(url);
  await sleep(waitMs);

  if (scrollY) {
    await cdp.evaluate(`window.scrollTo(0, ${scrollY}); 'ok'`);
    await sleep(900);
  }

  // The viewport stays at width x height, so the capture is exactly what a
  // phone shows at that scroll position.
  await cdp.shot(name, false);
  console.log(`📸 .shots/${name}.png  (scrolled to ${scrollY}px)`);
} finally {
  chrome.kill();
}
