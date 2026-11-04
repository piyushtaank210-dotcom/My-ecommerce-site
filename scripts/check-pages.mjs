/**
 * Opens every page and says whether the browser complained.
 *
 * A page that renders can still be broken: a hydration mismatch, a
 * duplicate key, a warning in the console. None of it shows in the HTML,
 * and none of it is caught by the other suites, which look at what the page
 * says rather than at what the page does in the browser.
 *
 *   node scripts/check-pages.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new DatabaseSync(join(ROOT, "data/store.db"));

const user = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@playforge.test");
const token = randomBytes(32).toString("hex");
db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
  token,
  user.id,
  new Date(Date.now() + 3600_000).toISOString()
);

const { chrome, cdp } = await launchChrome({
  port: 9336,
  profile: join(tmpdir(), "playforge-review-chrome"),
  dir: join(ROOT, ".shots"),
});

// The browser has to be signed in, or every admin page is the login page.
await cdp.send("Network.enable");
await cdp.send("Network.setCookie", {
  name: "pf_auth",
  value: token,
  domain: "localhost",
  path: "/",
});

const messages = [];
cdp.on("Runtime.consoleAPICalled", (p) => {
  if (p.type !== "error" && p.type !== "warning") return;
  const text = (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
  if (!/hydrat|did not match|Warning|Error/i.test(text)) return;
  messages.push({ type: p.type, text });
});
cdp.on("Runtime.exceptionThrown", (p) => {
  messages.push({
    type: "exception",
    text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "",
  });
});

const pages = [
  "/admin",
  "/admin/products",
  "/admin/products/playstation-5-slim-disc-1tb",
  "/admin/products/new",
  "/admin/inventory",
  "/admin/inventory/history",
  "/admin/categories",
  "/admin/import",
  "/admin/orders",
  "/admin/users",
  "/admin/messages",
  "/account",
  "/account/orders",
  "/account/addresses",
  "/account/profile",
  "/",
  "/shop",
  "/product/playstation-5-slim-disc-1tb",
  "/category/consoles",
  "/cart",
  "/search?q=dualsense",
];

let failures = 0;

for (const path of pages) {
  messages.length = 0;
  await cdp.goto(`${BASE}${path}`);
  await new Promise((r) => setTimeout(r, 1500));
  const complaints = messages.filter(
    (m) => m.type === "error" || m.type === "warning"
  );
  if (complaints.length === 0) {
    console.log(`  ✓ ${path}`);
    continue;
  }
  failures++;
  console.log(`  ✗ ${path}`);
  for (const m of complaints) {
    console.log(
      `      [${m.type}] ${m.text.split("\n")[0].slice(0, 220)}`
    );
  }
}

chrome.kill();
db.close();

console.log(
  failures === 0
    ? "\n✓ ALL PASS — no page complains"
    : `\n✗ ${failures} page(s) complained`
);
process.exit(failures === 0 ? 0 : 1);
