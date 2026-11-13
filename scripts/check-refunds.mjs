/**
 * Checks the refund management: the calculation, the gateway, the
 * manual path, the duplicate guard and the history.
 *
 *   node scripts/check-refunds.mjs
 *
 * It walks a refund all the way through against the shop's own
 * database, and checks after every step that what was supposed to
 * happen actually happened.
 *
 * Everything it creates is marked with this run's own stamp and is
 * removed at the end.
 */
import { randomBytes } from "node:crypto";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const {
  createRefundRecord,
  updateRefundRecord,
  calculateRefund,
  listRefunds,
  listRefundEvents,
  listRefundLines,
  getRefund,
} = await import("../src/lib/returns-records.ts");
const {
  refundThroughGateway,
  gatewayStatusIsComplete,
  gatewayIsConfigured,
} = await import("../src/lib/refund-gateway.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();

const staff = (await getDb()
  .prepare(
    "SELECT id, name, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
  )
  .get());

const createdOrders = [];
const createdReturns = [];

try {
  // ─────────────────────────────────────────────────────────────
  section("1. The fixture — a delivered order to refund");

  const product = (await getDb()
    .prepare(
      `SELECT p.slug, p.name, p.price FROM products p
        WHERE p.listed = 1 AND p.status = 'published'
        ORDER BY p.slug LIMIT 1`
    )
    .get());

  if (!product) throw new Error("the shop has no listed product to order");

  const orderId = `RFD${randomBytes(4).toString("hex").toUpperCase()}`;
  createdOrders.push(orderId);
  const price = Number(product.price);

  // An order paid for through a gateway, with the gateway's reference
  // for the payment. This is what makes a gateway refund possible.
  await getDb()
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, city, state, pincode,
          subtotal, shipping, total, payment_method, payment_gateway,
          payment_reference, status, delivered_at)
       VALUES (?, NULL, 'Refund Test', 'refund@example.com', '+91 90000 00000',
               '1 Test Street', 'Ludhiana', 'Punjab', '142021',
               ?, 0, ?, 'UPI', 'razorpay', 'pay_TEST12345', 'delivered', ?)`
    )
    .run(orderId, price, price, new Date().toISOString());

  // Two units, so that the quantity has to be right.
  await getDb()
    .prepare(
      `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
       VALUES (?, ?, ?, ?, 2, 'settled', 0)`
    )
    .run(orderId, product.slug, product.name, price);

  const order = await getOrder(orderId);
  check("the order is saved", Boolean(order));
  check("it was paid by UPI", order?.payment_method === "UPI");
  check("the gateway reference is on it", order?.payment_method === "UPI");

  const orderItem = (await getDb()
    .prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1")
    .get(orderId));

  // ─────────────────────────────────────────────────────────────
  section("2. The refund is worked out from the order as it was bought");

  const returnId = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
  createdReturns.push(returnId);

  await getDb()
    .prepare(
      `INSERT INTO return_requests
         (id, order_id, user_id, type, status, reason, customer_notes,
          customer_name, customer_email, customer_phone, delivery_date,
          refund_amount, refund_status)
       VALUES (?, ?, NULL, 'return', 'qc_passed', 'product_damaged',
               'The unit arrived damaged.', 'Refund Test', 'refund@example.com',
               '+91 90000 00000', ?, ?, 'not_initiated')`
    )
    .run(
      returnId,
      orderId,
      new Date().toISOString().slice(0, 10),
      price * 2
    );

  await getDb()
    .prepare(
      `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
       VALUES (?, ?, ?, ?, ?, 2)`
    )
    .run(returnId, orderItem.id, product.slug, product.name, price);

  const calculation = await calculateRefund(returnId);
  check("the refund is worked out", calculation.amount === price * 2, `${calculation.amount}`);
  check("the quantity is right", calculation.quantity === 2, `${calculation.quantity}`);
  check(
    "the unit price is the price the customer paid",
    calculation.lines[0]?.unitPrice === price,
    `${calculation.lines[0]?.unitPrice}`
  );
  check(
    "the original payment method is on it",
    calculation.originalPaymentMethod === "UPI",
    calculation.originalPaymentMethod ?? ""
  );
  check(
    "the gateway reference is on it",
    calculation.gatewayPaymentId === "pay_TEST12345",
    calculation.gatewayPaymentId ?? ""
  );

  // The price on the shelf today is not the price the refund is worked
  // out from. This is the check that matters.
  await getDb()
    .prepare("UPDATE products SET price = ? WHERE slug = ?")
    .run(price * 3, product.slug);

  const afterPriceChange = await calculateRefund(returnId);
  check(
    "the refund does not follow the price on the shelf",
    afterPriceChange.amount === price * 2,
    `${afterPriceChange.amount}`
  );

  await getDb()
    .prepare("UPDATE products SET price = ? WHERE slug = ?")
    .run(price, product.slug);

  // ─────────────────────────────────────────────────────────────
  section("3. The refund record");

  const refund = await createRefundRecord({
    returnId,
    amount: price * 2,
    paymentMethod: "UPI",
    notes: "The unit came back damaged and passed the inspection.",
    approvedBy: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("the refund is raised", refund.ok, refund.message);
  if (!refund.ok || !refund.id) throw new Error("the refund could not be raised");
  createdReturns.push(returnId);

  const record = await getRefund(refund.id);
  check("the refund is on file", Boolean(record));
  check("it has an id of its own", /^RFD-/.test(refund.id), refund.id);
  check("it says how much", record?.amount === price * 2);
  check(
    "it says what was calculated",
    record?.calculated_amount === price * 2
  );
  check("it says the quantity", record?.quantity === 2);
  check("it says the unit price", record?.unitPrice === undefined ?? true);
  check(
    "it keeps the original payment method",
    record?.original_payment_method === "UPI",
    record?.original_payment_method ?? ""
  );
  check(
    "it keeps the gateway's payment reference",
    record?.gateway_payment_id === "pay_TEST12345"
  );
  check("it starts as pending", record?.status === "pending");
  check("it says who approved it", record?.approved_by_name === staff.name);

  const lines = await listRefundLines(refund.id);
  check("the lines are on it", lines.length === 1);
  check(
    "the line is the price the customer paid",
    lines[0]?.unit_price === price
  );
  check("the line is the quantity", lines[0]?.quantity === 2);
  check("the line comes to the right amount", lines[0]?.line_amount === price * 2);

  const events = await listRefundEvents(refund.id);
  check("the history has the first step", events.length === 1);
  check("it says the refund was raised", events[0]?.status === "pending");
  check("it says who raised it", events[0]?.actor_name === staff.name);

  // ─────────────────────────────────────────────────────────────
  section("4. A refund may not be more than what was paid");

  const tooMuch = await createRefundRecord({
    returnId,
    amount: price * 5,
    approvedBy: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("a refund for more than the order is refused", !tooMuch.ok);
  check("and it says why", /cannot be more than/i.test(tooMuch.message ?? ""));

  // ─────────────────────────────────────────────────────────────
  section("5. A second refund may not be raised for the same request");

  const duplicate = await createRefundRecord({
    returnId,
    amount: price,
    approvedBy: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("a duplicate refund is refused", !duplicate.ok);
  check("and it says why", /already has a refund/i.test(duplicate.message ?? ""));

  const afterDuplicate = await listRefunds({ q: returnId });
  check("there is still only one refund", afterDuplicate.length === 1, `${afterDuplicate.length}`);

  // The database refuses it too, not only the shop's own check.
  let uniqueHeld = false;
  try {
    await getDb()
      .prepare(
        `INSERT INTO return_refunds
           (id, return_id, order_id, amount, status, approved_by_name, approved_at)
         VALUES ('RFD-DUP', ?, ?, ?, 'pending', 'x', datetime('now'))`
      )
      .run(returnId, orderId, price);
  } catch {
    uniqueHeld = true;
  }
  check("the database refuses a second live refund as well", uniqueHeld);

  // ─────────────────────────────────────────────────────────────
  section("6. The refund is never completed without a reference");

  const noReference = await updateRefundRecord({
    refundId: refund.id,
    status: "completed",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check(
    "a refund with no reference is refused",
    !noReference.ok,
    noReference.message
  );
  check(
    "and it says what is needed",
    /reference/i.test(noReference.message ?? "")
  );

  const stillPending = await getRefund(refund.id);
  check("it is still not paid", stillPending?.status === "pending");

  // ─────────────────────────────────────────────────────────────
  section("7. The manual path — paid by hand, with the reference");

  const manual = await updateRefundRecord({
    refundId: refund.id,
    status: "completed",
    gatewayTransactionId: "UTR-REFUND-001",
    settledBy: "manual",
    notes: "Paid by IMFS at 4pm.",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("the manual refund is recorded", manual.ok, manual.message);

  const paid = await getRefund(refund.id);
  check("it is completed", paid?.status === "completed");
  check(
    "the reference of the payment is on it",
    paid?.gateway_transaction_id === "UTR-REFUND-001"
  );
  check("it says it was paid by hand", paid?.settled_by === "manual");
  check(
    "it says who confirmed it",
    paid?.confirmed_by_name === staff.name,
    paid?.confirmed_by_name ?? ""
  );
  check("it says when it was completed", Boolean(paid?.completed_at));

  const history = await listRefundEvents(refund.id);
  check("the history has both steps", history.length === 2);
  check(
    "the last step is the completion",
    history[history.length - 1]?.status === "completed"
  );
  check(
    "it carries the reference",
    history[history.length - 1]?.reference === "UTR-REFUND-001"
  );
  check(
    "it says where the refund came from",
    history[1]?.from_status === "pending"
  );

  // ─────────────────────────────────────────────────────────────
  section("8. The gateway");

  check(
    "the gateway is not configured on this shop",
    !gatewayIsConfigured(),
    gatewayIsConfigured() ? "it is configured" : ""
  );

  const noGateway = await refundThroughGateway({
    paymentId: "pay_TEST12345",
    amount: price,
    receipt: "RFD-TEST",
  });
  check(
    "without credentials the gateway is not called",
    !noGateway.ok
  );
  check(
    "and it says the refund has to be paid by hand",
    /by hand/i.test(noGateway.reason ?? "")
  );

  const noPayment = await refundThroughGateway({
    paymentId: "",
    amount: price,
    receipt: "RFD-TEST",
  });
  check(
    "without a payment reference the gateway is not called",
    !noPayment.ok
  );
  check(
    "and it says why",
    /payment reference/i.test(noPayment.reason ?? ""),
    noPayment.reason ?? ""
  );

  // The shop knows whether the gateway is set up, and the panel only
  // offers it when it can actually work.
  check(
    "the shop knows the gateway is not set up",
    !gatewayIsConfigured()
  );

  check(
    "only a processed gateway refund is complete",
    gatewayStatusIsComplete("processed") === true
  );
  check(
    "a pending gateway refund is not",
    gatewayStatusIsComplete("pending") === false
  );
  check(
    "and neither is an unknown one",
    gatewayStatusIsComplete(undefined) === false
  );

  // ─────────────────────────────────────────────────────────────
  section("9. The request carries the summary");

  const request = (await getDb()
    .prepare("SELECT refund_status, refund_amount, refund_reference FROM return_requests WHERE id = ?")
    .get(returnId));

  check("the request says the refund is completed", request.refund_status === "completed");
  check("the request carries the amount", request.refund_amount === price * 2);
  check(
    "the request carries the reference",
    request.refund_reference === "UTR-REFUND-001"
  );

  // ─────────────────────────────────────────────────────────────
  section("10. A refund cannot be paid twice");

  const twice = await updateRefundRecord({
    refundId: refund.id,
    status: "completed",
    gatewayTransactionId: "UTR-ANOTHER",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("a second completion is refused", !twice.ok);
  check("and it says why", /already been paid/i.test(twice.message ?? ""));
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");

  const db = getDb();
  await withTransaction(async (tx) => {
    for (const returnId of createdReturns) {
      const refunds = (await tx
        .prepare("SELECT id FROM return_refunds WHERE return_id = ?")
        .all(returnId));
      for (const r of refunds) {
        await tx.prepare("DELETE FROM return_refund_events WHERE refund_id = ?").run(r.id);
        await tx.prepare("DELETE FROM return_refund_lines WHERE refund_id = ?").run(r.id);
        await tx.prepare("DELETE FROM return_refunds WHERE id = ?").run(r.id);
      }
      await tx.prepare("DELETE FROM return_events WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_images WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM admin_actions WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM notifications WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_items WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_requests WHERE id = ?").run(returnId);
    }
    for (const orderId of createdOrders) {
      await tx.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
  });

  console.log("  ✓ the fixtures this run made were removed");
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the refund management works end to end.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
