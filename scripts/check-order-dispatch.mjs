/**
 * The dispatch of an order, and the money that goes back when it is
 * called off.
 *
 *   node scripts/check-order-dispatch.mjs
 *
 * It walks the whole journey against the shop's own database:
 *
 *   · an order cannot be confirmed without a courier, a method and a
 *     tracking number
 *   · the details are saved, and they are still there when the order is
 *     read again
 *   · an order cannot be cancelled without a reason
 *   · cancelling gives the stock back — and gives it back exactly once
 *   · a refund is refused until the order has been cancelled
 *   · the refund goes to the gateway, against the payment the order was
 *     paid with
 *   · a second refund is refused, and the money is not sent twice
 *   · a refund the gateway refuses leaves the order cancelled and can be
 *     tried again
 *
 * The gateway is a mock. The shop's LIVE keys are never used here: the
 * mock stands in for the gateway so that the whole path is proved
 * without asking the real one for money that is not there.
 *
 * Everything it creates is marked with this run's own stamp and is
 * removed at the end.
 */
import { randomBytes } from "node:crypto";
import { startMockGateway } from "./lib/mock-gateway.mjs";

// The gateway is stood up first, so that the shop can be pointed at it
// before anything of the shop's own is read.
const mock = await startMockGateway(0);

// The shop's environment is read next, and then these three are put on
// top of it: the shop must talk to the mock and to nobody else, and it
// must not send any mail while a test is running.
await import("./lib/env.mjs");
process.env.RAZORPAY_API_BASE = mock.base;
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_dispatch";
process.env.RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "dispatch_check_secret";
process.env.RESEND_API_KEY = "";

const { registerTsResolver } = await import("./lib/ts-loader.mjs");
registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const { takeStockForOrder } = await import("../src/lib/inventory.ts");
const {
  cancelOrderWithReason,
  confirmOrderWithShipping,
  courierTrackingUrl,
  getOrderRefund,
  refreshRefundStatus,
  refundCancelledOrder,
} = await import("../src/lib/order-dispatch.ts");
const { orderStatusLabel } = await import("../src/lib/order-status.ts");

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
const createdPayments = [];

/**
 * The staff account the actions are made as.
 */
const staff = await getDb()
  .prepare("SELECT id, name, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
  .get();

/**
 * The stock of a bucket, read straight from where it lives.
 */
async function stockOf(slug, variantId) {
  const row = variantId
    ? await getDb().prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)
    : await getDb().prepare("SELECT stock FROM products WHERE slug = ?").get(slug);
  return Number(row?.stock ?? 0);
}

/**
 * A product the test can order, and the bucket it is stocked in.
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
      name: String(variant.product_name),
      stock: Number(variant.stock),
    };
  }
  const product = await getDb()
    .prepare(
      `SELECT slug, name, stock FROM products
        WHERE listed = 1 AND status = 'published' AND stock >= 3
        ORDER BY slug LIMIT 1`
    )
    .get();
  if (!product) throw new Error("the shop has nothing in stock to order");
  return {
    slug: String(product.slug),
    variantId: null,
    name: String(product.name),
    stock: Number(product.stock),
  };
})();

/**
 * Writes an order and takes its stock, the way the shop does.
 *
 * The stock is taken through the shop's own inventory code, so that the
 * movement is in the history and the shelf is left as it should be.
 */
