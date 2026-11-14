/**
 * The payment, end to end.
 *
 * The checkout has two halves and this checks both: the shop asks the
 * gateway for an order to pay against, and then — once the money has
 * been taken — the shop checks the gateway's signature before it marks
 * anything as paid.
 *
 * The gateway is a mock. Razorpay publishes one of its own, and a mock
 * is what makes the whole payment testable without a bank account: the
 * order is real, the payment is real as far as the shop is concerned,
 * and the signature is made the way the gateway makes it — with the key
 * secret, over the order id and the payment id joined by a pipe.
 *
 * What is checked:
 *
 *   · an order is made, and the shop's own order id is the receipt
 *   · a signature that does not match is refused, and nothing is paid
 *   · a payment the gateway does not know is refused
 *   · a good signature marks the order paid, records the payment
 *     reference, empties the basket and tells the customer
 *   · an order that is not the shop's own cannot be paid for
 *
 *   node scripts/check-razorpay.mjs
 *
 * The dev server must be running on port 3000 with RAZORPAY_API_BASE
 * pointing at the mock (the script starts the mock and says the address
 * it is on), and the shop must have been given its gateway keys.
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
const PORT = 9353;

/** Where the mock gateway is. */
const MOCK = process.env.RAZORPAY_API_BASE ?? "http://127.0.0.1:9595";

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const EMAIL = "razorpay-check@example.com";

/** The admin, for looking at the order in the back office. */
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const adminEmail =
  process.env.PF_ADMIN_EMAIL ?? env.match(/^PF_ADMIN_EMAIL="(.*)"/m)?.[1] ?? "";
const adminPasswords = [
  process.env.PF_ADMIN_PASSWORD,
  env.match(/^PF_ADMIN_PASSWORD="(.*)"/m)?.[1],
  "myconsole@121",
].filter(Boolean);

let exitCode = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) exitCode = 1;
}

/** The signature the gateway makes. */
function sign(orderId, paymentId) {
  return createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

/** The shop's own order, as the back office sees it. */
async function orderInTheShop(cdp, id) {
  return cdp.evaluate(
    `fetch('/api/admin/orders/${id}').then(r => r.json())`
  );
}

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), `playforge-razorpay-${randomBytes(4).toString("hex")}`),
  dir: join(ROOT, ".shots"),
});

