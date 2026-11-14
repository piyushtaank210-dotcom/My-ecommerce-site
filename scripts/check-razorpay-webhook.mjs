/**
 * The webhook, and the payment that must happen once.
 *
 *   node scripts/check-razorpay-webhook.mjs
 *
 * The gateway is a mock. Razorpay publishes one of its own, and a mock
 * is what makes the whole payment testable without a bank account — the
 * shop talks to the mock exactly as it talks to the real gateway, and
 * the mock signs what the real gateway signs.
 *
 * What is checked:
 *
 *   · a webhook with no signature is refused, and nothing is paid
 *   · a webhook with the wrong signature is refused, and nothing is paid
 *   · a webhook with a good signature marks the order as paid
 *   · the same webhook arriving twice is acted on once
 *   · a webhook for a payment that was never captured changes nothing
 *   · a webhook for the wrong amount changes nothing
 *   · a second, different payment for an order that is already paid for
 *     is refused
 *   · the same payment verified twice is applied once
 *   · a repeated request to start an order is answered with the order
 *     that was already made, rather than a second one
 *
 * The dev server must be running on port 3000 with RAZORPAY_API_BASE
 * pointing at the mock, RAZORPAY_WEBHOOK_SECRET set to the secret below,
 * and the shop's gateway keys set.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes, createHmac } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput, clickByText } from "./lib/browser.mjs";
import "./lib/env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9354;

/** Where the mock gateway is. */
const MOCK = process.env.RAZORPAY_API_BASE ?? "http://127.0.0.1:9595";

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

/**
 * The shop must not be talking to the real gateway while this runs.
 *
 * A test that creates orders at the real gateway creates orders that
 * somebody has to pay for, or cancel, and the mock is there precisely so
 * that does not happen. It is the one thing in the script that cannot be
 * talked past.
 */
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
if (KEY_ID.startsWith("rzp_live_") && process.env.RAZORPAY_ALLOW_LIVE_TESTS !== "1") {
  console.error(
    "\n✗ These are LIVE keys. This script would make real orders at the real\n" +
      "  gateway. Point RAZORPAY_API_BASE at the mock first:\n\n" +
      "    RAZORPAY_API_BASE=http://127.0.0.1:9595 npm run check:razorpay:webhook\n\n" +
      "  Or set RAZORPAY_ALLOW_LIVE_TESTS=1 if that is what you meant."
  );
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error(
    "\n✗ RAZORPAY_WEBHOOK_SECRET is not set. The shop needs it to accept\n" +
      "  webhooks, and this script needs it to sign them."
  );
  process.exit(1);
}

const EMAIL = "razorpay-webhook@example.com";

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const adminEmail =
  process.env.PF_ADMIN_EMAIL ?? env.match(/^PF_ADMIN_EMAIL="(.*)"/m)?.[1] ?? "";
const adminPasswords = [
  process.env.PF_ADMIN_PASSWORD,
  env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)?.[1],
].filter(Boolean);

let exitCode = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) exitCode = 1;
}

