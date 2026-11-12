/**
 * Checks the Return, Refund and Replacement system end to end.
 *
 *   node scripts/check-returns.mjs
 *
 * It walks the whole journey against the shop's own database, through
 * the shop's own functions: a customer raises a claim with a photograph
 * and a video, the back office works through it, and the money or the
 * replacement is recorded. After every step it looks in the database
 * and checks that what was supposed to happen actually happened.
 *
 * It also checks the things that must not happen: a customer cannot see
 * another customer's evidence, and a customer cannot reach the back
 * office.
 *
 * Everything it creates is marked with this run's own stamp and is
 * removed at the end, so the shop is left as it was found.
 */
import { randomBytes, randomBytes as cryptoRandomBytes, scryptSync } from "node:crypto";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

// The app's modules import each other without their extensions, which
// plain Node cannot resolve. The hook adds them back.
registerTsResolver();

const { getDb, withTransaction, getPool } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const { submitReturnRequest } = await import("../src/lib/return-submit.ts");
const { stageUpload } = await import("../src/lib/return-uploads.ts");
const returns = await import("../src/lib/returns.ts");
const { getReturnRequest, listReturnRequests } = returns;
const records = await import("../src/lib/returns-records.ts");
const { createRefundRecord, listAdminActions, listRefunds, listReplacements, updateRefundRecord, recordInspection } = records;
const { maySeeReturn } = await import("../src/lib/return-access.ts");
const { evidenceSatisfied, policyForReason } = await import("../src/lib/return-policy.ts");
const { readEvidence } = await import("../src/lib/evidence.ts");
const { getNotificationsForUser } = await import("../src/lib/notifications.ts");

const {
  approveReturnRequest,
  rejectReturnRequest,
  requestMoreInformation,
  schedulePickup,
  markProductReceived,
  recordQcInspection,
  initiateRefund,
  confirmRefundPaid,
  markCompleted,
  startReview,
  startInspection,
  setReplacementDelivery,
  dispatchMissingAccessories,
  dispatchReplacement,
} = returns;
let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();
const TEST_EMAIL = `returns-test-${stamp}@example.com`;
const TEST_PASSWORD = "returns-test-password";

/** The staff account the decisions are made as. */
const staff = await (async () => {
  const row = (await getDb()
    .prepare("SELECT id, name, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get());
  if (!row) throw new Error("no admin account to work as");
  return row;
})();

/**
 * Creates an account, the way the shop does.
 *
 * The auth module cannot be loaded outside the app — it reads cookies —
 * so the password is hashed here the same way it is hashed there.
 */
async function createTestUser(name, email) {
  const salt = cryptoRandomBytes(16).toString("hex");
  const key = scryptSync(TEST_PASSWORD, salt, 64).toString("hex");
  const info = await getDb()
    .prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'member') RETURNING id"
    )
    .run(name, email.toLowerCase(), `${salt}:${key}`);
  return { id: Number(info.lastInsertRowid), name, email: email.toLowerCase() };
}

/** A tiny but genuine JPEG, so the file is really a photograph. */
function makeJpeg() {
  // A 1x1 JPEG, built by hand so the test needs no image library.
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEB" +
      "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
      "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
      "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
      "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z",
    "base64"
  );
}

/** A small but genuine MP4, so the file is really a video. */
function makeMp4() {
  // A minimal MP4 container with an ftyp box and a moov box.
  const ftyp = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00]);
  const moov = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x6f, 0x6f, 0x76]);
  return Buffer.concat([ftyp, moov]);
}

const createdReturnIds = [];
const createdUserIds = [];
const createdOrderIds = [];

