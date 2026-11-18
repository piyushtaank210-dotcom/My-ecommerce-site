/**
 * Checks the product editor's layout on every screen it is used on.
 *
 *   node scripts/check-editor-layout.mjs
 *
 * The dev server must be running on port 3000.
 *
 * The editor is a full-screen sheet with a fixed header, one area that
 * scrolls and a fixed bar of actions. Three things can go wrong with that
 * and are checked here at every width:
 *
 *   1. the sheet scrolls sideways — the page is wider than the screen;
 *   2. a control sticks out past the edge of the screen;
 *   3. the bar of actions sits on top of the last field, so that it can
 *      never be reached.
 *
 * It also checks that the fields are the size they are meant to be: a
 * field that is too short is hard to tap on a phone.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, waitForLive } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9228;

const WIDTHS = [320, 390, 768, 1024, 1440];

const PAGES = [
  ["/admin/products/new", "add product"],
  ["/admin/products/playstation-5-slim-disc-1tb", "edit product"],
];

/**
 * What the sheet looks like at this width.
 *
 * The scrollbar that matters is the editor's own, so the width that is
 * measured is the scrolling area's, not the document's.
 */
const MEASURE = `(async () => {
  const sheet = document.querySelector('.admin-editor-sheet');
  const scroll = document.querySelector('.admin-editor-scroll');
  const foot = document.querySelector('.admin-editor-foot');
  if (!sheet || !scroll || !foot) {
    return { missing: true };
  }

  const vw = document.documentElement.clientWidth;
  const doc = document.documentElement;

  // Anything that reaches past the right edge of the screen.
  const offenders = [];
  for (const el of sheet.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    // A row that slides sideways on purpose — the section navigation —
    // is not a fault.
    let scrollRow = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        scrollRow = true;
        break;
      }
    }
    if (scrollRow) continue;
    offenders.push({
      desc:
        el.tagName.toLowerCase() +
        (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
          : ''),
      right: Math.round(r.right),
      width: Math.round(r.width),
    });
  }

  // The bar of actions must not sit on top of the form. The scrolling
  // area and the bar are two parts of the sheet, so the test is that the
  // scrolling area ends where the bar begins — and that the last field
  // can be scrolled all the way into view.
  const footBox = foot.getBoundingClientRect();
  const scrollBox = scroll.getBoundingClientRect();
  const footOverlaps = scrollBox.bottom > footBox.top + 1;

  // The last field must be reachable: scrolled to the bottom, it has to
  // be inside the scrolling area and clear of the bar.
  scroll.scrollTop = scroll.scrollHeight;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const fields = [...scroll.querySelectorAll('input, select, textarea, [contenteditable]')];
  const last = fields[fields.length - 1];
  let lastReachable = true;
  if (last) {
    const r = last.getBoundingClientRect();
    lastReachable = r.bottom <= scrollBox.bottom + 1 && r.top >= scrollBox.top - 1;
  }
  scroll.scrollTop = 0;

  // The fields must be big enough to tap on a phone. The boxes that
  // switch something on are a different thing: the row around them is
  // the tap target, and the back office has always drawn them small.
  const TEXT_TYPES = new Set([
    "text",
    "number",
    "email",
    "url",
    "search",
    "password",
    "tel",
    "date",
  ]);
  const short = [];
  for (const field of fields) {
    // The formatting bar of the description editor is a bar of tools, not
    // a row of fields, and it is meant to be compact.
    if (field.closest('.admin-rte-bar')) continue;
    const r = field.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const tag = field.tagName.toLowerCase();
    if (tag === "input") {
      const type = (field.getAttribute("type") ?? "text").toLowerCase();
      if (!TEXT_TYPES.has(type)) continue;
    } else if (tag !== "select" && tag !== "textarea") {
      if (!field.isContentEditable) continue;
    }
    if (r.height < 36) {
      short.push({
        desc:
          tag +
          (field.name ? "[" + field.name + "]" : "") +
          (field.id ? "#" + field.id : ""),
        height: Math.round(r.height),
      });
    }
  }

  return {
    vw,
    scrollWidth: scroll.scrollWidth,
    clientWidth: scroll.clientWidth,
    docScrollWidth: doc.scrollWidth,
    overflow: scroll.scrollWidth > scroll.clientWidth + 1,
    docOverflow: doc.scrollWidth > vw + 1,
    offenders: offenders.slice(0, 6),
    offenderCount: offenders.length,
    footOverlaps,
    lastReachable,
    short: short.slice(0, 6),
    shortCount: short.length,
    footVisible: footBox.bottom <= window.innerHeight + 1 && footBox.height > 0,
  };
})()`;

let chrome;
let cdp;
let problems = 0;
let failures = 0;

function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const admin = await tokenForRole("admin");

try {
  const launched = await launchChrome({
    port: PORT,
    profile: join(tmpdir(), "consoleseller-editor-chrome-" + Date.now().toString(36)),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;

  // The editor is behind the back office's own sign-in.
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: admin,
    domain: "localhost",
    path: "/",
  });

  for (const [path, label] of PAGES) {
    console.log(`\n→ ${label} (${path})`);
    for (const width of WIDTHS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await cdp.goto(`${BASE}${path}`);
      await waitForLive(cdp, ".admin-editor-sheet");

      const m = await cdp.evaluate(MEASURE);
      if (m.missing) {
        check(`${label} @${width}px`, false, "the editor did not open");
        problems++;
        continue;
      }

      const bad =
        m.overflow ||
        m.docOverflow ||
        m.offenderCount > 0 ||
        m.footOverlaps ||
        !m.lastReachable ||
        !m.footVisible;

      if (bad) {
        problems++;
        console.log(`  ✗ ${label} @${width}px`);
        if (m.overflow) {
          console.log(
            `      the form scrolls sideways — ${m.scrollWidth} of content in ${m.clientWidth}`
          );
        }
        if (m.docOverflow) {
          console.log(`      the page scrolls sideways — ${m.docScrollWidth} in ${m.vw}`);
        }
        for (const o of m.offenders) {
          console.log(`      right=${o.right} w=${o.width}  ${o.desc}`);
        }
        if (m.footOverlaps) {
          console.log(`      the bar of actions sits on top of the form`);
        }
        if (!m.lastReachable) {
          console.log(`      the last field cannot be reached`);
        }
        if (!m.footVisible) {
          console.log(`      the bar of actions is not on the screen`);
        }
      } else {
        console.log(`  ✓ ${label} @${width}px`);
      }
    }
  }

  // The fields must be a sensible size to tap on.
  console.log("\n→ the fields are the right size");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.goto(`${BASE}/admin/products/new`);
  await waitForLive(cdp, "#name");
  const sized = await cdp.evaluate(MEASURE);
  check(
    "every field is at least 36 pixels tall",
    sized.shortCount === 0,
    sized.shortCount
      ? sized.short.map((s) => `${s.desc} ${s.height}px`).join(", ")
      : ""
  );
} finally {
  chrome?.kill();
}

console.log(
  failures === 0 && problems === 0
    ? "\n✓ ALL PASS — the product editor's layout"
    : `\n✗ ${failures} FAILURES, ${problems} page/width combos need work`
);
process.exit(failures === 0 && problems === 0 ? 0 : 1);
