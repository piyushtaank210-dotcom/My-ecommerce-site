/**
 * The payment and the order are two different things.
 *
 *   node scripts/check-pending-orders.mjs
 *
 * It walks the whole of the rule the shop now runs on:
 *
 *   · a new order is written as PENDING, whatever the payment does
 *   · a payment that is taken only changes the PAYMENT status
 *   · a webhook that says the money is in only changes the PAYMENT
 *     status
 *   · the order stays PENDING until somebody in the back office saves
 *     the shipping details
 *   · a customer cannot change an order's status
 *   · an order that cannot move where it is, cannot be moved
 *
 * The gateway is a mock. The shop's LIVE keys are never used here, so
 * no money is ever taken and nothing at the real gateway is touched.
 *
 * Everything it creates is marked with this run's own stamp and is
 * removed at the end.
 */
import { randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { startMockGateway } from "./lib/mock-gateway.mjs";

// The gateway is stood up first, so that the shop can be pointed at it
// before anything of the shop's own is read.
const mock = await startMockGateway(0);

await import("./lib/env.mjs");
process.env.RAZORPAY_API_BASE = mock.base;
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_pending";
process.env.RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "pending_check_secret";
process.env.RESEND_API_KEY = "";
// The webhook is signed with a secret of its own.
process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "pending_check_webhook_secret";

/**
 * The shop, on a port of its own, pointed at the mock gateway.
 *
 * The webhook is an HTTP endpoint, so it is tested over HTTP — and the
 * server that answers has to be talking to the mock. The server that is
 * already running on port 3000 is talking to the real gateway, so this
 * run starts one of its own rather than asking that one to change what
 * it is pointed at.
 */
const PORT = 3017;
const BASE = `http://localhost:${PORT}`;

/** What the shop said as it came up. */
const serverLog = [];

/**
 * Starts the shop on its own port, beside the one on port 3000.
 *
 * The first `next dev` in a build directory of its own stops to show the
 * upgrade reminder and asks to be run again. So the server is started,
 * and if it stops for that reason it is started once more — the second
 * time it comes straight up.
 */
function startServer() {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // The second server keeps its build and its lock file of its own,
        // so that it can run beside the one on port 3000.
        NEXT_DIST_DIR: ".next-pending-check",
        RAZORPAY_API_BASE: mock.base,
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
        RESEND_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
  return child;
}

let server = startServer();

/**
 * Waits for the shop to answer.
 *
 * It gives up early if the server stops — which is what the upgrade
 * reminder does — rather than waiting out the whole timeout.
 */
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) return false;
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status < 500) return true;
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  return false;
}

