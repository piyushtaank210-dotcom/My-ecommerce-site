/**
 * A mock of the gateway's API.
 *
 * Razorpay publishes a mock of its own, and this is a small version of
 * it: enough of the gateway for the shop to be exercised end to end
 * without asking the real gateway for money that is not there.
 *
 * It answers the calls the shop makes:
 *
 *   POST /v1/orders          — makes an order to pay against
 *   GET  /v1/orders/:id      — the order, and what was paid for it
 *   GET  /v1/payments/:id    — the payment, and whether it was captured
 *   POST /v1/payments/:id/refund — refunds the payment
 *   GET  /v1/refunds/:id     — the refund, and where it has got to
 *   GET  /v1/refunds?payment_id= — the refunds already against a payment
 *
 * The payment is made by the test that drives it, not by the mock: the
 * mock holds the order, and the test signs the payment the way the
 * gateway signs it. The one extra door — /mock/pay — is the test's own,
 * and the real gateway has no such thing.
 *
 * Run it on its own:
 *
 *   node scripts/lib/mock-gateway.mjs
 *
 * It says where it is on, and it stays until it is stopped.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const DEFAULT_PORT = 9595;

export function startMockGateway(port = DEFAULT_PORT) {
  /** The orders the mock has made. */
  const orders = new Map();
  /** The payments the mock has taken. */
  const payments = new Map();
  /** The refunds the mock has made. */
  const refunds = new Map();
  /**
   * The idempotency keys the mock has been given, and the order each one
   * made.
   *
   * The real gateway keeps this: a request that carries a key it has
   * already seen comes back as the same order rather than a second one.
   * The mock does the same, so that the shop's own use of the key can be
   * exercised rather than taken on trust.
   */
  const idempotency = new Map();
  /**
   * How the mock is behaving.
   *
   * `failRefund` makes the refund refuse, so that the shop's handling of
   * a gateway that says no can be exercised.
   */
  const settings = { failRefund: false };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const json = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(text),
      });
      res.end(text);
    };

    /* ---- an order to pay against ---- */
    if (req.method === "POST" && url.pathname === "/v1/orders") {
      const body = await readBody(req);

      // A request that carries a key the mock has already seen is the
      // same request again, and comes back as the order it made first.
      const key = req.headers["idempotency-key"];
      if (typeof key === "string" && key) {
        const existing = idempotency.get(key);
        if (existing) {
          console.log(
            `[mock] the idempotency key ${key.slice(0, 12)}… was seen before — ` +
              `the order ${existing} again`
          );
          return json(200, orders.get(existing));
        }
      }

      const id = `order_${randomBytes(8).toString("hex")}`;
      const order = {
        id,
        amount: Number(body.amount),
        amount_paid: 0,
        currency: body.currency ?? "INR",
        receipt: body.receipt ?? null,
        status: "created",
        notes: body.notes ?? {},
        created_at: new Date().toISOString(),
      };
      orders.set(id, order);
      if (typeof key === "string" && key) idempotency.set(key, id);
      console.log(
        `[mock] made the order ${id} for ${order.amount} (${order.receipt})` +
          (key ? ` [key ${key.slice(0, 12)}…]` : "")
      );
      return json(200, order);
    }

    /* ---- the order ---- */
    const orderMatch = url.pathname.match(/^\/v1\/orders\/([^/]+)$/);
    if (req.method === "GET" && orderMatch) {
      const order = orders.get(decodeURIComponent(orderMatch[1]));
      if (!order) return json(404, { error: { description: "Order not found" } });
      return json(200, order);
    }

    /* ---- the payment ---- */
    const paymentMatch = url.pathname.match(/^\/v1\/payments\/([^/]+)$/);
    if (req.method === "GET" && paymentMatch) {
      const payment = payments.get(decodeURIComponent(paymentMatch[1]));
      if (!payment) return json(404, { error: { description: "Payment not found" } });
      console.log(`[mock] the payment ${payment.id} is ${payment.status}`);
      return json(200, payment);
    }

    /* ---- the test's own door: take a payment ---- */
    if (req.method === "POST" && url.pathname === "/mock/pay") {
      const body = await readBody(req);
      const orderId = String(body.orderId ?? "");
      const order = orders.get(orderId);
      if (!order) return json(404, { error: { description: "Order not found" } });

      const amount = Number(body.amount ?? order.amount);
      const method = String(body.method ?? "card");
      const status = String(body.status ?? "captured");
      const paymentId = String(body.paymentId ?? `pay_${randomBytes(8).toString("hex")}`);

      order.amount_paid = status === "captured" ? amount : 0;
      order.status = status === "captured" ? "paid" : "created";

      const payment = {
        id: paymentId,
        order_id: orderId,
        amount,
        currency: order.currency,
        status,
        method,
        captured: status === "captured",
      };
      payments.set(paymentId, payment);
      console.log(`[mock] took ${paymentId} by ${method} for ${amount}`);
      return json(200, payment);
    }

    /* ---- a refund against a payment ---- */
    if (req.method === "POST" && url.pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/)) {
      const match = url.pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/);
      const paymentId = decodeURIComponent(match[1]);
      const payment = payments.get(paymentId);
      if (!payment) {
        return json(404, { error: { description: "Payment not found" } });
      }

      // The test's way of making the gateway refuse, so that the shop's
      // handling of a refused refund can be exercised.
      if (settings.failRefund) {
        console.log(`[mock] refused the refund of ${paymentId}`);
        return json(500, { error: { description: "The gateway is not able to refund this payment." } });
      }

      const body = await readBody(req);
      const amount = Number(body.amount ?? payment.amount);
      const receipt = String(body.receipt ?? `receipt_${randomBytes(4).toString("hex")}`);

      // A refund that carries a receipt the mock has already seen is the
      // same refund, and comes back as the one that was already made.
      for (const refund of refunds.values()) {
        if (refund.receipt === receipt) {
          console.log(`[mock] the receipt ${receipt} was seen before — refund ${refund.id} again`);
          return json(200, refund);
        }
      }

      const refund = {
        id: `rfnd_${randomBytes(8).toString("hex")}`,
        payment_id: paymentId,
        amount,
        currency: body.currency ?? payment.currency ?? "INR",
        receipt,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      refunds.set(refund.id, refund);
      console.log(`[mock] refunded ${amount} against ${paymentId} as ${refund.id}`);
      return json(200, refund);
    }

    /* ---- the refund ---- */
    if (req.method === "GET" && url.pathname.match(/^\/v1\/refunds\/([^/]+)$/)) {
      const match = url.pathname.match(/^\/v1\/refunds\/([^/]+)$/);
      const refund = refunds.get(decodeURIComponent(match[1]));
      if (!refund) return json(404, { error: { description: "Refund not found" } });
      return json(200, refund);
    }

    /* ---- the refunds already against a payment ---- */
    if (req.method === "GET" && url.pathname === "/v1/refunds") {
      const paymentId = url.searchParams.get("payment_id");
      const items = [...refunds.values()].filter((r) =>
        paymentId ? r.payment_id === paymentId : true
      );
      return json(200, { entity: "collection", count: items.length, items });
    }

    return json(404, { error: { description: "No such thing" } });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const { port: on } = server.address();
      resolve({
        base: `http://127.0.0.1:${on}`,
        orders,
        payments,
        refunds,
        idempotency,
        settings,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

// Run on its own when this file is the entry point.
if (process.argv[1] && process.argv[1].endsWith("mock-gateway.mjs")) {
  const port = Number(process.env.MOCK_PORT ?? DEFAULT_PORT);
  const mock = await startMockGateway(port);
  console.log(`the mock gateway is on ${mock.base}`);
  console.log("point the shop at it with:");
  console.log(`  RAZORPAY_API_BASE=${mock.base} npm run dev`);
}
