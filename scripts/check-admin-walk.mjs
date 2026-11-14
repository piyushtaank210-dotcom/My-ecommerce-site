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
import { launchChrome, clickByText, setInput, waitFor } from "./lib/browser.mjs";
import { sessionState } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9238;

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const email = env.match(/^PF_ADMIN_EMAIL="(.*)"/m)[1];
const password = env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)[1];

/*
  How many sessions the signed-in account has, and how many are live.

  The count comes from the shop's own database, which is where the
  sessions live. It used to be read from the old local file, which
  nothing reads any more — so the count was always zero and the check
  that the session survived a click was not checking anything.
*/
const sessionCounts = () => sessionState(email);

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

/*
  Every click that landed somewhere other than where it was asked to.

  The script used to print a cross for a click that missed and then exit
  as if nothing had happened, so `npm run check:admin` reported success
  over a walk that had failed. The count is what makes the walk a check.
*/
let missed = 0;

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
  console.log("sessions before:", JSON.stringify(await sessionCounts()));
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

      // The click is made, and then the walk waits for the page to arrive
      // rather than for a fixed length of time.
      //
      // A fixed wait is the wrong shape here: the shop's database is a
      // long way off, so the URL of a page that has been clicked does
      // not change until the new page's data has come back. Waiting a
      // second and a half and then reading the address reads the address
      // of the page before the click — which is how a click on "Returns"
      // came to be reported as landing on "Orders".
      await waitFor(
        cdp,
        `location.pathname === ${JSON.stringify(href)}`,
        { timeout: 20000 }
      );
      const path = await cdp.evaluate("location.pathname");
      const sess = await sessionCounts();
      const ok = path === href;
      if (!ok) missed++;
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

console.log(
  missed === 0
    ? "\n✓ every link in the back office goes where it says"
    : `\n✗ ${missed} link(s) went somewhere else`
);
process.exit(missed === 0 ? 0 : 1);
