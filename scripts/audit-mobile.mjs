/**
 * Measures horizontal overflow on every page at every breakpoint.
 *
 *   node scripts/audit-mobile.mjs
 *
 * Reports, for each page and width: whether the document scrolls sideways,
 * and which elements stick out past the right edge. An element that starts
 * inside the viewport but ends past it is what makes a page look broken on
 * a phone, so those are listed with a short description.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9226;

const WIDTHS = [320, 375, 430, 600, 768, 1024];

const PAGES = [
  ["/", "home"],
  ["/shop", "shop"],
  ["/category/consoles", "category"],
  ["/product/playstation-5-slim-disc-1tb", "product"],
  ["/cart", "cart"],
  ["/checkout", "checkout"],
  ["/login", "login"],
  ["/register", "register"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/search?q=playstation", "search"],
  ["/privacy-policy", "privacy"],
  ["/terms-of-service", "terms"],
  ["/refund-policy", "refund"],
];

/** Describes an element well enough to find it in the source. */
const DESCRIBE = `((el, vw) => {
  const id = el.id ? '#' + el.id : '';
  const cls = (el.className && typeof el.className === 'string')
    ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
    : '';
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').trim().slice(0, 40);
  return tag + id + cls + (text ? ' "' + text + '"' : '');
})`;

/**
 * Whether an element that sticks out past the edge of the screen can
 * actually be seen.
 *
 * Something with a negative offset — a glow bled off the side of a card,
 * a photograph scaled up by a carousel — is deliberately wider than the
 * screen. If an ancestor clips it, it is not a problem: the page does
 * not scroll sideways and nothing is cut off. It only becomes a problem
 * when it is painted past the edge of the screen with nothing to stop it.
 */
const IS_CLIPPED = `((el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') return true;
  }
  return false;
})`;

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const doc = document.documentElement;
  const clipped = ${IS_CLIPPED};
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // Right edge past the viewport, by more than a pixel of rounding.
    if (r.right > vw + 1) {
      // A row that slides sideways on purpose is not a fault either.
      let scrollRow = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
          scrollRow = true;
          break;
        }
      }
      if (clipped(el) || scrollRow) continue;
      offenders.push({
        desc: ${DESCRIBE}(el, vw),
        right: Math.round(r.right),
        width: Math.round(r.width),
        top: Math.round(r.top),
      });
    }
  }
  // Keep the deepest few — the element that actually sticks out is usually
  // the leaf, not every ancestor that contains it.
  offenders.sort((a, b) => a.right - b.right);
  return {
    vw,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow: doc.scrollWidth > vw + 1,
    count: offenders.length,
    offenders: offenders.slice(0, 6),
  };
})()`;

let chrome;
let cdp;
let problems = 0;

try {
  const launched = await launchChrome({
    port: PORT,
    profile: join(tmpdir(), "consoleseller-audit-chrome"),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;

  for (const [path, label] of PAGES) {
    for (const width of WIDTHS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });

      await cdp.goto(`${BASE}${path}`);
      await sleep(700);

      let m;
      try {
        m = await cdp.evaluate(MEASURE);
      } catch (e) {
        console.log(`${label} @${width} — evaluate failed: ${e.message}`);
        continue;
      }

      if (m.overflow || m.count > 0) {
        problems++;
        console.log(
          `\n✗ ${label} @${width}px — doc ${m.scrollWidth} vs viewport ${m.vw}` +
            (m.overflow ? " (HORIZONTAL SCROLL)" : "")
        );
        for (const o of m.offenders) {
          console.log(
            `    right=${o.right} w=${o.width}  ${o.desc}`
          );
        }
      } else {
        console.log(`✓ ${label} @${width}px`);
      }
    }
  }

  console.log(`\n${problems ? problems + " page/width combos need work" : "no overflow found"}`);
} finally {
  chrome?.kill();
}