async function makeOrder(options = {}) {
  const id = `DSP${randomBytes(4).toString("hex").toUpperCase()}`;
  const price = 100;
  const total = price * 2;

  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO orders
           (id, user_id, name, email, phone, address1, city, state, pincode,
            subtotal, shipping, total, payment_method, payment_gateway,
            payment_reference, status, payment_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
      )
      .run(
        id,
        null,
        "Dispatch Check",
        `dispatch-${stamp.toLowerCase()}@example.invalid`,
        "9876022697",
        "House no.193",
        "Ludhiana",
        "Punjab",
        "142021",
        total,
        0,
        total,
        "upi",
        options.paymentReference ? "razorpay" : null,
        options.paymentReference ?? null,
        options.paymentReference ? "paid" : "pending"
      );

    const taken = await takeStockForOrder(
      db,
      id,
      fixture.slug,
      fixture.variantId,
      2,
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
      .run(
        id,
        fixture.slug,
        fixture.variantId,
        fixture.variantId ? "Test option" : null,
        fixture.name,
        price,
        2,
        taken.backordered
      );
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

  createdPayments.push(payment.id);
  return payment.id;
}

try {
  /* ─────────────────────────────────────────────────────────────── */
  section("1. The fixture — an order waiting to be confirmed");

  const order = await makeOrder();
  const stockAfterOrder = await stockOf(fixture.slug, fixture.variantId);
  check(
    "the order took its stock off the shelf",
    stockAfterOrder === fixture.stock - 2,
    `${fixture.stock} → ${stockAfterOrder}`
  );

  const before = await getOrder(order.id);
  check("the order exists", before !== null);
  check("it has no courier yet", before.courier_partner === null);
  check("it has no tracking number yet", before.tracking_id === null);
  check("it has no cancellation reason yet", before.cancellation_reason === null);
  check("it has no refund yet", before.refund_status === "none");

  /* ─────────────────────────────────────────────────────────────── */
  section("2. The order cannot be confirmed without its shipping details");

  const noCourier = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "   ",
    shippingMethod: "surface",
    trackingId: "AWB1",
    userId: staff?.id ?? null,
  });
  check("an empty courier is refused", !noCourier.ok);
  check("and it says which field", noCourier.field === "courier");

  const noMethod = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "Delhivery",
    shippingMethod: "",
    trackingId: "AWB1",
    userId: staff?.id ?? null,
  });
  check("an empty shipping method is refused", !noMethod.ok);
  check("and it says which field", noMethod.field === "method");

  const noTracking = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "Delhivery",
    shippingMethod: "surface",
    trackingId: "  ",
    userId: staff?.id ?? null,
  });
  check("an empty tracking number is refused", !noTracking.ok);
  check("and it says which field", noTracking.field === "tracking");

  const noCustom = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "Delhivery",
    shippingMethod: "other",
    trackingId: "AWB1",
    userId: staff?.id ?? null,
  });
  check("'other' without a shipping method of its own is refused", !noCustom.ok);
  check("and it says which field", noCustom.field === "customMethod");

  const stillNothing = await getOrder(order.id);
  check(
    "and none of it was written",
    stillNothing.courier_partner === null && stillNothing.tracking_id === null
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("3. The order is confirmed with its shipping details");

  const confirmed = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "Delhivery",
    shippingMethod: "surface",
    trackingId: "AWB-12345",
    userId: staff?.id ?? null,
  });
  check("the confirmation is accepted", confirmed.ok, confirmed.message);

  const afterConfirm = await getOrder(order.id);
  check("the courier is on the order", afterConfirm.courier_partner === "Delhivery");
  check("the shipping method is on the order", afterConfirm.shipping_method === "surface");
  check("the tracking number is on the order", afterConfirm.tracking_id === "AWB-12345");
  check("the order is confirmed", afterConfirm.status === "confirmed");
  check(
    "and the moment it was confirmed is on the order",
    Boolean(afterConfirm.shipping_confirmed_at)
  );

  const reread = await getOrder(order.id);
  check(
    "the details are still there when the order is read again",
    reread.courier_partner === "Delhivery" && reread.tracking_id === "AWB-12345"
  );

  const shippingNotification = await getDb()
    .prepare(
      `SELECT id FROM notifications
        WHERE order_id = ? AND kind IN ('order_tracking', 'order_confirmed')`
    )
    .get(order.id);
  check("the customer was told", Boolean(shippingNotification));

  /* ─────────────────────────────────────────────────────────────── */
  section("4. The details can be changed");

  const updated = await confirmOrderWithShipping({
    orderId: order.id,
    courierPartner: "Blue Dart",
    shippingMethod: "air",
    trackingId: "BD-98765",
    userId: staff?.id ?? null,
  });
  check("the change is accepted", updated.ok);
  const afterUpdate = await getOrder(order.id);
  check("the courier was changed", afterUpdate.courier_partner === "Blue Dart");
  check("the method was changed", afterUpdate.shipping_method === "air");
  check("the tracking number was changed", afterUpdate.tracking_id === "BD-98765");

  /* ─────────────────────────────────────────────────────────────── */
  section("5. The order cannot be cancelled without a reason");

  const noReason = await cancelOrderWithReason({
    orderId: order.id,
    reasonCode: "",
    userId: staff?.id ?? null,
  });
  check("an empty reason is refused", !noReason.ok);
  check("and it says which field", noReason.field === "reason");

  const badReason = await cancelOrderWithReason({
    orderId: order.id,
    reasonCode: "because",
    userId: staff?.id ?? null,
  });
  check("a reason that is not on the list is refused", !badReason.ok);

  const noDetail = await cancelOrderWithReason({
    orderId: order.id,
    reasonCode: "other",
    reasonDetail: "  ",
    userId: staff?.id ?? null,
  });
  check("'other' without a reason of its own is refused", !noDetail.ok);
  check("and it says which field", noDetail.field === "customReason");

  const notCancelled = await getOrder(order.id);
  check("and the order is still open", notCancelled.status !== "cancelled");

  /* ─────────────────────────────────────────────────────────────── */
  section("6. The order is cancelled, and the stock comes back");

  const cancelled = await cancelOrderWithReason({
    orderId: order.id,
    reasonCode: "out_of_stock",
    userId: staff?.id ?? null,
  });
  check("the cancellation is accepted", cancelled.ok, cancelled.message);

  const afterCancel = await getOrder(order.id);
  check("the order is cancelled", afterCancel.status === "cancelled");
  check(
    "the reason is on the order",
    afterCancel.cancellation_reason_code === "out_of_stock" &&
      /out of stock/i.test(afterCancel.cancellation_reason ?? "")
  );
  check("the moment it was cancelled is on the order", Boolean(afterCancel.cancelled_at));

  const stockAfterCancel = await stockOf(fixture.slug, fixture.variantId);
  check(
    "the stock is back on the shelf",
    stockAfterCancel === fixture.stock,
    `${stockAfterOrder} → ${stockAfterCancel}`
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("7. The stock comes back exactly once");

  const again = await cancelOrderWithReason({
    orderId: order.id,
    reasonCode: "out_of_stock",
    userId: staff?.id ?? null,
  });
  check("a second cancellation is refused", !again.ok);
  check(
    "and it says why",
    /already been cancelled/i.test(again.message ?? ""),
    again.message
  );

  const stockAfterSecond = await stockOf(fixture.slug, fixture.variantId);
  check(
    "the stock was not given back a second time",
    stockAfterSecond === fixture.stock,
    `${stockAfterCancel} → ${stockAfterSecond}`
  );

  const movements = await getDb()
    .prepare(
      "SELECT id FROM inventory_movements WHERE order_id = ? AND movement_type = 'restock'"
    )
    .all(order.id);
  check("there is one restock movement for the order", movements.length === 1);

  /* ─────────────────────────────────────────────────────────────── */
  section("8. A refund is refused until the order has been cancelled");

  const openOrder = await makeOrder();
  const early = await refundCancelledOrder({
    orderId: openOrder.id,
    userId: staff?.id ?? null,
  });
  check("a refund for an order that is not cancelled is refused", !early.ok);
  check(
    "and it says why",
    /only a cancelled order/i.test(early.message ?? ""),
    early.message
  );

  const noPayment = await refundCancelledOrder({
    orderId: openOrder.id,
    userId: staff?.id ?? null,
  });
  check("and it is still refused", !noPayment.ok);

  /* ─────────────────────────────────────────────────────────────── */
  section("9. The refund goes to the gateway");

  const paid = await makeOrder();
  const paymentId = await gatewayPayment(paid.id, paid.total);
  await getDb()
    .prepare("UPDATE orders SET payment_reference = ?, payment_gateway = 'razorpay' WHERE id = ?")
    .run(paymentId, paid.id);

  // The order is confirmed with its shipping details before it is
  // called off — the way it really goes.
  const paidConfirm = await confirmOrderWithShipping({
    orderId: paid.id,
    courierPartner: "Delhivery",
    shippingMethod: "surface",
    trackingId: "AWB-PAID-1",
    userId: staff?.id ?? null,
  });
  check("it is confirmed with its shipping details first", paidConfirm.ok);

  await cancelOrderWithReason({
    orderId: paid.id,
    reasonCode: "customer_requested",
    reasonDetail: "",
    userId: staff?.id ?? null,
  });

  const refundsBefore = mock.refunds.size;
  const refund = await refundCancelledOrder({
    orderId: paid.id,
    userId: staff?.id ?? null,
  });

  check("the refund is accepted", refund.ok, refund.message);
  check("the gateway gave a refund id", Boolean(refund.refundId));
  check(
    "the gateway's own status is what is reported",
    refund.refundStatus === "pending",
    String(refund.refundStatus)
  );
  check("the gateway was asked for exactly one refund", mock.refunds.size === refundsBefore + 1);

  const afterRefund = await getOrder(paid.id);
  check("the refund id is on the order", Boolean(afterRefund.refund_id));
  check("the refund amount is on the order", afterRefund.refund_amount === paid.total);
  check("the refund status is on the order", afterRefund.refund_status === "pending");
  check("the order is still cancelled", afterRefund.status === "cancelled");

  const refundRow = await getOrderRefund(paid.id);
  check("the refund is on file", refundRow !== null);
  check("and it is against the payment the order was paid with", refundRow.paymentId === paymentId);

  /* ─────────────────────────────────────────────────────────────── */
  section("10. The money is not sent back twice");

  const duplicate = await refundCancelledOrder({
    orderId: paid.id,
    userId: staff?.id ?? null,
  });
  check("a second refund is refused", !duplicate.ok);
  check(
    "and it says why",
    /already being processed|already been refunded/i.test(duplicate.message ?? ""),
    duplicate.message
  );
  check(
    "and the gateway was not asked for another one",
    mock.refunds.size === refundsBefore + 1,
    `${mock.refunds.size} refunds at the gateway`
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("11. A refund the gateway refuses is handled safely");

  const failing = await makeOrder();
  const failingPayment = await gatewayPayment(failing.id, failing.total);
  await getDb()
    .prepare("UPDATE orders SET payment_reference = ?, payment_gateway = 'razorpay' WHERE id = ?")
    .run(failingPayment, failing.id);
  await cancelOrderWithReason({
    orderId: failing.id,
    reasonCode: "payment_issue",
    userId: staff?.id ?? null,
  });

  mock.settings.failRefund = true;
  const refused = await refundCancelledOrder({
    orderId: failing.id,
    userId: staff?.id ?? null,
  });
  mock.settings.failRefund = false;

  check("the refund is refused", !refused.ok);
  check(
    "and it says the order is still cancelled",
    /still cancelled/i.test(refused.message ?? ""),
    refused.message
  );

  const afterFailure = await getOrder(failing.id);
  check("the order is still cancelled", afterFailure.status === "cancelled");
  check("the failure is on the order", afterFailure.refund_status === "failed");
  check("and the reason for it is on the order", Boolean(afterFailure.refund_error));

  const refundsAfterFailure = mock.refunds.size;
  const retried = await refundCancelledOrder({
    orderId: failing.id,
    userId: staff?.id ?? null,
  });
  check("the refund can be tried again", retried.ok, retried.message);
  check(
    "and it is the only refund at the gateway for that payment",
    mock.refunds.size === refundsAfterFailure + 1
  );

  const afterRetry = await getOrder(failing.id);
  check("the order carries the refund now", afterRetry.refund_status === "pending");
  check("and the failure is cleared", afterRetry.refund_error === null);

  /* ─────────────────────────────────────────────────────────────── */
  section("12. The refund's status is the gateway's, not the shop's");

  const pending = await refreshRefundStatus({
    orderId: paid.id,
    userId: staff?.id ?? null,
  });
  check("the status is asked for", pending.ok, pending.message);
  check(
    "and it is the gateway's own",
    pending.refundStatus === "pending",
    String(pending.refundStatus)
  );
  check(
    "and the shop does not claim the money has arrived",
    /has not reached the customer/i.test(pending.message ?? ""),
    pending.message
  );

  const refundId = (await getOrderRefund(paid.id))?.refundId;
  const atTheGateway = refundId ? mock.refunds.get(refundId) : null;
  if (atTheGateway) atTheGateway.status = "processed";

  const processed = await refreshRefundStatus({
    orderId: paid.id,
    userId: staff?.id ?? null,
  });
  check("and when the gateway says processed, so does the shop", processed.refundStatus === "processed");
  const afterProcessed = await getOrder(paid.id);
  check("the order carries the date it was paid back", Boolean(afterProcessed.refunded_at));

  const againAfterProcessed = await refundCancelledOrder({
    orderId: paid.id,
    userId: staff?.id ?? null,
  });
  check("and it is not paid back a second time", againAfterProcessed.ok);
  check(
    "the gateway was not asked again",
    mock.refunds.size === refundsAfterFailure + 1,
    `${mock.refunds.size} refunds at the gateway`
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("13. The customer can follow their parcel");

  const customer = await getOrder(paid.id);
  check("the courier is on the order the customer sees", Boolean(customer.courier_partner));
  check("the tracking number is on it too", Boolean(customer.tracking_id));

  check(
    "a known courier is given its own tracking page",
    courierTrackingUrl("Delhivery") === "https://www.delhivery.com/track/",
    String(courierTrackingUrl("Delhivery"))
  );
  check(
    "and so is another one",
    courierTrackingUrl("Xpressbees") === "https://www.xpressbees.com/track/"
  );
  check(
    "a courier the shop does not know is given no made-up link",
    courierTrackingUrl("A Courier That Does Not Exist") === null
  );
  check("and an empty courier is given no link either", courierTrackingUrl("") === null);

  /* ─────────────────────────────────────────────────────────────── */
  section("14. The order that was not paid for");

  const cash = await makeOrder();
  await cancelOrderWithReason({
    orderId: cash.id,
    reasonCode: "customer_requested",
    userId: staff?.id ?? null,
  });
  const byHand = await refundCancelledOrder({
    orderId: cash.id,
    userId: staff?.id ?? null,
  });
  check("a refund with no gateway payment is refused", !byHand.ok);
  check(
    "and it says the refund has to be paid by hand",
    /by hand/i.test(byHand.message ?? ""),
    byHand.message
  );
  /* ─────────────────────────────────────────────────────────────── */
  section("15. The status badge");

  check(
    "a confirmed order says so",
    orderStatusLabel("confirmed") === "Confirmed"
  );
  check("a packed order says so", orderStatusLabel("packed") === "Packed");
  check("a shipped order says so", orderStatusLabel("shipped") === "Shipped");
  check(
    "a delivered order says so",
    orderStatusLabel("delivered") === "Delivered"
  );
  check(
    "a cancelled order says so",
    orderStatusLabel("cancelled") === "Cancelled"
  );
  check(
    "an order waiting to be checked says Pending",
    orderStatusLabel("pending") === "Pending"
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("16. An order that has been paid for through the gateway");

  const awaiting = await makeOrder();
  await getDb()
    .prepare("UPDATE orders SET payment_gateway = 'razorpay' WHERE id = ?")
    .run(awaiting.id);
  const awaitingOrder = await getOrder(awaiting.id);
  check("the order is waiting for its money", Boolean(awaitingOrder.payment_gateway));
  check(
    "and it has no payment reference yet",
    awaitingOrder.payment_reference === null
  );
  check(
    "so it reads as Pending",
    orderStatusLabel(awaitingOrder.status) === "Pending"
  );
  check(
    "and its payment status is pending too",
    awaitingOrder.payment_status === "pending",
    awaitingOrder.payment_status
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("17. The payment and the order are two different things");

  const paidOrder = await makeOrder({ paymentReference: "pay_PENDINGCHECK1" });
  const paidRow = await getOrder(paidOrder.id);
  check("a paid order says so", paidRow.payment_status === "paid");
  check(
    "and the order is still pending",
    paidRow.status === "pending",
    paidRow.status
  );
  check(
    "so the two are read apart",
    paidRow.status !== paidRow.payment_status
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");

  const db = getDb();
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
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the dispatch and the refund work end to end.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