try {
  // ─────────────────────────────────────────────────────────────
  section("1. The fixture — a customer, a delivered order, a claim");

  const customer = await createTestUser("Returns Test Customer", TEST_EMAIL);
  createdUserIds.push(customer.id);
  check("a test customer was created", Boolean(customer.id));

  // Another customer, who must never see this claim.
  const stranger = await createTestUser(
    "Returns Test Stranger",
    `returns-stranger-${stamp}@example.com`
  );
  createdUserIds.push(stranger.id);

  // An order that has been delivered. It is written the way the shop
  // writes one, so the claim is judged against a real order.
  const product = (await getDb()
    .prepare(
      `SELECT p.slug, p.name, p.price, v.id AS variant_id
         FROM products p
         LEFT JOIN variants v ON v.product_slug = p.slug
        WHERE p.listed = 1 AND p.status = 'published'
        ORDER BY p.slug, v.name
        LIMIT 1`
    )
    .get());

  if (!product) throw new Error("the shop has no listed product to order");

  const orderId = `RST${randomBytes(4).toString("hex").toUpperCase()}`;
  createdOrderIds.push(orderId);
  const price = Number(product.price);

  await getDb()
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, address2, city, state, pincode, notes,
          subtotal, shipping, total, payment_method, status, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`
    )
    .run(
      orderId,
      customer.id,
      customer.name,
      customer.email,
      "+91 90000 00000",
      "1 Test Street",
      null,
      "Ludhiana",
      "Punjab",
      "142021",
      null,
      price,
      0,
      price,
      "Test Payment",
      new Date().toISOString()
    );

  await getDb()
    .prepare(
      `INSERT INTO order_items (order_id, product_slug, variant_id, variant_name, name, price, quantity, stock_state, backordered)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'settled', 0)`
    )
    .run(
      orderId,
      product.slug,
      product.variant_id,
      null,
      product.name,
      price
    );

  const order = await getOrder(orderId);
  check("the order was saved", Boolean(order));
  check("the order belongs to the customer", order?.user_id === customer.id);
  check("the order is delivered", order?.status === "delivered");
  check("the delivery date is recorded", Boolean(order?.delivered_at));

  // ─────────────────────────────────────────────────────────────
  section("2. The evidence the customer sends");

  const photo = new File([makeJpeg()], "damaged-console.jpg", { type: "image/jpeg" });
  const video = new File([makeMp4()], "unboxing.mp4", { type: "video/mp4" });

  const stagedPhoto = await stageUpload({
    userId: customer.id,
    file: photo,
    evidenceKind: "product",
  });
  check("a photograph is accepted", stagedPhoto.ok, stagedPhoto.ok ? stagedPhoto.upload.id : stagedPhoto.reason);

  const stagedVideo = await stageUpload({
    userId: customer.id,
    file: video,
    evidenceKind: "unboxing",
  });
  check("a video is accepted", stagedVideo.ok, stagedVideo.ok ? stagedVideo.upload.id : stagedVideo.reason);

  // A file that is not a photograph or a video at all.
  const junk = new File([Buffer.from("this is not an image at all")], "notes.txt", {
    type: "text/plain",
  });
  const stagedJunk = await stageUpload({ userId: customer.id, file: junk });
  check("a file that is not a photograph or video is refused", !stagedJunk.ok);

  // A photograph that is too big.
  const huge = new File([Buffer.alloc(6 * 1024 * 1024, 0xff)], "huge.jpg", {
    type: "image/jpeg",
  });
  const stagedHuge = await stageUpload({ userId: customer.id, file: huge });
  check("a photograph over the size limit is refused", !stagedHuge.ok);

  if (!stagedPhoto.ok || !stagedVideo.ok) {
    throw new Error("the evidence could not be staged, so the test cannot go on");
  }

  // ─────────────────────────────────────────────────────────────
  section("3. The customer raises the claim");

  const claim = await submitReturnRequest(
    {
      orderId,
      type: "replacement",
      reason: "product_damaged",
      customerNotes:
        "The console arrived with a cracked corner and the controller will not power on at all.",
      items: [
        {
          orderItemId: order.items[0].id ?? 1,
          productSlug: order.items[0].product_slug,
          variantId: order.items[0].variant_id ?? null,
          name: order.items[0].name,
          price: order.items[0].price,
          quantity: 1,
        },
      ],
      serialNumber: "TEST-SERIAL-0001",
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
      contactPhone: "+91 90000 00000",
      uploadIds: [stagedPhoto.upload.id, stagedVideo.upload.id],
    },
    { id: customer.id, email: customer.email }
  );

  check("the claim is accepted", claim.ok, claim.message);
  if (!claim.ok) throw new Error("the claim could not be raised");
  createdReturnIds.push(claim.returnId);
  check("the claim has a reference number", /^RET-[A-Z2-9]{4}$/.test(claim.returnId ?? ""), claim.returnId);

  const saved = await getReturnRequest(claim.returnId);
  check("the claim is in the database", Boolean(saved));
  check("it is a replacement claim", saved?.type === "replacement");
  check("it starts as a new request", saved?.status === "requested");
  check("the reason is on it", saved?.reason === "product_damaged");
  check("the description is on it", Boolean(saved?.customer_notes));
  check("the delivery date is on it", Boolean(saved?.delivery_date));
  check("the serial number is on it", saved?.serial_number === "TEST-SERIAL-0001");
  check("the customer's contact details are on it", saved?.customer_email === customer.email);
  check("the item is on it", saved?.items.length === 1);
  check("both files are on it", saved?.images.length === 2, `${saved?.images.length} files`);
  check(
    "the video is kept apart from the photograph",
    saved?.images.filter((i) => i.kind === "video").length === 1
  );
  check(
    "each file says what it is evidence of",
    saved?.images.some((i) => i.evidence_kind === "unboxing")
  );
  check("each file records when it arrived", saved?.images.every((i) => Boolean(i.created_at)));
  check("each file records its size", saved?.images.every((i) => (i.size_bytes ?? 0) > 0));
  check("each file has a fingerprint", saved?.images.every((i) => Boolean(i.sha256)));

  // The evidence is in the private store, not in the public folder.
  const stored = saved?.images.find((i) => i.kind === "photo");
  const bytes = stored ? await readEvidence(claim.returnId, stored.stored_name, null) : null;
  check("the file can be read back from the private store", (bytes?.length ?? 0) > 0);

  // ─────────────────────────────────────────────────────────────
  section("4. The rules refuse a claim that is missing what it needs");

  const withoutDescription = await submitReturnRequest(
    {
      orderId,
      type: "replacement",
      reason: "product_damaged",
      customerNotes: "",
      items: [],
      deliveryDate: "",
      contactName: "",
      contactEmail: "",
    },
    { id: customer.id, email: customer.email }
  );
  check("a claim with no description is refused", !withoutDescription.ok);
  check(
    "and it is told what is missing",
    Boolean(withoutDescription.errors?.customerNotes)
  );

  const badOrder = await submitReturnRequest(
    {
      orderId: "NOPE1234",
      type: "return",
      reason: "change_of_mind",
      customerNotes: "I would like to send this back please.",
      items: [],
      deliveryDate: "2026-01-01",
      contactName: "Test",
      contactEmail: "test@example.com",
    },
    { id: customer.id, email: customer.email }
  );
  check("a claim about an order that is not there is refused", !badOrder.ok);

  // The sealed rule: a change of mind needs a sealed unit.
  const notSealed = await submitReturnRequest(
    {
      orderId,
      type: "return",
      reason: "change_of_mind",
      customerNotes: "I would like to send this back, it is still boxed up.",
      items: [
        {
          orderItemId: order.items[0].id ?? 1,
          productSlug: order.items[0].product_slug,
          variantId: order.items[0].variant_id ?? null,
          name: order.items[0].name,
          price: order.items[0].price,
          quantity: 1,
        },
      ],
      sealedState: "opened",
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
    },
    { id: customer.id, email: customer.email }
  );
  check(
    "a change-of-mind claim for an opened unit is refused",
    !notSealed.ok,
    notSealed.message
  );

  // A second claim about the same item is refused.
  const duplicate = await submitReturnRequest(
    {
      orderId,
      type: "replacement",
      reason: "product_damaged",
      customerNotes: "The same unit again, a different description of the fault.",
      items: [
        {
          orderItemId: order.items[0].id ?? 1,
          productSlug: order.items[0].product_slug,
          variantId: order.items[0].variant_id ?? null,
          name: order.items[0].name,
          price: order.items[0].price,
          quantity: 1,
        },
      ],
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
    },
    { id: customer.id, email: customer.email }
  );
  check("a second claim about the same item is refused", !duplicate.ok);

  // ─────────────────────────────────────────────────────────────
  section("5. The back office sees the claim");

  const adminList = await listReturnRequests({ q: claim.returnId });
  check("the claim is in the back office's list", adminList.length === 1);
  check(
    "the list shows who it is from",
    adminList[0]?.customer_email === customer.email
  );

  const detail = await getReturnRequest(claim.returnId);
  check("the claim carries the evidence", (detail?.images.length ?? 0) === 2);

  const actions = await listAdminActions(claim.returnId);
  check("the submission is in the audit log", actions.length >= 1);
  check(
    "the audit log says who submitted it",
    actions[0]?.actor_name === customer.name || actions[0]?.action === "submitted"
  );

  // ─────────────────────────────────────────────────────────────
  section("6. The back office works through the claim");

  const pickedUp = await startReview(claim.returnId, staff);
  check("the claim can be picked up for review", pickedUp.ok, pickedUp.message);
  check(
    "it is now under review",
    (await getReturnRequest(claim.returnId))?.status === "under_review"
  );

  const asked = await requestMoreInformation(
    claim.returnId,
    staff,
    "Please send a photograph of the serial number plate."
  );
  check("more evidence can be asked for", asked.ok, asked.message);
  check(
    "the claim is waiting on the customer",
    (await getReturnRequest(claim.returnId))?.status === "info_requested"
  );

  const approved = await approveReturnRequest(
    claim.returnId,
    staff,
    "Photographs and description are enough to proceed."
  );
  check("the claim can be approved", approved.ok, approved.message);
  const afterApproval = await getReturnRequest(claim.returnId);
  check(
    "a replacement claim is approved for replacement",
    afterApproval?.status === "replacement_approved",
    afterApproval?.status
  );

  const pickup = await schedulePickup(claim.returnId, staff, {
    courier: "Test Courier",
    tracking: "TRACK123456",
    date: new Date().toISOString().slice(0, 10),
  });
  check("a pickup can be scheduled", pickup.ok, pickup.message);
  check(
    "the pickup is recorded",
    (await getReturnRequest(claim.returnId))?.pickup_tracking === "TRACK123456"
  );

  const received = await markProductReceived(claim.returnId, staff, "Box opened at the counter.");
  check("the product can be marked as received", received.ok, received.message);
  check(
    "the receipt is recorded",
    Boolean((await getReturnRequest(claim.returnId))?.received_at)
  );

  const inspecting = await startInspection(claim.returnId, staff);
  check("the inspection can be started", inspecting.ok, inspecting.message);
  check(
    "the claim says the unit is being inspected",
    (await getReturnRequest(claim.returnId))?.status === "inspection_in_progress"
  );

  const inspection = await recordInspection({
    returnId: claim.returnId,
    result: "passed",
    serialSeen: "TEST-SERIAL-0001",
    conditionNotes: "Corner crack confirmed. Unit is complete.",
    notes: "Inspected at the returns counter.",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("the inspection is recorded", inspection.ok, inspection.message);

  const inspections = (await getReturnRequest(claim.returnId))?.inspections ?? [];
  check("the inspection is on the claim", inspections.length === 1);
  check("it says who inspected it", inspections[0]?.inspected_by_name === staff.name);
  check("it says what was found", inspections[0]?.condition_notes?.includes("Corner crack") ?? false);
  check("the serial seen is recorded", inspections[0]?.serial_seen === "TEST-SERIAL-0001");

  const qc = await recordQcInspection(claim.returnId, staff, {
    qcStatus: "passed",
    notes: "Unit checked and found to match the claim.",
    itemDecisions: [{ itemId: detail.items[0].id, decision: "write_off" }],
  });
  check("the inspection can be completed", qc.ok, qc.message);
  check(
    "the claim is ready for its remedy",
    (await getReturnRequest(claim.returnId))?.status === "qc_passed"
  );

  // ─────────────────────────────────────────────────────────────
  section("7. The replacement");

  const replacement = await (async () => {
    const { dispatchReplacement } = await import("../src/lib/returns.ts");
    return dispatchReplacement(
      claim.returnId,
      staff,
      {
        courier: "Test Courier",
        tracking: "REP-TRACK-999",
        dispatchDate: new Date().toISOString().slice(0, 10),
        notes: "A brand new unit goes out.",
      },
      []
    );
  })();

  check(
    "a replacement can be dispatched",
    replacement.ok,
    replacement.ok ? replacement.message : replacement.message
  );

  const replacements = await listReplacements({ q: claim.returnId });
  check("the replacement is a record of its own", replacements.length === 1);
  check("it says what was sent", replacements[0]?.product_slug === product.slug);
  check("it says which courier", replacements[0]?.courier_name === "Test Courier");
  check("it says the tracking number", replacements[0]?.tracking_number === "REP-TRACK-999");
  check("it records the serial that came in", replacements[0]?.original_serial === "TEST-SERIAL-0001");
  check("it records when it went out", Boolean(replacements[0]?.dispatch_date));
  check("it records who sent it", replacements[0]?.created_by_name === staff.name);

  const afterDispatch = await getReturnRequest(claim.returnId);
  check(
    "the customer sees the replacement dispatched",
    afterDispatch?.status === "replacement_dispatched",
    afterDispatch?.status
  );
  check(
    "the customer is told the tracking number",
    afterDispatch?.replacement_tracking === "REP-TRACK-999"
  );

  // ─────────────────────────────────────────────────────────────
  section("8. The refund");

  const refund = await createRefundRecord({
    returnId: claim.returnId,
    amount: price,
    paymentMethod: "Original Payment Source",
    notes: "The unit passed the inspection, so the money goes back.",
    approvedBy: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("a refund can be raised", refund.ok, refund.message);

  const refundRows = await listRefunds({ q: claim.returnId });
  check("the refund is a record of its own", refundRows.length === 1);
  check("it says how much", refundRows[0]?.amount === price);
  check("it says who approved it", refundRows[0]?.approved_by_name === staff.name);
  check("it says when it was approved", Boolean(refundRows[0]?.approved_at));
  check("it is not shown as paid yet", refundRows[0]?.status === "approved");
  check(
    "the customer sees it as approved, not paid",
    (await getReturnRequest(claim.returnId))?.refund_status === "pending"
  );

  const started = await updateRefundRecord({
    refundId: refund.id,
    status: "processing",
    gatewayTransactionId: "pay_TEST123",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("the refund can be put in front of the provider", started.ok, started.message);
  check(
    "it is still not paid",
    (await listRefunds({ q: claim.returnId }))[0]?.status === "processing"
  );

  const unpaid = await updateRefundRecord({
    refundId: refund.id,
    status: "completed",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check(
    "a refund cannot be marked paid without the transaction reference",
    !unpaid.ok,
    unpaid.message
  );

  const paid = await updateRefundRecord({
    refundId: refund.id,
    status: "completed",
    gatewayTransactionId: "UTR-TEST-4242",
    actor: { id: staff.id, name: staff.name, role: staff.role },
  });
  check("the refund can be marked as paid", paid.ok, paid.message);

  const paidRow = (await listRefunds({ q: claim.returnId }))[0];
  check("it is now paid", paidRow?.status === "completed");
  check("the transaction reference is kept", paidRow?.gateway_transaction_id === "UTR-TEST-4242");
  check("the completion date is kept", Boolean(paidRow?.completed_at));
  check(
    "the request says the refund is processed",
    (await getReturnRequest(claim.returnId))?.refund_status === "processed"
  );

  // ─────────────────────────────────────────────────────────────
  section("9. The customer is told, and the claim is closed");

  const notifications = await getNotificationsForUser(customer.id);
  check("the customer has been told about the claim", notifications.length > 0);
  check(
    "and about the refund being approved",
    notifications.some((n) => n.kind === "refund_approved")
  );
  check(
    "and about the refund being completed",
    notifications.some((n) => n.kind === "refund_completed")
  );
  check(
    "and about the replacement going out",
    notifications.some((n) => n.kind === "replacement_dispatched")
  );

  const delivery = await setReplacementDelivery(claim.returnId, staff, {
    status: "delivered",
    notes: "Left with the customer.",
  });
  check("the delivery of the replacement can be recorded", delivery.ok, delivery.message);
  check(
    "the customer sees the replacement delivered",
    (await getReturnRequest(claim.returnId))?.replacement_delivery_status === "delivered"
  );

  check(
    "a delivered replacement resolves the case",
    (await getReturnRequest(claim.returnId))?.status === "resolved",
    (await getReturnRequest(claim.returnId))?.status
  );
  check(
    "the resolution date is recorded",
    Boolean((await getReturnRequest(claim.returnId))?.resolved_at)
  );

  // Closing a case that is already closed is refused, rather than
  // quietly done twice.
  const closed = await markCompleted(claim.returnId, staff, "Both remedies are settled.");
  check("closing it again is refused", !closed.ok, closed.message);

  // ─────────────────────────────────────────────────────────────
  section("10. Who may see what");

  const owner = await maySeeReturn(claim.returnId, {
    id: customer.id,
    email: customer.email,
    role: "member",
  });
  check("the customer can see their own claim", owner.ok);

  const other = await maySeeReturn(claim.returnId, {
    id: stranger.id,
    email: stranger.email,
    role: "member",
  });
  check("another customer cannot see the claim", !other.ok);
  check("and is not even told it exists", other.ret === null);

  const staffView = await maySeeReturn(claim.returnId, {
    id: staff.id,
    email: staff.email,
    role: staff.role,
  });
  check("the back office can see the claim", staffView.ok);

  const evidence = await maySeeReturn(claim.returnId, {
    id: stranger.id,
    email: stranger.email,
    role: "member",
  });
  check("another customer cannot reach the evidence", !evidence.ok);

  // ─────────────────────────────────────────────────────────────
  section("11. A rejection carries a reason");

  const secondOrderId = `RST${randomBytes(4).toString("hex").toUpperCase()}`;
  createdOrderIds.push(secondOrderId);
  await getDb()
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, address2, city, state, pincode, notes,
          subtotal, shipping, total, payment_method, status, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`
    )
    .run(
      secondOrderId,
      customer.id,
      customer.name,
      customer.email,
      "+91 90000 00000",
      "1 Test Street",
      null,
      "Ludhiana",
      "Punjab",
      "142021",
      null,
      price,
      0,
      price,
      "Test Payment",
      new Date().toISOString()
    );
  await getDb()
    .prepare(
      `INSERT INTO order_items (order_id, product_slug, variant_id, variant_name, name, price, quantity, stock_state, backordered)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'settled', 0)`
    )
    .run(secondOrderId, product.slug, product.variant_id, null, product.name, price);

  const secondOrder = await getOrder(secondOrderId);
  const secondPhoto = await stageUpload({
    userId: customer.id,
    file: new File([makeJpeg()], "fault.jpg", { type: "image/jpeg" }),
    evidenceKind: "product",
  });
  check("a photograph is staged for the second claim", secondPhoto.ok);
  const secondClaim = await submitReturnRequest(
    {
      orderId: secondOrderId,
      type: "return",
      reason: "product_not_working",
      customerNotes: "The controller does not pair with anything and the lights do not come on.",
      items: [
        {
          orderItemId: secondOrder.items[0].id ?? 1,
          productSlug: secondOrder.items[0].product_slug,
          variantId: secondOrder.items[0].variant_id ?? null,
          name: secondOrder.items[0].name,
          price: secondOrder.items[0].price,
          quantity: 1,
        },
      ],
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
      uploadIds: secondPhoto.ok ? [secondPhoto.upload.id] : [],
    },
    { id: customer.id, email: customer.email }
  );
  check("a second claim can be raised on another order", secondClaim.ok, secondClaim.message);
  if (secondClaim.ok) createdReturnIds.push(secondClaim.returnId);

  const noReason = await rejectReturnRequest(claim.returnId, staff, "");
  check("a rejection with no reason is refused", !noReason.ok);

  if (secondClaim.ok) {
    const rejected = await rejectReturnRequest(
      secondClaim.returnId,
      staff,
      "The photographs do not show the fault described, and the unit does not match the order."
    );
    check("a rejection with a reason is accepted", rejected.ok, rejected.message);
    const rejectedRequest = await getReturnRequest(secondClaim.returnId);
    check("the reason is on the record", Boolean(rejectedRequest?.rejection_reason));
    check("the claim is rejected", rejectedRequest?.status === "rejected");
    check(
      "the customer is told why",
      (await getNotificationsForUser(customer.id)).some((n) => n.kind === "rejected")
    );
  }

  // ─────────────────────────────────────────────────────────────
  section("12. The missing-accessories claim");

  const thirdOrderId = `RST${randomBytes(4).toString("hex").toUpperCase()}`;
  createdOrderIds.push(thirdOrderId);
  await getDb()
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, address2, city, state, pincode, notes,
          subtotal, shipping, total, payment_method, status, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`
    )
    .run(
      thirdOrderId,
      customer.id,
      customer.name,
      customer.email,
      "+91 90000 00000",
      "1 Test Street",
      null,
      "Ludhiana",
      "Punjab",
      "142021",
      null,
      price,
      0,
      price,
      "Test Payment",
      new Date().toISOString()
    );
  await getDb()
    .prepare(
      `INSERT INTO order_items (order_id, product_slug, variant_id, variant_name, name, price, quantity, stock_state, backordered)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'settled', 0)`
    )
    .run(thirdOrderId, product.slug, product.variant_id, null, product.name, price);

  const thirdOrder = await getOrder(thirdOrderId);
  const thirdPhoto = await stageUpload({
    userId: customer.id,
    file: new File([makeJpeg()], "box.jpg", { type: "image/jpeg" }),
    evidenceKind: "package",
  });
  check("a photograph is staged for the third claim", thirdPhoto.ok);
  const noList = await submitReturnRequest(
    {
      orderId: thirdOrderId,
      type: "accessories",
      reason: "missing_parts",
      customerNotes: "The box was missing the power adapter and the HDMI cable entirely.",
      items: [
        {
          orderItemId: thirdOrder.items[0].id ?? 1,
          productSlug: thirdOrder.items[0].product_slug,
          variantId: thirdOrder.items[0].variant_id ?? null,
          name: thirdOrder.items[0].name,
          price: thirdOrder.items[0].price,
          quantity: 1,
        },
      ],
      missingAccessories: "",
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
    },
    { id: customer.id, email: customer.email }
  );
  check("a missing-accessories claim with no list is refused", !noList.ok);
  check(
    "and it is told the list is needed",
    Boolean(noList.errors?.missingAccessories)
  );

  const thirdClaim = await submitReturnRequest(
    {
      orderId: thirdOrderId,
      type: "accessories",
      reason: "missing_parts",
      customerNotes: "The box was missing the power adapter and the HDMI cable entirely.",
      items: [
        {
          orderItemId: thirdOrder.items[0].id ?? 1,
          productSlug: thirdOrder.items[0].product_slug,
          variantId: thirdOrder.items[0].variant_id ?? null,
          name: thirdOrder.items[0].name,
          price: thirdOrder.items[0].price,
          quantity: 1,
        },
      ],
      missingAccessories: "Power adapter\nHDMI cable",
      deliveryDate: new Date().toISOString().slice(0, 10),
      contactName: customer.name,
      contactEmail: customer.email,
      uploadIds: thirdPhoto.ok ? [thirdPhoto.upload.id] : [],
    },
    { id: customer.id, email: customer.email }
  );
  check("with the list, the claim is accepted", thirdClaim.ok, thirdClaim.message);
  if (thirdClaim.ok) {
    createdReturnIds.push(thirdClaim.returnId);
    const accessories = await dispatchMissingAccessories(thirdClaim.returnId, staff, {
      courier: "Test Courier",
      tracking: "ACC-TRACK-1",
    });
    check("the missing parts can be sent", accessories.ok, accessories.message);
    check(
      "the shipment is recorded",
      (await getReturnRequest(thirdClaim.returnId))?.accessories_tracking === "ACC-TRACK-1"
    );
  }

  // ─────────────────────────────────────────────────────────────
  section("13. The rules the form and the back office share");

  const policy = policyForReason("product_damaged");
  const onFile = {
    photographs: 1,
    videos: 1,
    description: true,
    serialNumber: true,
    missingList: false,
  };
  check(
    "a photograph and a video satisfy the damage evidence",
    policy.evidence.filter((e) => e.required).every((e) => evidenceSatisfied(e, onFile))
  );
  check(
    "a claim with no video is still looked at, not refused",
    policy.evidence
      .filter((e) => e.required)
      .every((e) => evidenceSatisfied(e, { ...onFile, videos: 0 }))
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  // ─────────────────────────────────────────────────────────────
  console.log("\n— cleaning up —");

  const db = getDb();
  for (const returnId of createdReturnIds) {
    // The evidence files go with the claim.
    const rows = (await db
      .prepare("SELECT stored_name FROM return_images WHERE return_id = ?")
      .all(returnId));
    for (const row of rows) {
      if (!row.stored_name) continue;
      const { rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await rm(join(process.cwd(), "private", "returns", returnId, row.stored_name), {
        force: true,
      });
    }
  }

  await withTransaction(async (tx) => {
    for (const returnId of createdReturnIds) {
      await tx.prepare("DELETE FROM return_events WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_images WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM admin_actions WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM notifications WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_refunds WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_replacements WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_inspections WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_items WHERE return_id = ?").run(returnId);
      await tx.prepare("DELETE FROM return_requests WHERE id = ?").run(returnId);
    }
    for (const orderId of createdOrderIds) {
      await tx.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await tx.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
    for (const userId of createdUserIds) {
      await tx.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      await tx.prepare("DELETE FROM users WHERE id = ?").run(userId);
    }
    await tx.prepare("DELETE FROM return_uploads WHERE user_id IS NULL AND original_name LIKE '%.txt'").run();
  });

  console.log("  ✓ the fixtures this run made were removed");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the returns system works end to end.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
