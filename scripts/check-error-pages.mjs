/**
 * Opens every page of the shop and says which ones the browser complained
 * about. A page that renders can still be broken: a hydration mismatch, a
 * duplicate key, an error in a client component.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9261;

const PAGES = [
  "/",
  "/shop",
  "/login",
  "/register",
  "/contact",
  "/privacy-policy",
  "/refund-policy",
  "/terms-of-service",
  "/category/consoles",
  "/category/controllers",
  "/search?q=playstation",
  "/cart",
  "/admin",
  "/admin/products",
  "/admin/orders",
  "/admin/inventory",
  "/admin/categories",
  "/admin/users",
  "/admin/messages",
  "/admin/returns",
  "/admin/settings",
];

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-errorhunt-chrome"),
  dir: join(ROOT, ".shots"),
});

let failures = 0;

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const path of PAGES) {
    const errors = [];
    const onConsole = (m) => {
      if (m.type === "error") errors.push(m.text);
    };
    cdp.on?.("Runtime.consoleAPICalled", onConsole);

    await cdp.goto(`${BASE}${path}`);
    await sleep(1800);

    const state = await cdp.evaluate(`(() => {
      const body = document.body.innerText || '';
      const boundary = body.includes('Something went wrong');
      const digest = (body.match(/digest[^a-z0-9]*([a-z0-9]+)/i) || [])[1] || null;
      return { boundary, digest, title: document.title, len: body.length };
    })()`);

    cdp.off?.("Runtime.consoleAPICalled", onConsole);

    const bad = state.boundary || errors.length > 0;
    if (bad) failures++;
    console.log(
      `${bad ? "✗" : "✓"} ${path.padEnd(26)} ${state.len} chars` +
        (state.boundary ? "  ← ERROR BOUNDARY" : "") +
        (state.digest ? ` (digest ${state.digest})` : "") +
        (errors.length ? `\n     console: ${errors.slice(0, 3).join(" | ").slice(0, 300)}` : "")
    );
  }
} finally {
  chrome.kill();
}

console.log(failures ? `\n✗ ${failures} page(s) had trouble` : "\n✓ every page is well");
process.exit(failures ? 1 : 0);
