/**
 * Puts away the orders the payment check made, and gives the stock back.
 *
 * The check places real orders — the stock comes off the shelf when the
 * order is written — so it has to give it back. It does it through the
 * shop's own back office: the orders are cancelled there, and the stock
 * goes back on the shelf the same way a cancelled order always does.
 *
 *   node scripts/cleanup-razorpay-orders.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput, clickByText } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9349;

/** The orders to put away — the ones the check made. */
const MARKER = process.env.MARKER ?? "razorpay-check";

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const email =
  process.env.PF_ADMIN_EMAIL ?? env.match(/^PF_ADMIN_EMAIL="(.*)"/m)?.[1] ?? "";
// The password in the environment file is the one the shop was told to
// use; the seed's own is the fallback for a shop that has not changed it.
const passwords = [
  process.env.PF_ADMIN_PASSWORD,
  env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)?.[1],
  "myconsole@121",
].filter(Boolean);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), `playforge-cleanup-${randomBytes(4).toString("hex")}`),
  dir: join(ROOT, ".shots"),
});

try {
  // Sign in, so the back office will answer.
  let signedIn = false;
  for (const password of passwords) {
    await cdp.goto(`${BASE}/login`);
    await sleep(1200);
    await cdp.evaluate(setInput("email", email));
    await cdp.evaluate(setInput("password", password));
    await sleep(200);
    await cdp.evaluate(clickByText("Sign in"));
    for (let i = 0; i < 40; i++) {
      const at = await cdp.evaluate("location.pathname");
      if (at !== "/login") {
        signedIn = true;
        break;
      }
      await sleep(300);
    }
    if (signedIn) break;
  }
  if (!signedIn) throw new Error("the admin could not sign in");
  console.log("signed in, at:", await cdp.evaluate("location.pathname"));

  const who = await cdp.evaluate(
    `fetch('/api/admin/orders?limit=100').then(r => r.status)`
  );
  console.log("the back office answers:", who === 200 ? "yes" : `no (${who})`);

  // The orders the check made are the ones whose note carries the
  // marker, and the ones that are still waiting for a payment.
  const orders = await cdp.evaluate(
    `fetch('/api/admin/orders?limit=100').then(r => r.json()).then(d => (d.rows ?? []).map(o => ({
       id: o.id, name: o.name, email: o.email, status: o.status, notes: o.notes,
       payment_method: o.payment_method, total: o.total, created_at: o.created_at,
     })))`
  );

  const mine = orders.filter(
    (o) =>
      o.email === "razorpay@example.com" ||
      o.email === "razorpay-check@example.com" ||
      o.email === "razorpay-webhook@example.com" ||
      o.email === "race@example.com" ||
      o.email === "live-check@example.com" ||
      o.email === "live-idem@example.com" ||
      o.email === "phone@example.com" ||
      o.email === "mobile@example.com" ||
      (o.notes ?? "").includes(MARKER)
  );

  console.log(`orders to put away: ${mine.length}`);
  for (const o of mine) {
    console.log(`  ${o.id}  ${o.status}  ${o.payment_method}  ₹${o.total}  ${o.email}`);
  }

  let cancelled = 0;
  for (const o of mine) {
    if (o.status === "cancelled") continue;
    const result = await cdp.evaluate(
      `fetch('/api/admin/orders/${o.id}', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status: 'cancelled' }),
       }).then(r => r.json()).then(d => d.error ?? 'ok')`
    );
    if (result === "ok") {
      cancelled++;
      console.log(`  ✓ ${o.id} cancelled — the stock is back on the shelf`);
    } else {
      console.log(`  ✗ ${o.id} — ${result}`);
    }
    await sleep(300);
  }

  console.log(`\n${cancelled} order(s) put away.`);
} finally {
  chrome.kill();
}