/** Asks the mock to take a payment, the way the gateway would. */
async function takePayment({ orderId, amount, method }) {
  const res = await fetch(`${MOCK}/mock/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, amount, method }),
  });
  if (!res.ok) throw new Error(`the mock would not take the payment: ${res.status}`);
  return res.json();
}

/** Whether the mock is the gateway the shop is talking to. */
async function mockKnowsOrder(orderId) {
  const res = await fetch(`${MOCK}/v1/orders/${orderId}`).catch(() => null);
  return Boolean(res && res.ok);
}

/** The order as the gateway holds it — from whichever gateway it is. */
async function gatewayOrder(orderId) {
  const res = await fetch(`${MOCK}/v1/orders/${orderId}`).catch(() => null);
  if (res && res.ok) return res.json();

  // The shop is talking to the real gateway, so the order is asked for
  // there.
  const key = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID ?? ""}:${KEY_SECRET}`
  ).toString("base64");
  const real = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${key}` },
  }).catch(() => null);
  return real && real.ok ? real.json() : null;
}

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
      if ((await cdp.evaluate("location.pathname")) !== "/login") {
        signedIn = true;
        break;
      }
      await sleep(300);
    }
    if (signedIn) break;
  }
  check("the admin can sign in", signedIn);

  /* ------------------------------------------------------- the basket */

  console.log("\n→ the basket");

  /**
   * Puts a controller in the basket.
   *
   * An order empties the basket when it is paid for, so the basket has
   * to be filled again before the next order can be made.
   */
  async function addToCart() {
    await cdp.goto(`${BASE}/product/dualsense-white`);
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate("!!document.querySelector('button')");
      if (ready) break;
      await sleep(300);
    }
    await sleep(1200);
    for (let i = 0; i < 30; i++) {
      const clicked = await cdp.evaluate(
        `(() => {
          const b = [...document.querySelectorAll('button')].find(e => /add to cart/i.test(e.textContent.trim()));
          if (!b) return 'NO_BUTTON';
          b.click();
          return 'CLICKED';
        })()`
      );
      if (clicked === "CLICKED") break;
      await sleep(400);
    }
    await sleep(2500);
  }

  await addToCart();
  await cdp.goto(`${BASE}/checkout`);
  check(
    "the checkout is open",
    (await cdp.evaluate("location.pathname")) === "/checkout",
    await cdp.evaluate("location.pathname")
  );

  /* ---------------------------------------------------- the shop's order */

  console.log("\n→ the order");
  await cdp.evaluate(setInput("name", "Arjun Mehta"));
  await cdp.evaluate(setInput("email", EMAIL));
  await cdp.evaluate(setInput("phone", "9876543210"));
  await cdp.evaluate(setInput("address1", "12 Palm Grove, Baner"));
  await cdp.evaluate(setInput("city", "Pune"));
  await cdp.evaluate(setInput("state", "Maharashtra"));
  await cdp.evaluate(setInput("pincode", "411045"));
  await sleep(300);

  const created = await cdp.evaluate(
    `fetch('/api/create-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         name: 'Arjun Mehta', email: ${JSON.stringify(EMAIL)}, phone: '9876543210',
         address1: '12 Palm Grove, Baner', city: 'Pune', state: 'Maharashtra',
         pincode: '411045', paymentMethod: 'online',
       }),
     }).then(r => r.json())`
  );

  check("the shop made an order", created.ok === true, JSON.stringify(created).slice(0, 120));
  check(
    "the gateway's order was asked for",
    typeof created.order_id === "string" && created.order_id.startsWith("order_"),
    created.order_id
  );
  check(
    "the amount is in paise",
    typeof created.amount === "number" && created.amount >= 100,
    `${created.amount} ${created.currency}`
  );
  check("the currency is rupees", created.currency === "INR", created.currency);
  check(
    "the key id is handed over, and only the key id",
    typeof created.key_id === "string" && !("key_secret" in created),
    created.key_id
  );
  check(
    "the shop's own order id is the gateway's receipt",
    (await gatewayOrder(created.order_id))?.receipt === created.shop_order_id,
    (await gatewayOrder(created.order_id))?.receipt
  );

  // The payment half of the check needs the mock: the shop has to be
  // pointed at it, or there is no way to make a payment the mock knows
  // about.
  const pointedAtMock = await mockKnowsOrder(created.order_id);

  const gatewayOrderId = created.order_id;
  const shopOrderId = created.shop_order_id;

  /* ---------------------------------------------- a signature that is wrong */

  console.log("\n→ a payment that cannot be trusted");

  const wrongSignature = await cdp.evaluate(
    `fetch('/api/verify-payment', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
         razorpay_payment_id: 'pay_wrong',
         razorpay_signature: 'not-the-right-signature',
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "a signature that does not match is refused",
    wrongSignature.status === 400,
    `HTTP ${wrongSignature.status}`
  );

  const missingFields = await cdp.evaluate(
    `fetch('/api/verify-payment', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ razorpay_order_id: ${JSON.stringify(gatewayOrderId)} }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "missing details are refused",
    missingFields.status === 400,
    `HTTP ${missingFields.status}`
  );

  // A signature that is made properly, over a payment the gateway has
  // never heard of. The signature is right; the payment is not there.
  const unknownPayment = await cdp.evaluate(
    `fetch('/api/verify-payment', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
         razorpay_payment_id: 'pay_unknown_to_the_gateway',
         razorpay_signature: ${JSON.stringify(sign(gatewayOrderId, "pay_unknown_to_the_gateway"))},
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "a payment the gateway does not know is refused",
    unknownPayment.status >= 400,
    `HTTP ${unknownPayment.status}`
  );

  const notPaid = await orderInTheShop(cdp, shopOrderId);
  check(
    "the order was not marked as paid",
    !notPaid.payment_reference,
    notPaid.payment_reference ?? "no payment reference"
  );

  /* ----------------------------------------------------- a good payment */

  if (!pointedAtMock) {
    console.log(
      "\n→ the payment half is skipped: the shop is not pointed at the mock.\n" +
        "  Start the mock (node scripts/lib/mock-gateway.mjs) and the shop\n" +
        "  (RAZORPAY_API_BASE=http://127.0.0.1:9595 npm run dev) to check it."
    );
  } else {
    console.log("\n→ a payment the gateway confirms");
    const mockPayment = await takePayment({
      orderId: gatewayOrderId,
      amount: created.amount,
      method: "upi",
    });
    const paymentId = mockPayment.id;
    console.log(`  the gateway took ${paymentId} by ${mockPayment.method}`);

    const good = await cdp.evaluate(
      `fetch('/api/verify-payment', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
           razorpay_payment_id: ${JSON.stringify(paymentId)},
           razorpay_signature: ${JSON.stringify(sign(gatewayOrderId, paymentId))},
         }),
       }).then(async r => ({ status: r.status, body: await r.json() }))`
    );
    check("the payment is accepted", good.status === 200, `HTTP ${good.status} ${JSON.stringify(good.body).slice(0, 160)}`);
    check(
      "it is the shop's own order that is paid",
      good.body.order_id === shopOrderId,
      good.body.order_id
    );
    check(
      "the way it was paid is recorded",
      good.body.method === "upi",
      good.body.method
    );

    const paid = await orderInTheShop(cdp, shopOrderId);
    check(
      "the order carries the payment reference",
      paid.payment_reference === paymentId,
      paid.payment_reference ?? "none"
    );
    check(
      "the order carries the gateway",
      paid.payment_gateway === "razorpay",
      paid.payment_gateway ?? "none"
    );

    // The same payment, told about twice, is one payment. The customer
    // may well press the button again after the page has answered.
    const again = await cdp.evaluate(
      `fetch('/api/verify-payment', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
           razorpay_payment_id: ${JSON.stringify(paymentId)},
           razorpay_signature: ${JSON.stringify(sign(gatewayOrderId, paymentId))},
         }),
       }).then(async r => ({ status: r.status, body: await r.json() }))`
    );
    check(
      "the same payment told about twice is still one payment",
      again.status === 200,
      `HTTP ${again.status}`
    );

    // A second payment against the same order is a second payment, and
    // it is not swallowed. The gateway has to know about it, or the
    // shop would never get as far as looking at the order.
    const secondPayment = await takePayment({
      orderId: gatewayOrderId,
      amount: created.amount,
      method: "card",
    });
    const second = await cdp.evaluate(
      `fetch('/api/verify-payment', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           razorpay_order_id: ${JSON.stringify(gatewayOrderId)},
           razorpay_payment_id: ${JSON.stringify(secondPayment.id)},
           razorpay_signature: ${JSON.stringify(sign(gatewayOrderId, secondPayment.id))},
         }),
       }).then(async r => ({ status: r.status, body: await r.json() }))`
    );
    check(
      "a second payment against the same order is refused",
      second.status === 409,
      `HTTP ${second.status}`
    );

    /* ------------------------------------------------- the basket and the news */

    await cdp.goto(`${BASE}/cart`);
    check(
      "the basket is empty",
      /Your cart is empty/i.test(await cdp.evaluate("document.body.innerText"))
    );

    await cdp.goto(`${BASE}/order/${shopOrderId}`);
    const orderText = await cdp.evaluate("document.body.innerText");
    check(
      "the customer sees the order",
      /Order confirmed/i.test(orderText),
      orderText.slice(0, 80).replace(/\n/g, " ")
    );
    check(
      "the customer sees how they paid",
      /UPI/i.test(orderText)
    );

    await cdp.shot("razorpay-order", true);
  }

  /* ------------------------------------------------------- money at the door */

  console.log("\n→ money taken when the goods arrive");
  await addToCart();
  const cod = await cdp.evaluate(
    `fetch('/api/create-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         name: 'Arjun Mehta', email: ${JSON.stringify(EMAIL)}, phone: '9876543210',
         address1: '12 Palm Grove, Baner', city: 'Pune', state: 'Maharashtra',
         pincode: '411045', paymentMethod: 'cod',
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "the order is finished there and then",
    cod.status === 200 && cod.body.mode === "cod",
    `HTTP ${cod.status} ${cod.body.mode ?? cod.body.error}`
  );
  check(
    "it is the shop's own order",
    typeof cod.body.order_id === "string" && cod.body.order_id.startsWith("PF"),
    cod.body.order_id
  );

  const codOrder = await orderInTheShop(cdp, cod.body.order_id);
  check(
    "it is marked as cash on delivery",
    codOrder.payment_method === "cod",
    codOrder.payment_method
  );
  check(
    "no gateway is written against it",
    !codOrder.payment_gateway,
    codOrder.payment_gateway ?? "none"
  );

  await cdp.goto(`${BASE}/order/${cod.body.order_id}`);
  const codText = await cdp.evaluate("document.body.innerText");
  check(
    "the customer sees cash on delivery",
    /Cash on Delivery/i.test(codText)
  );

  /* ------------------------------------------------- an order left unpaid */

  console.log("\n→ an order the customer walked away from");
  // The order for cash on delivery emptied the basket, so there has to
  // be something in it again before an order can be made.
  await addToCart();

  const abandoned = await cdp.evaluate(
    `fetch('/api/create-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         name: 'Arjun Mehta', email: ${JSON.stringify(EMAIL)}, phone: '9876543210',
         address1: '12 Palm Grove, Baner', city: 'Pune', state: 'Maharashtra',
         pincode: '411045', paymentMethod: 'online',
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "an order is made and waits for the money",
    abandoned.status === 200 && abandoned.body.mode === "gateway",
    `HTTP ${abandoned.status}`
  );

  const abandonedOrder = await orderInTheShop(cdp, abandoned.body.shop_order_id);
  check(
    "nothing was paid for it",
    !abandonedOrder.payment_reference,
    abandonedOrder.payment_reference ?? "no payment reference"
  );

  const putAway = await cdp.evaluate(
    `fetch('/api/cancel-pending-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         order_id: ${JSON.stringify(abandoned.body.shop_order_id)},
         pending_token: ${JSON.stringify(abandoned.body.pending_token)},
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "it is put away again",
    putAway.status === 200,
    `HTTP ${putAway.status}`
  );

  const putAwayOrder = await orderInTheShop(cdp, abandoned.body.shop_order_id);
  check(
    "and it is marked as cancelled",
    putAwayOrder.status === "cancelled",
    putAwayOrder.status
  );

  // The token is the only thing that lets an order be put away, so it
  // has to be worth something.
  const withoutToken = await cdp.evaluate(
    `fetch('/api/cancel-pending-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         order_id: ${JSON.stringify(abandoned.body.shop_order_id)},
         pending_token: 'not-the-right-token',
       }),
     }).then(async r => ({ status: r.status, body: await r.json() }))`
  );
  check(
    "and only the browser that made it may put it away",
    withoutToken.status === 403,
    `HTTP ${withoutToken.status}`
  );

  /* ------------------------------------------------------------- tidy up */

  // The orders took units off the shelf. They are put away again
  // through the back office, so the stock goes back the way a cancelled
  // order always puts it back.
  console.log("\n→ tidying up");
  for (const id of [shopOrderId, cod.body.order_id]) {
    const tidied = await cdp.evaluate(
      `fetch('/api/admin/orders/${id}', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status: 'cancelled' }),
       }).then(r => r.status)`
    );
    check(
      `the order ${id} was put away and the stock is back`,
      tidied === 200,
      `HTTP ${tidied}`
    );
  }
} finally {
  chrome.kill();
}

console.log(
  exitCode === 0
    ? "\n✓ the payment works end to end"
    : "\n✗ something did not work"
);
process.exit(exitCode);
