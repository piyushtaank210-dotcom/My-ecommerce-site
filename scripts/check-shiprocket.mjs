/**
 * The courier's tracking, and the webhook that carries it.
 *
 *   node scripts/check-shiprocket.mjs
 *
 * It walks the whole way a parcel's news travels, against the shop's own
 * database:
 *
 *   · the shop signs in to the courier, and holds the token
 *   · a token the courier refuses is thrown away, and a new one fetched
 *   · the tracking is fetched by the AWB, and written down
 *   · the journey is written down once, however many times it is asked for
 *   · a delivery with no key is refused, and one with the wrong key too
 *   · a delivery that arrives twice is acted on once
 *   · a customer sees their own parcel and nobody else's
 *   · a courier that is silent, or that does not know the number, is
 *     handled without harm
 *
 * The courier is a mock. Shiprocket publishes no mock of its own, so
 * this is a small one that answers in exactly the shape Shiprocket
 * answers in — the shape from Shiprocket's own published collection. The
 * shop's LIVE credentials are never used here.
 *
 * Everything it creates is marked with this run's own stamp and is
 * removed at the end.
 */
import { randomBytes } from "node:crypto";
import { startMockShiprocket } from "./lib/mock-shiprocket.mjs";

// The courier is stood up first, so that the shop can be pointed at it
// before anything of the shop's own is read.
const mock = await startMockShiprocket(0);

// The shop's environment is read next, and then these are put on top of
// it: the shop must talk to the mock and to nobody else, and it must not
// send any mail while a test is running.
await import("./lib/env.mjs");
process.env.SHIPROCKET_API_BASE = mock.base;
process.env.SHIPROCKET_EMAIL = mock.email;
process.env.SHIPROCKET_PASSWORD = mock.password;
process.env.RESEND_API_KEY = "";

/** The secret the courier's deliveries carry. */
const WEBHOOK_SECRET = "courier-check-secret";
process.env.COURIER_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { registerTsResolver } = await import("./lib/ts-loader.mjs");
registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const { createUser } = await import("../src/lib/auth.ts");
const { signSession } = await import("../src/lib/session-token.ts");
const { confirmOrderWithShipping } = await import("../src/lib/order-dispatch.ts");
const {
  findOrderIdByAwb,
  getShipmentForOrder,
  getTrackingEvents,
  refreshShipmentTracking,
} = await import("../src/lib/shipment-tracking.ts");
const {
  resetShiprocketToken,
  shiprocketConfigured,
} = await import("../src/lib/shiprocket.ts");
const {
  normaliseAwb,
  shipmentStatusFromCourier,
} = await import("../src/lib/shipment-status.ts");
const { POST: courierEvents } = await import(
  "../src/app/api/courier-events/route.ts"
);
const { GET: accountOrders } = await import(
  "../src/app/api/account/orders/route.ts"
);
const { maySeeOrder } = await import("../src/lib/order-access.ts");

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
const createdUsers = [];
const createdSessions = [];
const createdAwbs = [];

/* ------------------------------------------------------------- the fixture */

/**
 * An order that has been dispatched, with a courier and a tracking
 * number written down.
 *
 * It is written the way the back office writes it — through the shop's
 * own dispatch code — so that the tracking number is stored in the form
 * the shop matches on.
 */
