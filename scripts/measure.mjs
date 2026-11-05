/**
 * Measures specific elements on a page at a given width — the header, the
 * hero, a card — and prints their sizes.
 *
 *   node scripts/measure.mjs <path> <width> <selector> [<selector> ...]
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const path = process.argv[2] ?? "/";
const width = Number(process.argv[3] ?? 375);
const selectors = process.argv.slice(4);

const { chrome, cdp } = await launchChrome({
  port: 9231,
  profile: join(tmpdir(), "consoleseller-measure-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 780,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await cdp.goto(`${BASE}${path}`);
  await sleep(2200);

  const out = await cdp.evaluate(`(() => {
    const sels = ${JSON.stringify(selectors)};
    return sels.map(sel => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return { sel, missing: true };
      return {
        sel,
        items: els.map((el, i) => {
          const r = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          const aria = el.getAttribute('aria-label') || '';
          const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).slice(0,2).join('.');
          return {
            i, tag, aria, cls,
            x: Math.round(r.x), w: Math.round(r.width),
            right: Math.round(r.right), h: Math.round(r.height),
          };
        }),
      };
    });
  })()`);

  console.log(`viewport ${width}px on ${path}`);
  for (const r of out) {
    if (r.missing) {
      console.log(`  ${r.sel}: NOT FOUND`);
      continue;
    }
    console.log(`  ${r.sel}:`);
    for (const it of r.items) {
      console.log(
        `    [${it.i}] ${it.tag}${it.aria ? ` aria="${it.aria}"` : ""} .${it.cls}` +
          `  x=${it.x} w=${it.w} right=${it.right} h=${it.h}`
      );
    }
  }
} finally {
  chrome.kill();
}