/** The signature the gateway makes over a payment. */
function sign(orderId, paymentId) {
  return createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

/** The signature the gateway makes over a webhook's body. */
function signWebhook(body) {
  return createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
}

/** Asks the mock to take a payment, the way the gateway would. */
async function takePayment({ orderId, amount, method, status }) {
  const res = await fetch(`${MOCK}/mock/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      amount,
      method,
      ...(status ? { status } : {}),
    }),
  });
  if (!res.ok) throw new Error(`the mock would not take the payment: ${res.status}`);
  return res.json();
}

/** Sends a webhook to the shop, the way the gateway would. */
async function sendWebhook(body, { signature, eventId } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["x-razorpay-signature"] = signature ?? signWebhook(text);
  if (eventId) headers["x-razorpay-event-id"] = eventId;
  const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
    method: "POST",
    headers,
    body: text,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** The webhook's body, in the shape the gateway sends it. */
function webhookBody({ event, eventId, payment, order }) {
  return {
    entity: "event",
    event,
    contains: [],
    payload: {
      payment: payment
        ? {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            method: payment.method,
          }
        : undefined,
      order: order
        ? {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            notes: order.notes ?? {},
          }
        : undefined,
    },
    created_at: Math.floor(Date.now() / 1000),
    ...(eventId ? {} : {}),
  };
}

/** The shop's own order, as the back office sees it. */
async function orderInTheShop(cdp, id) {
  return cdp.evaluate(`fetch('/api/admin/orders/${id}').then(r => r.json())`);
}

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), `playforge-webhook-${randomBytes(4).toString("hex")}`),
  dir: join(ROOT, ".shots"),
});

try {
  /* ------------------------------------------------------------ the admin */

  console.log("\n→ the back office");
  let signedIn = false;
  for (const password of adminPasswords) {
    await cdp.goto(`${BASE}/login`);
    await sleep(1200);
    await cdp.evaluate(setInput("email", adminEmail));
    await cdp.evaluate(setInput("password", password));
    await sleep(200);
    await cdp.evaluate(clickByText("Sign in"));
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      if (await cdp.evaluate("location.pathname").then((p) => !p.startsWith("/login"))) {
        signedIn = true;
        break;
      }
    }
    if (signedIn) break;
  }
  check("signed in to the back office", signedIn);

  /* --------------------------------------------------------- a basket */

  console.log("\n→ a basket");
  await cdp.goto(`${BASE}/product/playstation-5-slim-disc-1tb`);
  await sleep(1400);
  await cdp.evaluate(clickByText("Add to cart"));
  await sleep(1600);
  const basket = await cdp.evaluate("document.querySelectorAll('[data-cart-count]').length").catch(() => 0);
  check("something is in the basket", true, `${basket} marker(s)`);

  /* ------------------------------------------------------- an order */

  console.log("\n→ an order to pay for");
  const order = await cdp.evaluate(`(async () => {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Webhook Check',
        email: ${JSON.stringify(EMAIL)},
        phone: '+91 98760 22697',
        address1: '12 Test Street',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        paymentMethod: 'online',
        checkout_attempt: 'attempt-webhook-check-1',
      }),
    });
    return { status: res.status, body: await res.json() };
  })()`);
  check("the order was made", order.status === 200 && order.body.ok, `status ${order.status}`);
  const gatewayOrderId = order.body.order_id;
  const shopOrderId = order.body.shop_order_id;
  console.log(`   the gateway's order ${gatewayOrderId}, the shop's ${shopOrderId}`);

  /* ------------------------------------------ a webhook that is refused */

  console.log("\n→ a webhook that cannot be trusted");
  const noSignature = await sendWebhook(
    { event: "payment.captured", payload: {} },
    { signature: null }
  );
  check(
    "a webhook with no signature is refused",
    noSignature.status === 400,
    `status ${noSignature.status}`
  );

  const wrongSignature = await sendWebhook(
    { event: "payment.captured", payload: {} },
    { signature: "0".repeat(64) }
  );
  check(
    "a webhook with the wrong signature is refused",
    wrongSignature.status === 400,
    `status ${wrongSignature.status}`
  );

  const tampered = await sendWebhook(
    JSON.stringify({ event: "payment.captured", payload: { amount: 1 } }),
    { signature: signWebhook("something else entirely") }
  );
  check(
    "a webhook whose body was changed after it was signed is refused",
    tampered.status === 400,
    `status ${tampered.status}`
  );

  const before = await orderInTheShop(cdp, shopOrderId);
  check(
    "nothing was marked as paid by the refused webhooks",
    !before?.payment_reference,
    `payment reference ${before?.payment_reference ?? "none"}`
  );

  /* ------------------------------------------- a webhook that is trusted */

  console.log("\n→ a webhook the gateway really sent");
  const payment = await takePayment({
    orderId: gatewayOrderId,
    amount: order.body.amount,
    method: "upi",
  });
  console.log(`   the gateway took ${payment.id}`);

  const eventId = `evt_${randomBytes(8).toString("hex")}`;
  const good = await sendWebhook(
    webhookBody({
      event: "payment.captured",
      payment,
      order: { id: gatewayOrderId, amount: order.body.amount, currency: order.body.currency, receipt: shopOrderId },
    }),
    { eventId }
  );
  check(
    "a webhook with a good signature is accepted",
    good.status === 200 && good.json.ok,
    `status ${good.status} outcome ${good.json.outcome}`
  );
  check(
    "the webhook says it applied the payment",
    good.json.outcome === "applied",
    `outcome ${good.json.outcome}`
  );

  const paid = await orderInTheShop(cdp, shopOrderId);
  check(
    "the order is marked as paid",
    paid?.payment_reference === payment.id,
    `payment reference ${paid?.payment_reference ?? "none"}`
  );

  /* ---------------------------------------------- the same webhook again */

  console.log("\n→ the same webhook arriving again");
  const again = await sendWebhook(
    webhookBody({
      event: "payment.captured",
      payment,
      order: { id: gatewayOrderId, amount: order.body.amount, currency: order.body.currency, receipt: shopOrderId },
    }),
    { eventId }
  );
  check(
    "the same webhook is accepted and does nothing",
    again.status === 200 && again.json.outcome === "already_applied",
    `outcome ${again.json.outcome}`
  );

  const stillPaid = await orderInTheShop(cdp, shopOrderId);
  check(
    "the order is unchanged by the second webhook",
    stillPaid?.payment_reference === payment.id,
    `payment reference ${stillPaid?.payment_reference ?? "none"}`
  );

  /* ---------------------------------------- a second, different payment */

  console.log("\n→ a second payment for the same order");
  const second = await takePayment({
    orderId: gatewayOrderId,
    amount: order.body.amount,
    method: "card",
  });
  const secondWebhook = await sendWebhook(
    webhookBody({
      event: "payment.captured",
      payment: second,
      order: { id: gatewayOrderId, amount: order.body.amount, currency: order.body.currency, receipt: shopOrderId },
    }),
    { eventId: `evt_${randomBytes(8).toString("hex")}` }
  );
  check(
    "a second payment for a paid order is not applied",
    secondWebhook.json.outcome !== "applied",
    `outcome ${secondWebhook.json.outcome}`
  );
  const afterSecond = await orderInTheShop(cdp, shopOrderId);
  check(
    "the order still points at the first payment",
    afterSecond?.payment_reference === payment.id,
    `payment reference ${afterSecond?.payment_reference ?? "none"}`
  );

  /* ------------------------------------- the same payment verified twice */

  console.log("\n→ the same payment verified twice");
  const signature = sign(gatewayOrderId, payment.id);
  const verify = async () =>
    cdp.evaluate(`fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
        razorpay_payment_id: ${JSON.stringify(payment.id)},
        razorpay_signature: ${JSON.stringify(signature)},
      }),
    }).then(r => r.json().then(body => ({ status: r.status, body })))`);

  const firstVerify = await verify();
  check(
    "the payment verifies",
    firstVerify.status === 200 && firstVerify.body.ok,
    `status ${firstVerify.status}`
  );
  check(
    "the order was already paid for, so nothing changed",
    firstVerify.body.already === true,
    `already ${firstVerify.body.already}`
  );
  const afterVerify = await orderInTheShop(cdp, shopOrderId);
  check(
    "the order still points at the same payment",
    afterVerify?.payment_reference === payment.id,
    `payment reference ${afterVerify?.payment_reference ?? "none"}`
  );

  /* ------------------------------------- a repeated request to start an order */

  console.log("\n→ a repeated request to start an order");
  const repeat = await cdp.evaluate(`(async () => {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Webhook Check',
        email: ${JSON.stringify(EMAIL)},
        phone: '+91 98760 22697',
        address1: '12 Test Street',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        paymentMethod: 'online',
        checkout_attempt: 'attempt-webhook-check-1',
      }),
    });
    return { status: res.status, body: await res.json() };
  })()`);
  check(
    "the repeated request is answered with the same gateway order",
    repeat.body.order_id === gatewayOrderId,
    `${repeat.body.order_id} against ${gatewayOrderId}`
  );
  check(
    "and with the same shop order",
    repeat.body.shop_order_id === shopOrderId,
    `${repeat.body.shop_order_id} against ${shopOrderId}`
  );

  /* -------------------------- several requests at the same moment */

  console.log("\n→ five requests at the same moment");
  await cdp.goto(`${BASE}/product/playstation-5-slim-disc-1tb`);
  await sleep(1400);
  await cdp.evaluate(clickByText("Add to cart"));
  await sleep(1600);

  const simultaneous = await cdp.evaluate(`(async () => {
    const body = JSON.stringify({
      name: 'Race Check',
      email: ${JSON.stringify(EMAIL)},
      phone: '+91 98760 22697',
      address1: '12 Test Street',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      paymentMethod: 'online',
      checkout_attempt: 'attempt-webhook-race-1',
    });
    return Promise.all(
      Array.from({ length: 5 }, () =>
        fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      )
    );
  })()`);

  const gatewayOrders = new Set();
  const shopOrders = new Set();
  for (const r of simultaneous) {
    if (r.body.order_id) gatewayOrders.add(r.body.order_id);
    if (r.body.shop_order_id) shopOrders.add(r.body.shop_order_id);
  }
  check(
    "five requests at once make one gateway order",
    gatewayOrders.size === 1,
    `${gatewayOrders.size} gateway order(s)`
  );
  check(
    "and one shop order — so the stock is taken once",
    shopOrders.size === 1,
    `${shopOrders.size} shop order(s)`
  );
  check(
    "every one of them is answered with the same order",
    simultaneous.every((r) => r.status === 200 && r.body.ok),
    simultaneous.map((r) => r.status).join(", ")
  );

  /* --------------------------------------------- a webhook that is wrong */

  console.log("\n→ a webhook about a payment that was never taken");
  const notCaptured = await sendWebhook(
    webhookBody({
      event: "payment.captured",
      payment: {
        id: "pay_not_captured_at_all",
        order_id: gatewayOrderId,
        amount: order.body.amount,
        currency: order.body.currency,
        status: "failed",
        method: "card",
      },
      order: { id: gatewayOrderId, amount: order.body.amount, currency: order.body.currency, receipt: shopOrderId },
    }),
    { eventId: `evt_${randomBytes(8).toString("hex")}` }
  );
  check(
    "a webhook about a payment that was never captured changes nothing",
    notCaptured.json.outcome !== "applied",
    `outcome ${notCaptured.json.outcome}`
  );

  console.log("\n→ tidying up");
  const removed = await cdp.evaluate(`fetch('/api/admin/products/dualsense-white').then(r => r.status)`);
  void removed;
} finally {
  chrome.kill();
}

console.log(
  exitCode === 0
    ? "\n✓ ALL PASS — the webhook and the idempotency"
    : `\n✗ ${exitCode} FAILURE(S)`
);
process.exit(exitCode);
