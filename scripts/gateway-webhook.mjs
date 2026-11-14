/**
 * The shop's webhook at Razorpay.
 *
 *   node scripts/gateway-webhook.mjs show [--live]
 *   node scripts/gateway-webhook.mjs set <url> [--live]
 *   node scripts/gateway-webhook.mjs secret [--live]
 *
 * `show` says what is on the gateway: the webhook's address, whether it
 * is active, and which events it listens for.
 *
 * `set` makes the webhook — creating it if it is not there — with the
 * events the shop acts on.
 *
 * `secret` makes a new secret, writes it to the webhook and to
 * `.env.local`, and says how to get it onto the deployment.
 *
 * `--live` uses the live keys in `.env.local.live`, so that the webhook
 * can be looked at and fixed while the shop itself is running against
 * the mock. Without it, the keys in `.env.local` are used — which is the
 * account the shop is currently talking to.
 *
 * The events are sent as a map of every event to a flag, which is the
 * shape Razorpay hands back when it is asked what a webhook listens
 * for. Razorpay's API will not accept them as a list — it says "the
 * json request could not be decoded" for a list of one and "invalid
 * event name" for a list of two — so the map is the only shape that
 * works.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = join(ROOT, ".env.local");
const LIVE = join(ROOT, ".env.local.live");

const useLive = process.argv.includes("--live");
const words = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mode = (words[0] ?? "show").toLowerCase();

/** The events the shop acts on. */
const EVENTS = ["payment.captured", "payment.failed"];

/** The key id and secret for the account being worked on. */
function gatewayKeys() {
  const file = useLive ? LIVE : ENV;
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const get = (name) => {
    const m = new RegExp(`^${name}="?(.*?)"?$`, "m").exec(text);
    return m ? m[1] : null;
  };
  const keyId = get("RAZORPAY_KEY_ID");
  const keySecret = get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    auth: Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
  };
}

/** The webhook at the gateway, if there is one. */
async function theWebhook() {
  const list = await fetch("https://api.razorpay.com/v1/webhooks", {
    headers: { Authorization: `Basic ${keys.auth}` },
  }).then((r) => r.json());
  return (list.items ?? [])[0] ?? null;
}

/** Every event the gateway knows about, with a flag for each. */
async function everyEvent() {
  const w = await theWebhook();
  return { ...(w?.events ?? {}) };
}

/** The secret in the environment file, if there is one. */
function currentSecret() {
  if (!existsSync(ENV)) return "placeholder";
  const m = /^RAZORPAY_WEBHOOK_SECRET="?(.*?)"?$/m.exec(
    readFileSync(ENV, "utf8")
  );
  return m ? m[1] : "placeholder";
}

/** The events a webhook is listening for, as words. */
function eventsOn(webhook) {
  return Object.entries(webhook?.events ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/* ----------------------------------------------------------------- modes */

async function show() {
  const w = await theWebhook();
  if (!w) {
    console.log("\nThere is no webhook at the gateway yet.");
    console.log("  node scripts/gateway-webhook.mjs set <url>");
    return 0;
  }
  const on = eventsOn(w);
  console.log("\nthe webhook at Razorpay");
  console.log("  id     :", w.id);
  console.log("  url    :", w.url);
  console.log("  active :", w.active);
  console.log("  secret :", w.secret_exists ? "set" : "MISSING");
  console.log(
    "  events :",
    on.length ? on.join(", ") : "(none — the shop will not hear about payments)"
  );
  if (!on.length) {
    console.log("\n  node scripts/gateway-webhook.mjs set " + w.url);
  }
  return 0;
}

async function set() {
  const url = words[1];
  if (!url) {
    console.error(
      "\n✗ Which address? The webhook is sent to the shop's own site:\n\n" +
        "    node scripts/gateway-webhook.mjs set https://your-shop.example/api/webhooks/razorpay"
    );
    return 1;
  }
  if (!url.startsWith("https://")) {
    console.error(
      "\n✗ The address has to be https. Razorpay will not call anything else."
    );
    return 1;
  }

  const events = await everyEvent();
  for (const e of EVENTS) events[e] = true;

  const w = await theWebhook();
  const body = { url, secret: currentSecret(), events, active: true };

  const res = w
    ? await fetch(`https://api.razorpay.com/v1/webhooks/${w.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${keys.auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    : await fetch("https://api.razorpay.com/v1/webhooks", {
        method: "POST",
        headers: {
          Authorization: `Basic ${keys.auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

  const answer = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(
      `\n✗ Razorpay refused it: ${answer.error?.description ?? JSON.stringify(answer)}`
    );
    return 1;
  }
  const on = eventsOn(answer);
  console.log(`\n✓ the webhook is set: ${url}`);
  console.log("  events :", on.join(", ") || "(none)");
  return 0;
}

async function secret() {
  const w = await theWebhook();
  if (!w) {
    console.error("\n✗ There is no webhook at the gateway yet.");
    return 1;
  }
  const newSecret = randomBytes(24).toString("base64url");
  const events = await everyEvent();

  const res = await fetch(`https://api.razorpay.com/v1/webhooks/${w.id}`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${keys.auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: w.url, secret: newSecret, events, active: true }),
  });
  if (!res.ok) {
    const answer = await res.json().catch(() => ({}));
    console.error(
      `\n✗ Razorpay refused it: ${answer.error?.description ?? JSON.stringify(answer)}`
    );
    return 1;
  }

  // Put it in the environment file, where `deploy:env` will find it.
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const line = `RAZORPAY_WEBHOOK_SECRET="${newSecret}"`;
  if (/^RAZORPAY_WEBHOOK_SECRET=.*$/m.test(text)) {
    text = text.replace(/^RAZORPAY_WEBHOOK_SECRET=.*$/m, line);
  } else {
    text += `\n${line}\n`;
  }
  writeFileSync(ENV, text);

  console.log(
    "\n✓ a new secret is set on the webhook and written to .env.local"
  );
  console.log("  now put it on the deployment:");
  console.log("    node scripts/deploy-env.mjs <project-slug>");
  return 0;
}

/* ------------------------------------------------------------------ run */

const keys = gatewayKeys();
if (!keys) {
  console.error(
    "\n✗ No gateway keys in " +
      (useLive ? ".env.local.live" : ".env.local") +
      ".\n"
  );
  process.exitCode = 1;
} else if (mode === "show") {
  process.exitCode = await show();
} else if (mode === "set") {
  process.exitCode = await set();
} else if (mode === "secret") {
  process.exitCode = await secret();
} else {
  console.error(`\n✗ "${mode}" is not a mode. Use: show, set or secret.`);
  process.exitCode = 1;
}
