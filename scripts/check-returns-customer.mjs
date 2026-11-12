/**
 * Looks at the customer's own pages of the returns system.
 *
 *   node scripts/check-returns-customer.mjs
 *
 * It signs in as a customer who has a claim, and checks that the
 * request form shows what it should, that the customer's dashboard
 * shows their request and its timeline, and that they cannot reach
 * anybody else's.
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";
import { shopDb } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9263;

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();
const pool = shopDb();

const { rows: users } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Customer Test', $1, 'x', 'member') RETURNING id, email`,
  [`returns-cust-${stamp}@example.com`]
);
const customer = users[0];

// A session for them.
const token = randomBytes(32).toString("hex");
await pool.query(
  "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
  [token, customer.id, new Date(Date.now() + 3600_000).toISOString()]
);

const { rows: products } = await pool.query(
  `SELECT p.slug, p.name, p.price FROM products p
    WHERE p.listed = 1 AND p.status = 'published' ORDER BY p.slug LIMIT 1`
);
const product = products[0];

const orderId = `CUS${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO orders
     (id, user_id, name, email, phone, address1, city, state, pincode,
      subtotal, shipping, total, payment_method, status, delivered_at)
   VALUES ($1, $2, 'Customer Test', $3, '+91 90000 00000', '1 Test Street',
           'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'Test Payment', 'delivered', $5)`,
  [
    orderId,
    customer.id,
    customer.email,
    product.price,
    new Date().toISOString(),
  ]
);
await pool.query(
  `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
   VALUES ($1, $2, $3, $4, 1, 'settled', 0)`,
  [orderId, product.slug, product.name, product.price]
);

const returnId = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO return_requests
     (id, order_id, user_id, type, status, reason, customer_notes, customer_name,
      customer_email, customer_phone, delivery_date, serial_number, refund_amount, refund_status)
   VALUES ($1, $2, $3, 'replacement', 'requested', 'product_damaged',
           'The console arrived with a cracked corner and will not power on.',
           'Customer Test', $4, '+91 90000 00000', $5, 'SN-CUST-1', $6, 'none')`,
  [
    returnId,
    orderId,
    customer.id,
    customer.email,
    new Date().toISOString().slice(0, 10),
    product.price,
  ]
);
await pool.query(
  `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
   VALUES ($1, (SELECT id FROM order_items WHERE order_id = $2), $3, $4, $5, 1)`,
  [returnId, orderId, product.slug, product.name, product.price]
);
await pool.query(
  `INSERT INTO return_images (return_id, path, kind, evidence_kind, stored_name, mime_type, size_bytes, original_name, version, superseded)
   VALUES ($1, '/uploads/returns/' || $1 || '/photo.jpg', 'photo', 'product',
           'photo.jpg', 'image/jpeg', 12, 'fault.jpg', 1, 0)`,
  [returnId]
);

// A second order, with no claim on it, so the form is there to be
// looked at.
const orderId2 = `CUS${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO orders
     (id, user_id, name, email, phone, address1, city, state, pincode,
      subtotal, shipping, total, payment_method, status, delivered_at)
   VALUES ($1, $2, 'Customer Test', $3, '+91 90000 00000', '1 Test Street',
           'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'Test Payment', 'delivered', $5)`,
  [
    orderId2,
    customer.id,
    customer.email,
    product.price,
    new Date().toISOString(),
  ]
);
await pool.query(
  `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
   VALUES ($1, $2, $3, $4, 1, 'settled', 0)`,
  [orderId2, product.slug, product.name, product.price]
);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-returnscust-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: token,
    domain: "localhost",
    path: "/",
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  section("1. The customer's dashboard");
  await cdp.goto(`${BASE}/account/returns`);
  await sleep(3000);

  const listText = await cdp.evaluate("document.body.innerText.slice(0, 4000)");
  check("the page has a heading", /My Returns/.test(listText));
  check("it shows the request", listText.includes(returnId));
  check("it shows the order", listText.includes(orderId));
  check("it shows the status", /Request Submitted/.test(listText));
  check(
    "it does not show the shop's private notes",
    !/Store Remarks/.test(listText)
  );

  section("2. The request itself");
  await cdp.goto(`${BASE}/account/returns/${returnId}`);
  await sleep(3000);

  const detailText = await cdp.evaluate("document.body.innerText.slice(0, 8000)");
  check("it shows the request id", detailText.includes(returnId));
  check("it shows the timeline", /Request Timeline/.test(detailText));
  check("it shows the stage", /Current stage/.test(detailText));
  check("it shows the written explanation", /cracked corner/.test(detailText));
  check("it shows the date of delivery", /Date of delivery/.test(detailText));
  check("it shows the serial number", /SN-CUST-1/.test(detailText));
  check("it shows their evidence", /Your Evidence \(1\)/.test(detailText));
  check("it shows the history", /Request Activity/.test(detailText));

  const evidenceImages = await cdp.evaluate(
    "document.querySelectorAll('img[src*=\"/evidence/\"]').length"
  );
  check("their evidence is shown", evidenceImages >= 1, `${evidenceImages} images`);

  const hasAddEvidence = await cdp.evaluate(
    "document.body.innerText.includes('Add more evidence')"
  );
  check("they can add more evidence while the case is open", hasAddEvidence);

  section("3. The notifications");
  await cdp.goto(`${BASE}/account/notifications`);
  await sleep(2500);
  const notificationsText = await cdp.evaluate(
    "document.body.innerText.slice(0, 3000)"
  );
  check("the page has a heading", /Notifications/.test(notificationsText));

  section("4. The request form");
  await cdp.goto(`${BASE}/order/${orderId2}/return`);
  await sleep(3000);

  const formText = await cdp.evaluate("document.body.innerText.slice(0, 6000)");
  check("the form is there", /What is wrong/.test(formText));
  check("it shows the order id", formText.includes(orderId2));
  check("it asks for the reason", /Reason for request/.test(formText));
  check("it asks for the description", /Description of the problem/.test(formText));
  check("it asks for the delivery date", /Date of delivery/.test(formText));
  check("it asks for the contact details", /How we reach you/.test(formText));
  check("it asks for the evidence", /Send us the evidence/.test(formText));
  check(
    "it explains the unboxing video is recommended, not required",
    /never turned away only because/i.test(formText)
  );

  const fileInput = await cdp.evaluate(
    "(() => { const i = document.querySelector('input[type=file]'); return i ? { accept: i.accept, multiple: i.multiple } : null; })()"
  );
  check("it takes several files at once", fileInput?.multiple === true);
  check(
    "it only accepts photographs and videos",
    fileInput?.accept?.includes("image/jpeg") && fileInput?.accept?.includes("video/mp4"),
    fileInput?.accept
  );

  section("5. They cannot reach the back office");
  await cdp.goto(`${BASE}/admin/returns`);
  await sleep(2500);
  const adminText = await cdp.evaluate("document.body.innerText.slice(0, 2000)");
  check(
    "the back office turns them away",
    /Back office|denied|not allowed|Account|sign in/i.test(adminText) &&
      !adminText.includes("Total requests"),
    adminText.slice(0, 80).replace(/\n/g, " ")
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  chrome?.kill();
  await sleep(300);

  await pool.query("DELETE FROM return_events WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_images WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM notifications WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_items WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_requests WHERE id = $1", [returnId]);
  for (const id of [orderId, orderId2]) {
    await pool.query("DELETE FROM order_items WHERE order_id = $1", [id]);
    await pool.query("DELETE FROM orders WHERE id = $1", [id]);
  }
  await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [customer.id]);
  await pool.query("DELETE FROM users WHERE id = $1", [customer.id]);
  await pool.end();
  console.log("\n— the fixtures this run made were removed —");
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the customer's pages are there and show what they should.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
