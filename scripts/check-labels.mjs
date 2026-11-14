/**
 * Reports whether any button's text is wider than the button itself — the
 * label is clipped or spills out of the control.
 *
 *   node scripts/check-labels.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";
import { LABEL_CHECK } from "./lib/label-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const WIDTHS = [320, 375];
const PAGES = [
  "/",
  "/shop",
  "/product/playstation-5-slim-disc-1tb",
  "/cart",
  "/contact",
  "/search?q=playstation",
];

const { chrome, cdp } = await launchChrome({
  port: 9233,
  profile: join(tmpdir(), "consoleseller-label-chrome"),
  dir: join(ROOT, ".shots"),
});

let bad = 0;
try {
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await cdp.goto(`${BASE}${path}`);
      await sleep(1400);

      const out = await cdp.evaluate(LABEL_CHECK);
      if (out.length) {
        bad += out.length;
        console.log(`\n✗ ${path} @${width}px`);
        for (const o of out) {
          console.log(
            `    "${o.text}" needs ${o.textW}px, has ${o.inner}px` +
              ` (btn ${o.w}px) ${o.clipped ? "[CLIPPED]" : "[OVERFLOWS]"}`
          );
        }
      }
    }
  }
  console.log(bad ? `\n${bad} label problem(s)` : "\n✓ no clipped labels");
} finally {
  chrome.kill();
}
