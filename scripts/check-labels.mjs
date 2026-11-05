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

const CHECK = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('a, button')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    // The width the text would need, measured on a clone that is allowed to
    // be as wide as it likes.
    const range = document.createRange();
    range.selectNodeContents(el);
    const textW = range.getBoundingClientRect().width;
    const cs = getComputedStyle(el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const inner = r.width - padX;
    if (textW > inner + 1 && el.scrollWidth <= el.clientWidth + 1) {
      out.push({
        text: (el.textContent || '').trim().slice(0, 40),
        textW: Math.round(textW),
        inner: Math.round(inner),
        w: Math.round(r.width),
        clipped: el.scrollWidth > el.clientWidth + 1,
        cls: (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0,4).join('.'),
      });
    }
  }
  return out;
})()`;

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

      const out = await cdp.evaluate(CHECK);
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
