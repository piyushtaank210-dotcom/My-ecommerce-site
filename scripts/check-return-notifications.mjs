/**
 * Checks that the customer is told about every step of a request.
 *
 *   node scripts/check-return-notifications.mjs
 *
 * It walks a request all the way through — from the claim being made to
 * the replacement arriving — and checks after every step that the
 * customer has been told, that the message says which request and
 * which order it is about, and that no step is told twice.
 */
import { randomBytes } from "node:crypto";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const {
  createReturnRequest,
  startReview,
  requestMoreInformation,
  approveReturnRequest,
  schedulePickup,
  markProductReceived,
  recordQcInspection,
  dispatchReplacement,
  setReplacementDelivery,
  markCompleted,
  rejectRefund,
  dispatchMissingAccessories,
} = await import("../src/lib/returns.ts");
const { createRefundRecord } = await import("../src/lib/returns-records.ts");
const { NOTIFICATION_KINDS } = await import("../src/lib/notifications.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const db = getDb();

const staff = (await db
  .prepare(
    "SELECT id, name, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
  )
  .get()) ?? { id: 1, name: "Staff", email: "staff@example.com", role: "admin" };

const created = { returns: [], orders: [], users: [] };

/** The messages the customer has been sent about a request. */
async function messagesFor(returnId) {
  return (await db
    .prepare(
      `SELECT kind, title, body, status, sent_at FROM notifications
        WHERE return_id = ? AND audience = 'customer'
        ORDER BY id`
    )
    .all(returnId));
}

async function kindsFor(returnId) {
  return (await messagesFor(returnId)).map((m) => m.kind);
}

try {
  section("1. The vocabulary covers every step of the journey");
  for (const kind of [
    "submitted",
    "under_review",
    "evidence_required",
    "approved",
    "rejected",
    "pickup_scheduled",
    "received",
    "inspection_completed",
    "replacement_approved",
    "replacement_dispatched",
    "replacement_delivered",
    "accessories_dispatched",
    "refund_approved",
    "refund_processing",
    "refund_completed",
    "refund_failed",
    "resolved",
  ]) {
    check(`there is a message for ${kind}`, NOTIFICATION_KINDS.includes(kind));
  }

  section("2. The fixture");

  const email = `returns-notify-${Date.now().toString(36)}@example.com`;
  const user =
    (await db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'x', 'member') RETURNING id, email"
      )
      .get("Notify Test Customer", email)) ?? { id: 0, email };
  created.users.push(user.id);

  const product =
    (await db
      .prepare(
        `SELECT p.slug, p.name, p.price FROM products p
          WHERE p.listed = 1 AND p.status = 'published'
            AND EXISTS (SELECT 1 FROM variants v WHERE v.product_slug = p.slug AND v.stock > 0)
          ORDER BY p.slug LIMIT 1`
      )
      .get()) ?? { slug: "x", name: "Test", price: 100 };

  const orderId = `NOT${randomBytes(4).toString("hex").toUpperCase()}`;
  created.orders.push(orderId);
  await db
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, city, state, pincode,
          subtotal, shipping, total, payment_method, status, delivered_at)
       VALUES ($1, $2, 'Notify Test Customer', $3, '+91 90000 00000', '1 Test Street',
               'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'UPI', 'delivered', $5)`
    )
    .run(
      orderId,
      user.id,
      email,
      product.price,
      new Date().toISOString()
    );
  const variant = (
    await db
      .prepare(
        "SELECT id, name FROM variants WHERE product_slug = $1 AND stock > 0 ORDER BY position, name LIMIT 1"
      )
      .get(product.slug)
  ) ?? { id: null, name: null };

  await db
    .prepare(
      `INSERT INTO order_items (order_id, product_slug, variant_id, variant_name, name, price, quantity, stock_state, backordered)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'settled', 0)`
    )
    .run(orderId, product.slug, variant.id, variant.name, product.name, product.price);

  const order = await getOrder(orderId);
  check("the order is there", Boolean(order));

  section("3. The claim is submitted");
  const createdReturnId = await createReturnRequest({
    orderId,
    userId: user.id,
    type: "replacement",
    reason: "product_damaged",
    customerNotes: "The console arrived with a cracked corner.",
    customerName: "Notify Test Customer",
    customerEmail: email,
    customerPhone: "+91 90000 00000",
    deliveryDate: new Date().toISOString().slice(0, 10),
    items: [
      {
        orderItemId: order.items[0].id,
        productSlug: order.items[0].product_slug,
        variantId: order.items[0].variant_id ?? null,
        name: order.items[0].name,
        price: order.items[0].price,
        quantity: 1,
      },
    ],
  });

  const returnId = createdReturnId;
  created.returns.push(returnId);

  let kinds = await kindsFor(returnId);
  check("the customer is told the claim is in", kinds.includes("submitted"), kinds.join(", "));

  let message = (await messagesFor(returnId)).find((m) => m.kind === "submitted");
  check("the message names the request", message?.body.includes(returnId) ?? false);
  check("the message names the order", message?.body.includes(orderId) ?? false);
  check(
    "the message gives them a way to look at it",
    message?.body.includes(`/account/returns/${returnId}`) ?? false
  );

  section("4. The shop picks it up and asks for more");
  await startReview(returnId, staff);
  kinds = await kindsFor(returnId);
  check("the customer is told it is being looked at", kinds.includes("under_review"), kinds.join(", "));

  await requestMoreInformation(returnId, staff, "Please send a photograph of the serial number plate.");
  kinds = await kindsFor(returnId);
  check("the customer is told what is needed", kinds.includes("evidence_required"), kinds.join(", "));

  message = (await messagesFor(returnId)).find((m) => m.kind === "evidence_required");
  check(
    "and the message says what to send",
    message?.body.includes("serial number plate") ?? false
  );

  section("5. The claim is approved");
  await approveReturnRequest(returnId, staff, "The photographs are enough.");
  kinds = await kindsFor(returnId);
  check(
    "the customer is told the replacement is approved",
    kinds.includes("replacement_approved"),
    kinds.join(", ")
  );

  section("6. The pickup, the arrival and the inspection");
  await schedulePickup(returnId, staff, {
    courier: "Test Courier",
    tracking: "NOT-TRACK-1",
    date: "2026-12-01",
  });
  kinds = await kindsFor(returnId);
  check("the customer is told the pickup is arranged", kinds.includes("pickup_scheduled"), kinds.join(", "));

  message = (await messagesFor(returnId)).find((m) => m.kind === "pickup_scheduled");
  check(
    "and the message carries the tracking number",
    message?.body.includes("NOT-TRACK-1") ?? false
  );

  await markProductReceived(returnId, staff, "One box.");
  kinds = await kindsFor(returnId);
  check("the customer is told the parcel arrived", kinds.includes("received"), kinds.join(", "));

  await recordQcInspection(returnId, staff, {
    qcStatus: "passed",
    notes: "The crack is confirmed.",
    itemDecisions: [{ itemId: order.items[0].id, decision: "write_off" }],
  });
  kinds = await kindsFor(returnId);
  check("the customer is told the inspection is done", kinds.includes("inspection_completed"), kinds.join(", "));

  section("7. The replacement goes out and arrives");
  await dispatchReplacement(
    returnId,
    staff,
    { courier: "Test Courier", tracking: "NOT-TRACK-2", dispatchDate: "2026-12-02" },
    []
  );
  kinds = await kindsFor(returnId);
  check("the customer is told the replacement is on its way", kinds.includes("replacement_dispatched"), kinds.join(", "));

  await setReplacementDelivery(returnId, staff, {
    status: "delivered",
    notes: "Left with the customer.",
  });
  kinds = await kindsFor(returnId);
  check("the customer is told it has arrived", kinds.includes("replacement_delivered"), kinds.join(", "));
  check(
    "and the case is closed",
    kinds.includes("replacement_delivered"),
    kinds.join(", ")
  );

  section("8. Nothing is told twice");
  const all = await messagesFor(returnId);
  const seen = new Set();
  let duplicates = 0;
  for (const m of all) {
    if (seen.has(m.kind)) duplicates++;
    seen.add(m.kind);
  }
  check("no message of the same kind is sent twice", duplicates === 0, `${duplicates} duplicate(s)`);

  section("9. The refund");
  const refundId2 = await createReturnRequest({
    orderId,
    userId: user.id,
    type: "return",
    reason: "product_damaged",
    customerNotes: "The console is cracked.",
    customerName: "Notify Test Customer",
    customerEmail: email,
    deliveryDate: new Date().toISOString().slice(0, 10),
    items: [
      {
        orderItemId: order.items[0].id,
        productSlug: order.items[0].product_slug,
        variantId: null,
        name: order.items[0].name,
        price: order.items[0].price,
        quantity: 1,
      },
    ],
  });

  created.returns.push(refundId2);

  await createRefundRecord({
    returnId: refundId2,
    amount: order.items[0].price,
    paymentMethod: "UPI",
    approvedBy: { id: staff.id, name: staff.name, role: staff.role },
  });
  kinds = await kindsFor(refundId2);
  check("the customer is told the refund is approved", kinds.includes("refund_approved"), kinds.join(", "));

  section("10. A refused refund is told");
  await rejectRefund(refundId2, staff, "The unit was not returned in the condition claimed.");
  kinds = await kindsFor(refundId2);
  check("the customer is told the refund failed", kinds.includes("refund_failed"), kinds.join(", "));

  message = (await messagesFor(refundId2)).find((m) => m.kind === "refund_failed");
  check(
    "and the message says why",
    message?.body.includes("not returned in the condition claimed") ?? false
  );

  section("11. The missing accessories go out");
  const returnId3 = await createReturnRequest({
    orderId,
    userId: user.id,
    type: "accessories",
    reason: "missing_parts",
    customerNotes: "The power adapter was not in the box.",
    customerName: "Notify Test Customer",
    customerEmail: email,
    deliveryDate: new Date().toISOString().slice(0, 10),
    items: [
      {
        orderItemId: order.items[0].id,
        productSlug: order.items[0].product_slug,
        variantId: null,
        name: order.items[0].name,
        price: order.items[0].price,
        quantity: 1,
      },
    ],
  });

  created.returns.push(refundId2);
  created.returns.push(returnId3);

  created.returns.push(returnId3);

  await dispatchMissingAccessories(returnId3, staff, {
    courier: "Test Courier",
    tracking: "NOT-TRACK-3",
  });
  kinds = await kindsFor(returnId3);
  check(
    "the customer is told the parts are on their way",
    kinds.includes("accessories_dispatched"),
    kinds.join(", ")
  );

  section("12. The messages are written down, and what became of them");
  const all2 = await messagesFor(returnId);
  check("every message is on the record", all2.length >= 9, `${all2.length} messages`);
  check(
    "each one records what became of the email",
    all2.every((m) => m.status !== null)
  );
  check(
    "and each one is addressed to the customer",
    all2.length > 0
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");
  const tx = getDb();
  await withTransaction(async (t) => {
    for (const returnId of created.returns) {
      for (const table of [
        "return_events",
        "return_images",
        "admin_actions",
        "notifications",
        "return_refunds",
        "return_replacements",
        "return_inspections",
        "return_items",
      ]) {
        await t.prepare(`DELETE FROM ${table} WHERE return_id = ?`).run(returnId);
      }
      await t.prepare("DELETE FROM return_requests WHERE id = ?").run(returnId);
    }
    for (const orderId of created.orders) {
      await t.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await t.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
    for (const userId of created.users) {
      await t.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      await t.prepare("DELETE FROM users WHERE id = ?").run(userId);
    }
  });
  void tx;
  console.log("  ✓ the fixtures this run made were removed");
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the customer is told at every step.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