async function makeOrder({ userId = null, courier = "Xpressbees", awb } = {}) {
  const id = `CUT${randomBytes(4).toString("hex").toUpperCase()}`;
  const trackingId = awb ?? `9${randomBytes(6).toString("hex").toUpperCase()}`;

  await getDb()
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, city, state, pincode,
          subtotal, shipping, total, payment_method, status, payment_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'upi','pending','pending')`
    )
    .run(
      id,
      userId,
      "Courier Check",
      `courier-${stamp.toLowerCase()}-${randomBytes(2).toString("hex")}@example.invalid`,
      "9876022697",
      "House no.193",
      "Ludhiana",
      "Punjab",
      "142021",
      100,
      0,
      100
    );
  createdOrders.push(id);
  createdAwbs.push(trackingId);

  const confirmed = await confirmOrderWithShipping({
    orderId: id,
    courierPartner: courier,
    shippingMethod: "surface",
    trackingId,
    userId: null,
  });
  if (!confirmed.ok) {
    throw new Error(`the fixture could not be dispatched: ${confirmed.message}`);
  }

  return { id, awb: trackingId, userId };
}

/**
 * A parcel the mock knows about.
 */
function giveTheCourier(awb, over = {}) {
  mock.setTracking(awb, {
    courierName: "Xpressbees Surface",
    shipmentId: 236612717,
    orderId: 237157589,
    currentStatus: "Delivered",
    pickupDate: "2026-07-18 20:28:00",
    deliveredDate: "2026-07-19 11:37:00",
    estimatedDelivery: "2026-07-20 00:00:00",
    events: [
      {
        date: "2026-07-19 11:37:00",
        status: "DLVD",
        activity: "Delivered",
        location: "MADANPALLI, Madanapalli, ANDHRA PRADESH",
        srStatus: "7",
        label: "DELIVERED",
      },
      {
        date: "2026-07-19 08:57:00",
        status: "OFD",
        activity: "Out for Delivery",
        location: "MADANPALLI, Madanapalli, ANDHRA PRADESH",
        srStatus: "17",
        label: "OUT FOR DELIVERY",
      },
      {
        date: "2026-07-18 20:28:00",
        status: "PKD",
        activity: "Picked Shipment InScan from Manifest",
        location: "BLR/FC1, BANGALORE, KARNATAKA",
        srStatus: "6",
        label: "PICKED",
      },
    ],
    ...over,
  });
}

/**
 * Sends a delivery to the shop's webhook, the way the courier would.
 */
async function deliver(body, { key = WEBHOOK_SECRET, eventId } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (key !== null) headers["x-api-key"] = key;
  if (eventId) headers["x-event-id"] = eventId;

  const response = await courierEvents(
    new Request("http://localhost/api/courier-events", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

/**
 * How many events the shop has written down for an order.
 */
async function eventCount(orderId) {
  const row = await getDb()
    .prepare("SELECT COUNT(*) AS n FROM shipment_tracking_events WHERE order_id = ?")
    .get(orderId);
  return Number(row?.n ?? 0);
}

try {
  /* ─────────────────────────────────────────────────────────────── */
  section("1. The fixture — an order that has been dispatched");

  const order = await makeOrder();
  const fresh = await getOrder(order.id);

  check("the order exists", fresh !== null);
  check("the courier is on it", fresh.courier_partner === "Xpressbees");
  check("the tracking number is on it", fresh.tracking_id === order.awb);
  check(
    "and the tracking number is stored in the form the shop matches on",
    normaliseAwb(fresh.tracking_id) === normaliseAwb(order.awb)
  );
  check(
    "and the courier's word is not in the shop's way yet",
    fresh.shipment_status === null
  );

  check(
    "the order is found by its tracking number",
    (await findOrderIdByAwb(order.awb)) === order.id
  );
  check(
    "and by the same number written a different way",
    (await findOrderIdByAwb(` ${order.awb.toLowerCase()} `)) === order.id
  );
  check(
    "and a tracking number the shop does not know is not found",
    (await findOrderIdByAwb("000000000000")) === null
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("2. Signing in to the courier");

  check("the shop has been given its credentials", shiprocketConfigured());

  const authBefore = mock.calls.auth;
  giveTheCourier(order.awb);

  const first = await refreshShipmentTracking({ orderId: order.id });
  check("the tracking is fetched", first.ok, first.message);
  check("the shop signed in to do it", mock.calls.auth === authBefore + 1);
  check(
    "the courier was asked about the right parcel",
    mock.calls.awbs[mock.calls.awbs.length - 1] === order.awb
  );

  const authAfterFirst = mock.calls.auth;
  await refreshShipmentTracking({ orderId: order.id });
  check(
    "the token is held, and not fetched again for the next parcel",
    mock.calls.auth === authAfterFirst
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("3. A token the courier refuses");

  const authBeforeExpiry = mock.calls.auth;
  mock.expireToken();
  const afterExpiry = await refreshShipmentTracking({ orderId: order.id });
  check("the tracking is still fetched", afterExpiry.ok, afterExpiry.message);
  check(
    "and the shop signed in again",
    mock.calls.auth === authBeforeExpiry + 1,
    `${mock.calls.auth - authBeforeExpiry} sign-ins`
  );

  // The token is thrown away as well, so that the shop has to sign in
  // again — which is the thing that is about to fail.
  mock.expireToken();
  mock.settings.failAuth = true;
  const authBeforeFailure = mock.calls.auth;
  const refused = await refreshShipmentTracking({ orderId: order.id });
  mock.settings.failAuth = false;
  check("a courier that will not sign the shop in is refused", !refused.ok);
  check(
    "and it says so plainly",
    /sign the shop in|refused|could not/i.test(refused.message ?? ""),
    refused.message
  );
  check(
    "and the shop tried to sign in",
    mock.calls.auth > authBeforeFailure
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("4. The tracking, and the journey");

  const shipment = await getShipmentForOrder(order.id);
  check("the parcel is on file", shipment !== null);
  check(
    "the courier is on it, in the courier's own words",
    shipment?.courierName === "Xpressbees Surface",
    String(shipment?.courierName)
  );
  check(
    "and where it is, in the shop's own words",
    shipment?.status === "delivered",
    String(shipment?.status)
  );
  check(
    "and the courier's own code for that",
    shipment?.statusCode === "DLVD",
    String(shipment?.statusCode)
  );
  check(
    "and when it is expected",
    Boolean(shipment?.estimatedDelivery)
  );
  check(
    "and where the parcel is",
    /MADANPALLI/i.test(shipment?.location ?? ""),
    String(shipment?.location)
  );
  check(
    "and when the parcel went out",
    Boolean(shipment?.shipmentDate),
    String(shipment?.shipmentDate)
  );
  check(
    "and a place to follow it",
    (shipment?.trackingUrl ?? "").includes(order.awb),
    String(shipment?.trackingUrl)
  );

  const events = await getTrackingEvents(order.id);
  check("the journey was written down", events.length === 3, `${events.length} events`);
  check(
    "newest first",
    events[0]?.statusCode === "DLVD" && events[2]?.statusCode === "PKD",
    events.map((e) => e.statusCode).join(", ")
  );
  check(
    "with the courier's own sentence",
    /Delivered/i.test(events[0]?.activity ?? "")
  );

  const withStatus = await getOrder(order.id);
  check(
    "and the order carries the summary of it",
    withStatus?.shipment_status === "delivered",
    String(withStatus?.shipment_status)
  );
  check(
    "and when the parcel went out",
    Boolean(withStatus?.shipment_date)
  );
  check(
    "and when it is expected",
    Boolean(withStatus?.estimated_delivery)
  );
  check(
    "and where the customer can follow it",
    Boolean(withStatus?.tracking_url)
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("5. The journey is written down once");

  const before = await eventCount(order.id);
  await refreshShipmentTracking({ orderId: order.id });
  await refreshShipmentTracking({ orderId: order.id });
  const after = await eventCount(order.id);
  check(
    "asking again does not write the same events twice",
    after === before,
    `${before} → ${after}`
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("6. The courier's webhook — its security");

  const noKey = await deliver({ awb: order.awb, current_status: "Delivered" }, { key: null });
  check("a delivery with no key is refused", noKey.status === 401, String(noKey.status));

  const wrongKey = await deliver(
    { awb: order.awb, current_status: "Delivered" },
    { key: "not-the-secret" }
  );
  check("a delivery with the wrong key is refused", wrongKey.status === 401, String(wrongKey.status));

  const nearMiss = await deliver(
    { awb: order.awb, current_status: "Delivered" },
    { key: WEBHOOK_SECRET.slice(0, -1) }
  );
  check("a key that is almost right is refused", nearMiss.status === 401, String(nearMiss.status));

  const notJson = await deliver("this is not json", { key: WEBHOOK_SECRET });
  check("a delivery that cannot be read is refused", notJson.status === 400, String(notJson.status));

  const refusedBody = JSON.stringify(noKey.body ?? {});
  check(
    "and the refusal does not give the secret away",
    !refusedBody.includes(WEBHOOK_SECRET)
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("7. The courier's webhook — a delivery that arrives twice");

  const webhookOrder = await makeOrder({ courier: "Delhivery" });
  giveTheCourier(webhookOrder.awb, {
    currentStatus: "Out for Delivery",
    events: [
      {
        date: "2026-07-19 08:57:00",
        status: "OFD",
        activity: "Out for Delivery",
        location: "LUDHIANA, PUNJAB",
        srStatus: "17",
        label: "OUT FOR DELIVERY",
      },
    ],
  });

  const delivery = {
    awb: webhookOrder.awb,
    current_status: "Out for Delivery",
    current_status_code: "OFD",
    shipment_status: "17",
    shipment_track: [
      {
        date: "2026-07-19 08:57:00",
        status: "OFD",
        activity: "Out for Delivery",
        location: "LUDHIANA, PUNJAB",
        "sr-status": "17",
        "sr-status-label": "OUT FOR DELIVERY",
      },
    ],
  };

  const firstDelivery = await deliver(delivery, { eventId: "courier-delivery-1" });
  check("the delivery is accepted", firstDelivery.status === 200, String(firstDelivery.status));
  check(
    "and it is acted on",
    firstDelivery.body?.outcome === "applied",
    String(firstDelivery.body?.outcome)
  );

  const webhookShipment = await getShipmentForOrder(webhookOrder.id);
  check(
    "the parcel is on file",
    webhookShipment !== null
  );
  check(
    "and it is where the courier said it was",
    webhookShipment?.status === "out_for_delivery",
    String(webhookShipment?.status)
  );
  check(
    "and it came from the webhook",
    webhookShipment?.source === "webhook",
    String(webhookShipment?.source)
  );

  const eventsAfterFirst = await eventCount(webhookOrder.id);
  check("the journey was written down", eventsAfterFirst === 1, String(eventsAfterFirst));

  const secondDelivery = await deliver(delivery, { eventId: "courier-delivery-1" });
  check("the same delivery again is accepted", secondDelivery.status === 200, String(secondDelivery.status));
  check(
    "and is not acted on a second time",
    secondDelivery.body?.outcome === "already_applied",
    String(secondDelivery.body?.outcome)
  );
  check(
    "and no event is written twice",
    (await eventCount(webhookOrder.id)) === eventsAfterFirst
  );

  // The same news, delivered under a different delivery id. The event
  // itself is the same, so it is still one event.
  const thirdDelivery = await deliver(delivery, { eventId: "courier-delivery-2" });
  check("the same news under another delivery id is accepted", thirdDelivery.status === 200);
  check(
    "and is still one event",
    (await eventCount(webhookOrder.id)) === eventsAfterFirst,
    String(await eventCount(webhookOrder.id))
  );

  const claimed = await getDb()
    .prepare("SELECT event_id, outcome FROM courier_webhook_events ORDER BY received_at")
    .all();
  check("the deliveries are on file", claimed.length >= 2, `${claimed.length} deliveries`);
  check(
    "and what became of each is on file",
    claimed.every((row) => Boolean(row.outcome))
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("8. A delivery about a parcel the shop does not know");

  const unknown = await deliver(
    { awb: "000000000000", current_status: "Delivered" },
    { eventId: "courier-delivery-unknown" }
  );
  check("it is accepted", unknown.status === 200, String(unknown.status));
  check(
    "and nothing is done about it",
    unknown.body?.outcome === "unmatched",
    String(unknown.body?.outcome)
  );

  const noAwb = await deliver({ status: "something" }, { eventId: "courier-delivery-empty" });
  check("a delivery with no tracking number is accepted", noAwb.status === 200);
  check(
    "and is ignored",
    noAwb.body?.outcome === "ignored",
    String(noAwb.body?.outcome)
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("9. Customer ownership");

  const stampEmail = (who) =>
    `courier-${who}-${stamp.toLowerCase()}@example.invalid`;

  const customerA = await createUser(
    "Courier Check A",
    stampEmail("a"),
    "courier-check-password",
    "member"
  );
  createdUsers.push(customerA.id);

  const customerB = await createUser(
    "Courier Check B",
    stampEmail("b"),
    "courier-check-password",
    "member"
  );
  createdUsers.push(customerB.id);

  const ownedByA = await makeOrder({ userId: customerA.id });
  const ownedByB = await makeOrder({ userId: customerB.id });

  giveTheCourier(ownedByA.awb);
  await refreshShipmentTracking({ orderId: ownedByA.id });

  /**
   * A signed-in session, and the cookie that carries it.
   */
  async function signIn(userId) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 3600_000;
    await getDb()
      .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)")
      .run(token, userId, new Date(expiresAt).toISOString());
    createdSessions.push(token);
    process.env.PF_TEST_COOKIE = `pf_auth=${signSession(token, userId, expiresAt)}`;
  }

  await signIn(customerA.id);
  const aOwn = await accountOrders();
  const aBody = await aOwn.json();
  const aIds = (aBody.orders ?? []).map((o) => o.id);
  check("the customer sees their own orders", aIds.includes(ownedByA.id), aIds.join(", "));
  check(
    "and nobody else's",
    !aIds.includes(ownedByB.id),
    aIds.join(", ")
  );

  const aOrder = (aBody.orders ?? []).find((o) => o.id === ownedByA.id);
  check(
    "and their own parcel is in it",
    aOrder?.shipment_status === "delivered",
    String(aOrder?.shipment_status)
  );

  // The order page is the one a customer opens. Another customer's order
  // is not theirs, and the page says so by not being there.
  check(
    "and another customer's order page is not there",
    !maySeeOrder(customerA, { user_id: ownedByB.id })
  );
  check(
    "and their own order page is",
    maySeeOrder(customerA, { user_id: ownedByA.userId })
  );
  check(
    "and somebody in the back office may open either",
    maySeeOrder({ id: customerA.id, role: "admin" }, { user_id: ownedByB.id })
  );
  check(
    "but another customer may not",
    !maySeeOrder(customerB, { user_id: ownedByA.id })
  );
  check(
    "and a guest with the order's id may open it",
    maySeeOrder(null, { user_id: ownedByA.userId })
  );

  await signIn(customerB.id);
  const bOwn = await accountOrders();
  const bBody = await bOwn.json();
  const bIds = (bBody.orders ?? []).map((o) => o.id);
  check("the other customer sees their own orders", bIds.includes(ownedByB.id));
  check("and not the first customer's", !bIds.includes(ownedByA.id));

  delete process.env.PF_TEST_COOKIE;

  /* ─────────────────────────────────────────────────────────────── */
  section("10. A courier that cannot answer");

  const silent = await makeOrder({ courier: "Blue Dart" });
  giveTheCourier(silent.awb);
  mock.settings.failTracking = true;
  const broken = await refreshShipmentTracking({ orderId: silent.id });
  mock.settings.failTracking = false;
  check("the refresh is refused", !broken.ok);
  check(
    "and it says what happened",
    /could not|answered|not able/i.test(broken.message ?? ""),
    broken.message
  );
  check(
    "and nothing was written down",
    (await getShipmentForOrder(silent.id)) === null
  );
  const silentOrder = await getOrder(silent.id);
  check(
    "and the order was not touched",
    silentOrder?.shipment_status === null
  );

  const unknownAwb = await makeOrder({ courier: "Delhivery" });
  const noSuch = await refreshShipmentTracking({ orderId: unknownAwb.id });
  check("a tracking number the courier does not know is refused", !noSuch.ok);
  check(
    "and it says the courier does not know it",
    /does not know/i.test(noSuch.message ?? ""),
    noSuch.message
  );

  const noTracking = await makeOrder({ courier: "Delhivery" });
  await getDb()
    .prepare("UPDATE orders SET tracking_id = NULL, awb_key = NULL WHERE id = ?")
    .run(noTracking.id);
  const nothing = await refreshShipmentTracking({ orderId: noTracking.id });
  check("an order with no tracking number is refused", !nothing.ok);
  check(
    "and it says there is nothing to look up",
    /no tracking number/i.test(nothing.message ?? ""),
    nothing.message
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("11. The courier's words, read");

  check(
    "a delivered parcel says so",
    shipmentStatusFromCourier({ code: "DLVD", label: "DELIVERED" }) === "delivered"
  );
  check(
    "and one that is out for delivery",
    shipmentStatusFromCourier({ code: "OFD", label: "OUT FOR DELIVERY" }) ===
      "out_for_delivery"
  );
  check(
    "and one that is in transit",
    shipmentStatusFromCourier({ code: "IT", label: "IN TRANSIT" }) === "in_transit"
  );
  check(
    "and one that was picked up",
    shipmentStatusFromCourier({ code: "PKD", label: "PICKED" }) === "picked_up"
  );
  check(
    "and one that could not be delivered",
    shipmentStatusFromCourier({ code: "NDR", label: "NOT DELIVERED" }) === "exception"
  );
  check(
    "and one that was called off",
    shipmentStatusFromCourier({ code: "CN", label: "CANCELLED" }) === "cancelled"
  );
  check(
    "and one the shop knows nothing about",
    shipmentStatusFromCourier({}) === "unknown"
  );
  check(
    "and a delivered parcel is not read as out for delivery",
    shipmentStatusFromCourier({ code: "DLVD", label: "DELIVERED" }) !==
      "out_for_delivery"
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");

  const db = getDb();
  await withTransaction(async (tx) => {
    for (const orderId of createdOrders) {
      await tx
        .prepare("DELETE FROM shipment_tracking_events WHERE order_id = ?")
        .run(orderId);
      await tx.prepare("DELETE FROM order_shipments WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM notifications WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
    for (const awb of createdAwbs) {
      await tx.prepare("DELETE FROM courier_webhook_events WHERE awb = ?").run(awb);
    }
    await tx
      .prepare("DELETE FROM courier_webhook_events WHERE event_id LIKE '%courier-delivery-%'")
      .run();
    for (const token of createdSessions) {
      await tx.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    for (const userId of createdUsers) {
      await tx.prepare("DELETE FROM users WHERE id = ?").run(userId);
    }
  });

  console.log("  ✓ the fixtures this run made were removed");
  await mock.close();
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log(
    "✓ ALL CHECKS PASSED — the courier's tracking and its webhook work end to end."
  );
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