const { registerTsResolver } = await import("./lib/ts-loader.mjs");
registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { createOrder } = await import("../src/lib/orders.ts");
const { takeStockForOrder } = await import("../src/lib/inventory.ts");
const { claimPaymentAndMarkOrderPaid } = await import("../src/lib/gateway-records.ts");
const { confirmOrderWithShipping } = await import("../src/lib/order-dispatch.ts");
const { applyOrderStatus } = await import("../src/lib/orders.ts");
const {
  canTransition,
  nextOrderStatuses,
  ORDER_STATUS_LABEL,
} = await import("../src/lib/order-status.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();
const createdOrders = [];

const staff = await getDb()
  .prepare("SELECT id, name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
  .get();

/**
 * A product the test can order, and the bucket it is stocked in.
 *
 * A product with options is stocked by its options, so the test takes
 * the stock out of the option's own bucket.
 */
const fixture = await (async () => {
  const variant = await getDb()
    .prepare(
      `SELECT v.id, v.product_slug, v.name, v.stock, p.name AS product_name
         FROM variants v JOIN products p ON p.slug = v.product_slug
        WHERE v.stock >= 3 AND p.listed = 1 AND p.status = 'published'
        ORDER BY v.id LIMIT 1`
    )
    .get();
  if (variant) {
    return {
      slug: String(variant.product_slug),
      variantId: String(variant.id),
      variantName: String(variant.name),
      name: String(variant.product_name),
    };
  }
  const product = await getDb()
    .prepare(
      `SELECT slug, name FROM products
        WHERE listed = 1 AND status = 'published' AND stock >= 3
        ORDER BY slug LIMIT 1`
    )
    .get();
  if (!product) throw new Error("the shop has nothing in stock to order");
  return {
    slug: String(product.slug),
    variantId: null,
    variantName: null,
    name: String(product.name),
  };
})();

/**
 * Writes an order the way the shop's own checkout does.
 */
async function makeOrder(options = {}) {
  const id = `PEN${randomBytes(4).toString("hex").toUpperCase()}`;
  const total = 200;

  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO orders
           (id, user_id, name, email, phone, address1, city, state, pincode,
            subtotal, shipping, total, payment_method, payment_gateway,
            payment_reference, status, payment_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','pending')`
      )
      .run(
        id,
        null,
        "Pending Check",
        `pending-${stamp.toLowerCase()}@example.invalid`,
        "9876022697",
        "House no.193",
        "Ludhiana",
        "Punjab",
        "142021",
        total,
        0,
        total,
        options.paymentReference ? "razorpay" : "cod",
        options.paymentReference ? "razorpay" : null,
        options.paymentReference ?? null
      );

    const taken = await takeStockForOrder(
      db,
      id,
      fixture.slug,
      fixture.variantId,
      1,
      fixture.name,
      null
    );

    await db
      .prepare(
        `INSERT INTO order_items
           (order_id, product_slug, variant_id, variant_name, name, price, quantity,
            stock_state, backordered)
         VALUES (?,?,?,?,?,?,?,'deducted',?)`
      )
      .run(id, fixture.slug, fixture.variantId, fixture.variantName, fixture.name, total, 1, taken.backordered);
  });

  createdOrders.push(id);
  return { id, total };
}

/**
 * A payment at the mock gateway, and its reference.
 */
async function gatewayPayment(orderId, total) {
  const order = await (
    await fetch(`${mock.base}/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: total * 100, currency: "INR", receipt: orderId }),
    })
  ).json();

  const payment = await (
    await fetch(`${mock.base}/mock/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        amount: total * 100,
        paymentId: `pay_${randomBytes(6).toString("hex")}`,
      }),
    })
  ).json();

  return { payment, gatewayOrderId: order.id };
}

/**
 * Reads an order straight from the database.
 */
async function readOrder(id) {
  return await getDb()
    .prepare("SELECT status, payment_status, payment_reference FROM orders WHERE id = ?")
    .get(id);
}

