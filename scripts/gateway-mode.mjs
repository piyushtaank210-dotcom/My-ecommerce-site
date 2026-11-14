/**
 * Swaps the shop between Razorpay's test keys and its live keys.
 *
 *   node scripts/gateway-mode.mjs test
 *   node scripts/gateway-mode.mjs live
 *   node scripts/gateway-mode.mjs show
 *
 * The keys live in `.env.local`, which is ignored by Git. The live keys
 * are kept in `.env.local.live`, which is ignored too, so that they are
 * in the file exactly once and this script never has to write them down.
 *
 * The swap refuses to run if the live keys are not there, and it says
 * plainly what it is about to do before it does it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = join(ROOT, ".env.local");
const LIVE = join(ROOT, ".env.local.live");

const mode = (process.argv[2] ?? "show").toLowerCase();

/** Reads the Razorpay lines out of a file. */
function gatewayKeys(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const get = (name) => {
    const m = new RegExp(`^${name}="?(.*?)"?$`, "m").exec(text);
    return m ? m[1] : null;
  };
  const keyId = get("RAZORPAY_KEY_ID");
  const keySecret = get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, text };
}

if (mode === "show") {
  const current = gatewayKeys(ENV);
  const live = gatewayKeys(LIVE);
  console.log("the shop is on:", current?.keyId?.startsWith("rzp_live_") ? "LIVE" : "test");
  console.log("  current key :", current?.keyId ?? "none");
  console.log("  live keys   :", live ? `${live.keyId} (in .env.local.live)` : "not set up");
  process.exit(0);
}

if (mode === "live") {
  const live = gatewayKeys(LIVE);
  if (!live) {
    console.error(
      "\n✗ There are no live keys in .env.local.live.\n\n" +
        "  Copy the two live keys from Razorpay's dashboard into that file:\n\n" +
        "    RAZORPAY_KEY_ID=\"rzp_live_...\"\n" +
        "    RAZORPAY_KEY_SECRET=\"...\"\n\n" +
        "  and run this again."
    );
    process.exit(1);
  }

  const current = gatewayKeys(ENV);
  if (current?.keyId === live.keyId) {
    console.log("the shop is already on the live keys.");
    process.exit(0);
  }

  console.log(`switching to the live keys (${live.keyId})…`);
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const set = (name, value) => {
    const line = `${name}="${value}"`;
    if (new RegExp(`^${name}=.*$`, "m").test(text)) {
      text = text.replace(new RegExp(`^${name}=.*$`, "m"), line);
    } else {
      text += `\n${line}\n`;
    }
  };
  set("RAZORPAY_KEY_ID", live.keyId);
  set("RAZORPAY_KEY_SECRET", live.keySecret);
  set("NEXT_PUBLIC_RAZORPAY_KEY_ID", live.keyId);
  // The shop talks to the real gateway in live mode.
  set("RAZORPAY_API_BASE", "https://api.razorpay.com");

  writeFileSync(ENV, text);
  console.log("✓ the shop is on the live keys. Restart the dev server.");
  process.exit(0);
}

if (mode === "test") {
  const live = gatewayKeys(LIVE);
  if (!live) {
    console.error(
      "\n✗ There are no live keys in .env.local.live, so there is nothing to\n" +
        "  switch back from."
    );
    process.exit(1);
  }

  console.log("switching to the test keys…");
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const set = (name, value) => {
    const line = `${name}="${value}"`;
    if (new RegExp(`^${name}=.*$`, "m").test(text)) {
      text = text.replace(new RegExp(`^${name}=.*$`, "m"), line);
    } else {
      text += `\n${line}\n`;
    }
  };
  set("RAZORPAY_KEY_ID", "rzp_test_TzkF7AiUD2DYcG");
  set("RAZORPAY_KEY_SECRET", "gTErpck8C2ZOWV6d648X3X2T");
  set("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_TzkF7AiUD2DYcG");
  // The mock of the gateway, so that a test payment is a test payment.
  set("RAZORPAY_API_BASE", "http://127.0.0.1:9595");

  writeFileSync(ENV, text);
  console.log("✓ the shop is on the test keys. Restart the dev server.");
  process.exit(0);
}

console.error(`\n✗ "${mode}" is not a mode. Use: test, live or show.`);
process.exit(1);
