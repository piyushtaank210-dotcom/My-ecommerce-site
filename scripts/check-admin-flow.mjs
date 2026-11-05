/**
 * The flow a person actually takes: they follow a link into the back
 * office while signed out, sign in, and then click through it.
 *
 *   node scripts/check-admin-flow.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, clickByText, setInput } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9242;

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const email = env.match(/^PF_ADMIN_EMAIL="(.*)"/m)[1];
const password = env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)[1];

// A profile that has never been used, so nothing is carried over.
const profile = join(tmpdir(), `consoleseller-flow-${Date.now()}`);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile,
  dir: join(ROOT, ".shots"),
});

try {
  // 1. Follow a link into the back office while signed out.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(1600);
  const atLogin = await cdp.evaluate("location.href");
  console.log(`1. followed a link into the back office -> ${atLogin}`);
  console.log(
    `   ${atLogin.includes("/login") ? "✓ sent to sign in" : "✗ not sent to sign in"}`
  );
  console.log(
    `   next carried over: ${
      /[?&]next=([^&]*)/.exec(atLogin)?.[1] ?? "NONE — the destination was lost"
    }`
  );

  // 2. Sign in.
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(3200);
  const afterLogin = await cdp.evaluate("location.pathname");
  console.log(`2. signed in -> ${afterLogin}`);
  console.log(
    `   ${afterLogin === "/admin/products" ? "✓ returned to where they were going" : "✗ did not return"}`
  );

  // 3. Now click through every link in the sidebar.
  await cdp.goto(`${BASE}/admin`);
  await sleep(1400);

  const links = await cdp.evaluate(`(() => {
    const nav = document.querySelector('nav');
    return nav ? [...nav.querySelectorAll('a')].map(a => a.getAttribute('href')) : [];
  })()`);

  let failures = 0;
  for (const href of links) {
    await cdp.goto(`${BASE}/admin`);
    await sleep(1000);
    await cdp.evaluate(`(() => {
      const a = [...document.querySelectorAll('aside nav a')].find(
        el => el.getAttribute('href') === ${JSON.stringify(href)}
      );
      if (a) a.click();
    })()`);
    await sleep(1400);
    const path = await cdp.evaluate("location.pathname");
    const ok = path === href;
    if (!ok) failures++;
    console.log(`   ${ok ? "✓" : "✗"} ${String(href).padEnd(20)} -> ${path}`);
  }

  console.log(
    `\n${failures === 0 ? "✓ the whole flow works" : `✗ ${failures} link(s) bounced away`}`
  );
} finally {
  chrome.kill();
}
