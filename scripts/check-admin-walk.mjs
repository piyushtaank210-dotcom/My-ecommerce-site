/**
 * Walks the back office the way a person does — clicking the sidebar, and
 * on a narrow screen opening the drawer first — and reports where each
 * click lands and whether the session survived it.
 *
 *   node scripts/check-admin-walk.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { launchChrome, clickByText, setInput } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9238;

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const email = env.match(/^PF_ADMIN_EMAIL="(.*)"/m)[1];
const password = env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)[1];

const db = new DatabaseSync(join(ROOT, "data/store.db"));

/** How many sessions the signed-in account has, and how many are live. */
function sessionState() {
  const user = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (!user) return { user: null, total: 0, live: 0 };
  const total = db
    .prepare("SELECT COUNT(*) c FROM sessions WHERE user_id = ?")
    .get(user.id).c;
  const live = db
    .prepare(
      "SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND expires_at > datetime('now')"
    )
    .get(user.id).c;
  return { user: user.id, total, live };
}

const SIZES = [
  { name: "desktop 1440x900", w: 1440, h: 900 },
  { name: "laptop 1280x720", w: 1280, h: 720 },
  { name: "short 1440x520", w: 1440, h: 520 },
  { name: "tablet 768x1024", w: 768, h: 1024 },
  { name: "phone 390x844", w: 390, h: 844 },
];

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-adminwalk-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  // Sign in once.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.goto(`${BASE}/login`);
  await sleep(1200);
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(3000);
  console.log("signed in, path:", await cdp.evaluate("location.pathname"));
  console.log("sessions before:", JSON.stringify(sessionState()));
  console.log();

  for (const size of SIZES) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: size.w,
      height: size.h,
      deviceScaleFactor: 1,
      mobile: size.w < 768,
    });

    await cdp.goto(`${BASE}/admin`);
    await sleep(1200);

    // On a narrow screen the sidebar is a drawer that has to be opened.
    if (size.w < 1024) {
      await cdp.evaluate(
        `document.querySelector('[aria-label="Open menu"]')?.click()`
      );
      await sleep(700);
    }

    const links = await cdp.evaluate(`(() => {
      const nav = document.querySelector('aside nav') || document.querySelector('nav');
      if (!nav) return [];
      return [...nav.querySelectorAll('a')].map(a => a.getAttribute('href'));
    })()`);

    console.log(`— ${size.name} — ${links.length} nav item(s)`);

    for (const href of links) {
      if (size.w < 1024) {
        // Reopen the drawer for each click.
        await cdp.goto(`${BASE}/admin`);
        await sleep(900);
        await cdp.evaluate(
          `document.querySelector('[aria-label="Open menu"]')?.click()`
        );
        await sleep(600);
      }

      const res = await cdp.evaluate(`(() => {
        const a = [...document.querySelectorAll('aside nav a, nav a')].find(
          el => el.getAttribute('href') === ${JSON.stringify(href)}
        );
        if (!a) return { state: 'NOT_FOUND' };
        const r = a.getBoundingClientRect();
        // What is actually on top at the link's centre?
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        a.click();
        return {
          state: 'CLICKED',
          covered: top !== a && !a.contains(top) ? top.tagName + '.' + String(top.className).slice(0, 40) : null,
        };
      })()`);

      await sleep(1300);
      const path = await cdp.evaluate("location.pathname");
      const sess = sessionState();
      const ok = path === href;
      console.log(
        `   ${ok ? "✓" : "✗"} ${String(href).padEnd(20)} -> ${String(path).padEnd(22)}` +
          ` sessions ${sess.live}/${sess.total}` +
          (res.covered ? `  [covered by ${res.covered}]` : "") +
          (res.state === "NOT_FOUND" ? "  [NOT_FOUND]" : "")
      );
    }
    console.log();
  }
} finally {
  chrome.kill();
}