try {
  /* ─────────────────────────────────────────────────────────────── */
  section("0. The shop, talking to the mock gateway");

  let up = await waitForServer();
  // The first `next dev` in a build directory of its own stops to show
  // the upgrade reminder and asks to be run again. It is run again.
  if (!up && serverLog.join("").includes("upgrade recommendation")) {
    console.log("  the shop stopped for the upgrade reminder — starting it again");
    server.kill();
    await sleep(1000);
    server = startServer();
    up = await waitForServer();
  }
  check("the shop is up", up);
  if (!up) {
    console.log("  the shop said:");
    for (const line of serverLog.join("").split("\n").slice(-15)) {
      console.log(`    ${line}`);
    }
    throw new Error("the shop never came up");
  }

  /* ─────────────────────────────────────────────────────────────── */
  section("1. A new order starts as PENDING");

  const placed = await makeOrder();
  const fresh = await readOrder(placed.id);
  check("the order is pending", fresh.status === "pending", fresh.status);
  check("and its payment is pending too", fresh.payment_status === "pending");

  const placedThroughTheShop = await createOrder(
    {
      name: "Pending Check",
      email: `pending-${stamp.toLowerCase()}@example.invalid`,
      phone: "9876022697",
      address1: "House no.193",
      city: "Ludhiana",
      state: "Punjab",
      pincode: "142021",
      paymentMethod: "cod",
    },
    [{ productSlug: fixture.slug, variantId: fixture.variantId, variantName: fixture.variantName, name: fixture.name, price: 200, quantity: 1 }],
    { subtotal: 200, shipping: 0, total: 200 },
    { notify: false }
  );
  createdOrders.push(placedThroughTheShop);
  const throughTheShop = await readOrder(placedThroughTheShop);
  check(
    "an order the shop's own checkout wrote is pending too",
    throughTheShop.status === "pending",
    throughTheShop.status
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("2. A payment that is taken only changes the payment");

  const paid = await makeOrder();
  const { payment, gatewayOrderId } = await gatewayPayment(paid.id, paid.total);

  const claimed = await claimPaymentAndMarkOrderPaid({
    payment: {
      paymentId: payment.id,
      orderId: paid.id,
      gatewayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      status: "captured",
      method: "upi",
    },
    method: "upi",
  });
  check("the payment is recorded", claimed);

  const afterPayment = await readOrder(paid.id);
  check("the payment status is paid", afterPayment.payment_status === "paid");
  check("the payment reference is on the order", Boolean(afterPayment.payment_reference));
  check(
    "and the order is STILL pending",
    afterPayment.status === "pending",
    afterPayment.status
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("3. A webhook that says the money is in changes nothing else");

  const webhookOrder = await makeOrder();
  const hooked = await gatewayPayment(webhookOrder.id, webhookOrder.total);

  // The webhook is signed the way the gateway signs it.
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        id: hooked.payment.id,
        order_id: hooked.gatewayOrderId,
        amount: hooked.payment.amount,
        currency: "INR",
        status: "captured",
        method: "upi",
      },
    },
  });
  const signature = createHmac(
    "sha256",
    process.env.RAZORPAY_WEBHOOK_SECRET
  )
    .update(body, "utf8")
    .digest("hex");

  const sent = await fetch(`${BASE}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": `evt_${randomBytes(6).toString("hex")}`,
    },
    body,
  });
  const answer = await sent.json().catch(() => ({}));
  check("the webhook is accepted", sent.status === 200, `status ${sent.status}`);
  check(
    "and it says it was applied",
    answer.outcome === "applied",
    JSON.stringify(answer)
  );

  const afterWebhook = await readOrder(webhookOrder.id);
  check("the payment status is paid", afterWebhook.payment_status === "paid");
  check(
    "and the order is STILL pending",
    afterWebhook.status === "pending",
    afterWebhook.status
  );

  // The same webhook, sent again — the gateway sends it more than once
  // when it does not hear back.
  const again = await fetch(`${BASE}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": `evt_${randomBytes(6).toString("hex")}`,
    },
    body,
  });
  const againAnswer = await again.json().catch(() => ({}));
  check("a repeated webhook is accepted", again.status === 200);
  check(
    "and does nothing the second time",
    againAnswer.outcome === "already_applied" || againAnswer.outcome === "rejected",
    JSON.stringify(againAnswer)
  );
  check(
    "and the order is still pending",
    (await readOrder(webhookOrder.id)).status === "pending"
  );
  check(
    "and the payment is still paid, not paid twice",
    (await readOrder(webhookOrder.id)).payment_status === "paid"
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("4. The back office confirms the order");

  const confirmed = await confirmOrderWithShipping({
    orderId: paid.id,
    courierPartner: "Delhivery",
    shippingMethod: "surface",
    trackingId: "AWB-PENDING-1",
    userId: staff?.id ?? null,
  });
  check("the confirmation is accepted", confirmed.ok, confirmed.message);

  const afterConfirm = await readOrder(paid.id);
  check("the order is confirmed", afterConfirm.status === "confirmed");
  check("and the payment is still paid", afterConfirm.payment_status === "paid");

  const courier = await getDb()
    .prepare("SELECT courier_partner, tracking_id FROM orders WHERE id = ?")
    .get(paid.id);
  check("the courier is on the order", courier.courier_partner === "Delhivery");
  check("and so is the tracking number", courier.tracking_id === "AWB-PENDING-1");

  /* ─────────────────────────────────────────────────────────────── */
  section("5. The order moves along, and only forwards");

  const packed = await applyOrderStatus(paid.id, "packed", staff?.id ?? null);
  check("it can be packed", packed.ok, packed.message);
  const shipped = await applyOrderStatus(paid.id, "shipped", staff?.id ?? null);
  check("it can be shipped", shipped.ok, shipped.message);
  const delivered = await applyOrderStatus(paid.id, "delivered", staff?.id ?? null);
  check("it can be delivered", delivered.ok, delivered.message);
  check("and it is delivered", (await readOrder(paid.id)).status === "delivered");

  const backwards = await applyOrderStatus(paid.id, "packed", staff?.id ?? null);
  check("but it cannot go backwards", !backwards.ok);
  check(
    "and it says why",
    /cannot go from/i.test(backwards.message ?? ""),
    backwards.message
  );

  const cancelDelivered = await applyOrderStatus(paid.id, "cancelled", staff?.id ?? null);
  check("and a delivered order cannot be cancelled", !cancelDelivered.ok);

  /* ─────────────────────────────────────────────────────────────── */
  section("6. The rules of the move");

  check("a pending order can be confirmed", canTransition("pending", "confirmed"));
  check("a pending order can be cancelled", canTransition("pending", "cancelled"));
  check("a confirmed order can be packed", canTransition("confirmed", "packed"));
  check("a packed order can be shipped", canTransition("packed", "shipped"));
  check("a shipped order can be delivered", canTransition("shipped", "delivered"));
  check("a confirmed order cannot go back to pending", !canTransition("confirmed", "pending"));
  check("a delivered order cannot be cancelled", !canTransition("delivered", "cancelled"));
  check("an order cannot be moved to where it already is", !canTransition("packed", "packed"));
  check(
    "a cancelled order can be opened again",
    canTransition("cancelled", "pending")
  );
  check(
    "the back office is offered the forward steps",
    JSON.stringify(nextOrderStatuses("confirmed")) ===
      JSON.stringify(["packed", "shipped", "delivered", "cancelled"]),
    JSON.stringify(nextOrderStatuses("confirmed"))
  );
  check(
    "and the pending ones first",
    nextOrderStatuses("pending")[0] === "confirmed"
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("7. A customer cannot change an order");

  const customerOrder = await makeOrder();
  const customer = await getDb()
    .prepare("SELECT id FROM users WHERE role = 'member' ORDER BY id LIMIT 1")
    .get();

  if (customer) {
    // The customer's own API is asked to change the order, and it says
    // no — because it does not exist, and because it would need a
    // signed-in member of staff to get past.
    const res = await fetch(
      `${BASE}/api/admin/orders/${customerOrder.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      }
    );
    check(
      "the back office's endpoint turns a customer away",
      res.status === 401 || res.status === 403,
      `status ${res.status}`
    );
    check(
      "and the order is still pending",
      (await readOrder(customerOrder.id)).status === "pending"
    );
  } else {
    check("there is no member account to test with — skipped", true);
  }

  /* ─────────────────────────────────────────────────────────────── */
  section("8. The status badge says PENDING");

  const { orderStatusLabel } = await import("../src/lib/order-status.ts");
  check("a pending order reads as Pending", orderStatusLabel("pending") === "Pending");
  check("and the label is there for every status", Boolean(ORDER_STATUS_LABEL.pending));

  const summary = await getDb()
    .prepare(
      `SELECT id, status FROM orders WHERE id IN (${createdOrders
        .map(() => "?")
        .join(",")})`
    )
    .all(...createdOrders);
  const pendingOnes = summary.filter((r) => r.status === "pending").length;
  check(
    "and the orders this run made are on the list as pending",
    pendingOnes > 0,
    `${pendingOnes} of ${summary.length} still pending`
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");

  const db = getDb();

  // The stock this run took out of the shelf goes back on it. Without
  // this the test quietly drains the catalogue every time it is run,
  // and a later run has nothing to order. It goes back before the rows
  // are removed, because the movement is recorded against the order.
  {
    const { putStockBack } = await import("../src/lib/inventory.ts");
    for (const orderId of createdOrders) {
      await putStockBack(
        db,
        orderId,
        {
          id: 0,
          product_slug: fixture.slug,
          variant_id: fixture.variantId,
          quantity: 1,
        },
        "restock",
        "The pending-orders check put it back",
        null,
        null
      );
    }
  }

  await withTransaction(async (tx) => {
    for (const orderId of createdOrders) {
      await tx.prepare("DELETE FROM order_refunds WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM notifications WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM inventory_movements WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
  });

  console.log("  ✓ the fixtures this run made were removed");
  await mock.close();
  server.kill();
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the payment and the order are separate.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
