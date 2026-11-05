/**
 * Checks that signing out really signs out — the session row is what
 * decides, and nothing else may override it.
 *
 *   node scripts/check-signout.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, clickByText, setInput } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9247;

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const email = env.match(/^PF_ADMIN_EMAIL="(.*)"/m)[1];
const password = env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)[1];

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-signout-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.goto(`${BASE}/login`);
  await sleep(1200);
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(3000);
  console.log("signed in ->", await cdp.evaluate("location.pathname"));

  await cdp.goto(`${BASE}/admin`);
  await sleep(1500);
  console.log("back office ->", await cdp.evaluate("location.pathname"));

  // Sign out, the way the sidebar does it.
  await cdp.evaluate(clickByText("Sign out", "button"));
  await sleep(2500);
  console.log("after signing out ->", await cdp.evaluate("location.pathname"));

  // The back office must now be out of reach.
  await cdp.goto(`${BASE}/admin`);
  await sleep(1600);
  const path = await cdp.evaluate("location.pathname");
  console.log("back office again ->", path);
  console.log(
    path.includes("/login")
      ? "✓ signing out really signs out"
      : "✗ still signed in after signing out"
  );
  if (!path.includes("/login")) process.exitCode = 1;
} finally {
  chrome.kill();
}
