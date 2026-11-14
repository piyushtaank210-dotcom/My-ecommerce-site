/**
 * Checks that a signed-in staff member following /login?next=/admin lands
 * on the back office rather than on their customer account.
 *
 *   node scripts/check-admin-redirect.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";
import { tokenForRole, deleteToken } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9241;

// The session is made in the shop's own database, which is where the
// back office looks for it.
const token = await tokenForRole("admin");

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-adminredirect-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: token,
    domain: "localhost",
    path: "/",
  });

  const cases = [
    ["/login?next=%2Fadmin", "/admin", "staff following a link to the back office"],
    ["/login?next=%2Fadmin%2Forders", "/admin/orders", "staff heading for one section"],
    ["/login", "/account", "someone with no destination"],
  ];

  for (const [url, expected, why] of cases) {
    await cdp.goto(`${BASE}${url}`);
    await sleep(1400);
    const path = await cdp.evaluate("location.pathname");
    console.log(
      `  ${path === expected ? "✓" : "✗"} ${url.padEnd(30)} -> ${path.padEnd(16)} (${why})`
    );
  }
} finally {
  chrome.kill();
  await deleteToken(token);
}
