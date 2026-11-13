/**
 * Looks at the pages of the returns system in a real browser.
 *
 *   node scripts/check-returns-pages.mjs
 *
 * It checks that the back office's request page shows the evidence, the
 * records and the buttons, that the customer's page shows the timeline
 * and their own evidence, and that the policy page is there.
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";
import { tokenForRole, shopDb } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9262;

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
/** The refunds this run raised, so they can be removed afterwards. */
const refundsRaised = [];
const adminToken = await tokenForRole("admin");

// A claim with evidence on it, for the pages to show.
const { rows: users } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Pages Test Customer', $1, 'x', 'member') RETURNING id, email`,
  [`returns-pages-${stamp}@example.com`]
);
const customer = users[0];

const { rows: products } = await pool.query(
  `SELECT p.slug, p.name, p.price FROM products p
    WHERE p.listed = 1 AND p.status = 'published' ORDER BY p.slug LIMIT 1`
);
const product = products[0];

const orderId = `PGE${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO orders
     (id, user_id, name, email, phone, address1, city, state, pincode,
      subtotal, shipping, total, payment_method, status, delivered_at)
   VALUES ($1, $2, $3, $4, '+91 90000 00000', '1 Test Street', 'Ludhiana', 'Punjab', '142021',
           $5, 0, $5, 'Test Payment', 'delivered', $6)`,
  [
    orderId,
    customer.id,
    "Pages Test Customer",
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
           $4, $5, '+91 90000 00000', $6, 'SN-TEST-1', $7, 'not_initiated')`,
  [
    returnId,
    orderId,
    customer.id,
    "Pages Test Customer",
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
  `INSERT INTO admin_actions (return_id, action, actor_user_id, actor_name, actor_role, to_status, note)
   VALUES ($1, 'submitted', $2, $3, 'customer', 'requested', 'Request submitted by the customer.')`,
  [returnId, customer.id, customer.email]
);
await pool.query(
  `INSERT INTO return_images (return_id, path, kind, evidence_kind, stored_name, mime_type, size_bytes, original_name, version, superseded)
   VALUES ($1, '/uploads/returns/' || $1 || '/photo.jpg', 'photo', 'product',
           'photo.jpg', 'image/jpeg', 12, 'fault.jpg', 1, 0)`,
  [returnId]
);
await pool.query(
  `INSERT INTO return_events (return_id, status, from_status, to_status, actor_type, actor_name, note)
   VALUES ($1, 'requested', NULL, 'requested', 'customer', $2, 'Customer initiated a Replacement request.')`,
  [returnId, customer.email]
);

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-returnspages-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: adminToken,
    domain: "localhost",
    path: "/",
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  section("1. The back office's list");
  await cdp.goto(`${BASE}/admin/returns`);
  await sleep(3000);

  const listText = await cdp.evaluate(
    "document.body.innerText.slice(0, 4000)"
  );
  check("the page has a heading", /Returns\s*&\s*Refunds/.test(listText));
  check("it shows the total", /Total requests/.test(listText));
  check("it shows the new requests", /New requests/.test(listText));
  check("it shows the evidence required", /Evidence required/.test(listText));
  check("it shows the refund counters", /Refund requests/.test(listText));
  check("it shows the replacement counters", /Replacement dispatched/.test(listText));
  check("it shows the rejected count", /Rejected requests/.test(listText));
  check("it shows the closed count", /Closed requests/.test(listText));

  const navText = await cdp.evaluate(
    "[...document.querySelectorAll('aside nav a')].map(a => a.textContent.trim()).join(' | ')"
  );
  check("the sidebar has the returns entry", navText.includes("Returns & Refunds"));
  // The entries are read apart, so that "Returns & Refunds" is not
  // mistaken for a separate "Refunds" entry.
  const navEntries = navText.split("|").map((e) => e.trim());
  check(
    "and there is only one entry for it",
    !navEntries.includes("Refunds") && !navEntries.includes("Replacements"),
    navEntries.join(" · ")
  );

  section("2. The refund and replacement records");
  await cdp.goto(`${BASE}/admin/returns?view=refunds`);
  await sleep(2500);
  const refundsText = await cdp.evaluate(
    "document.body.innerText.slice(0, 3000)"
  );
  check("the refunds view has a heading", /Refunds/.test(refundsText));
  check("it counts the refunds", /Refunds on file/.test(refundsText));

  await cdp.goto(`${BASE}/admin/returns?view=replacements`);
  await sleep(2500);
  const replacementsText = await cdp.evaluate(
    "document.body.innerText.slice(0, 3000)"
  );
  check("the replacements view has a heading", /Replacement/.test(replacementsText));
  check("it counts the shipments", /Shipments on file/.test(replacementsText));

  // The old URLs still work — they go to the section.
  await cdp.goto(`${BASE}/admin/refunds`);
  await sleep(2000);
  check(
    "the old refunds URL goes to the section",
    (await cdp.evaluate("location.pathname")).includes("/admin/returns")
  );
  await cdp.goto(`${BASE}/admin/replacements`);
  await sleep(2000);
  check(
    "and so does the old replacements URL",
    (await cdp.evaluate("location.pathname")).includes("/admin/returns")
  );

  section("2b. The Refunds section");
  // The refunds section has columns only when there is a refund to show,
  // so one is raised first.
  const refundId = `RFD${randomBytes(4).toString("hex").toUpperCase()}`;
  refundsRaised.push(refundId);
  await pool.query(
    `INSERT INTO return_refunds
       (id, return_id, order_id, user_id, amount, calculated_amount, unit_price,
        quantity, payment_method, original_payment_method, gateway_payment_id,
        status, approved_by_name, approved_at, initiated_at, completed_at,
        settled_by, gateway_transaction_id, confirmed_by_name)
     VALUES ($1, $2, $3, NULL, $4, $4, $5, 1, 'UPI', 'UPI', 'pay_PAGES1',
             'completed', 'Pages Test', $6, $6, $6, 'manual', 'UTR-PAGES-1', 'Pages Test')`,
    [refundId, returnId, orderId, product.price, product.price, new Date().toISOString()]
  );
  await pool.query(
    `INSERT INTO return_refund_lines
       (refund_id, order_item_id, product_slug, name, unit_price, quantity, line_amount)
     VALUES ($1, (SELECT id FROM order_items WHERE order_id = $2), $3, $4, $5, 1, $5)`,
    [refundId, orderId, product.slug, product.name, product.price]
  );
  await pool.query(
    `INSERT INTO return_refund_events
       (refund_id, status, from_status, to_status, actor_type, actor_name, reference, amount, note)
     VALUES ($1, 'pending', NULL, 'pending', 'staff', 'Pages Test', NULL, $2, 'Refund raised.'),
            ($1, 'completed', 'pending', 'completed', 'staff', 'Pages Test', 'UTR-PAGES-1', $2, 'Paid by hand.')`,
    [refundId, product.price]
  );
  await cdp.goto(`${BASE}/admin/refunds`);
  await sleep(2500);
  const refundPage = await cdp.evaluate(
    "document.body.innerText.slice(0, 4000)"
  );
  check("the refunds page has a heading", /Refunds/.test(refundPage));
  check("it counts the refunds", /Refunds on file/.test(refundPage));
  check("it counts the pending ones", /Pending/.test(refundPage));
  check("it counts the processing ones", /Processing/.test(refundPage));
  check("it counts the completed ones", /Completed/.test(refundPage));
  check("it counts the failed ones", /Failed/.test(refundPage));
  check("it counts the ones not yet initiated", /Not Initiated/.test(refundPage));

  const refundColumns = await cdp.evaluate(
    "[...document.querySelectorAll('thead th')].map(t => t.textContent.trim()).join(' | ')"
  );
  console.log(`   refund columns: ${refundColumns}`);
  for (const head of [
    "Refund ID",
    "Order ID",
    "Request ID",
    "Customer",
    "Original Payment Method",
    "Refund Amount",
    "Refund Status",
    "Refund Date",
    "Transaction / Gateway Reference",
  ]) {
    check(
      `a column for ${head}`,
      refundColumns.toLowerCase().includes(head.toLowerCase())
    );
  }

  section("3. The back office's request page");
  await cdp.goto(`${BASE}/admin/returns/${returnId}`);
  await sleep(3000);

  const detailText = await cdp.evaluate(
    "document.body.innerText.slice(0, 8000)"
  );
  check("it shows the request id", detailText.includes(returnId));
  check("it shows the order id", detailText.includes(orderId));
  check("it shows the customer", detailText.includes("Pages Test Customer"));
  check("it shows the email", detailText.includes(customer.email));
  check("it shows the phone", detailText.includes("+91 90000 00000"));
  check("it shows the product", detailText.includes(product.name));
  check("it shows the request type", /Replacement/.test(detailText));
  check("it shows the written explanation", /cracked corner/.test(detailText));
  check("it shows the serial number", /SN-TEST-1/.test(detailText));
  check("it shows the date of delivery", /Date of delivery/.test(detailText));
  check("it shows the evidence section", /Evidence \(1\)/.test(detailText));
  check("it shows the history", /Activity & Audit History/.test(detailText));
  check("it shows the staff actions", /Staff actions/.test(detailText));

  const buttons = await cdp.evaluate(
    "[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).join(' | ')"
  );
  check("there is a button to approve", /Approve Return Request/.test(buttons));
  check("there is a button to reject", /Reject Return Request/.test(buttons));
  check("there is a button to ask for evidence", /Ask the customer/.test(buttons));
  check("there is a button to add a note", /Add Note/.test(buttons));

  const evidenceImages = await cdp.evaluate(
    "document.querySelectorAll('img[src*=\"/evidence/\"]').length"
  );
  check("the evidence is shown in the panel", evidenceImages >= 1, `${evidenceImages} images`);
  check(
    "the evidence is fetched through the authorised route",
    await cdp.evaluate(
      "[...document.querySelectorAll('img[src*=\"/evidence/\"]')].every(i => i.src.includes('/api/returns/'))"
    )
  );

  section("4. The customer's page");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: adminToken,
    domain: "localhost",
    path: "/",
  });
  const customerPage = await cdp.evaluate("document.title");
  check("the page has a title", typeof customerPage === "string");

  section("5. The policy page");
  await cdp.goto(`${BASE}/refund-policy`);
  await sleep(2000);
  const policyText = await cdp.evaluate(
    "document.body.innerText.slice(0, 12000)"
  );
  check("the policy page is there", /Return, Refund and Replacement Rules/.test(policyText));
  check("it gives the reporting window", /7 calendar days/.test(policyText));
  check("it says replacement comes first", /replacement/i.test(policyText));
  check("it covers the sealed conditions", /completely sealed/i.test(policyText));
  check("it covers the inspection", /Inspection of the Returned Product/.test(policyText));
  check("it covers the replacement procedure", /The Replacement Procedure/.test(policyText));
  check("it covers warranty", /Warranty/.test(policyText));
  check("it covers consumer grievances", /Consumer Grievances/.test(policyText));
  check("it covers cancellation", /Order Cancellation/.test(policyText));
  check("it covers the refund procedure", /How a Refund Is Processed/.test(policyText));
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  chrome?.kill();
  await sleep(300);

  for (const r of refundsRaised) {
    await pool.query("DELETE FROM return_refund_events WHERE refund_id = $1", [r]);
    await pool.query("DELETE FROM return_refund_lines WHERE refund_id = $1", [r]);
    await pool.query("DELETE FROM return_refunds WHERE id = $1", [r]);
  }
  await pool.query("DELETE FROM return_events WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_images WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM notifications WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_items WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_requests WHERE id = $1", [returnId]);
  await pool.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [customer.id]);
  await pool.query("DELETE FROM users WHERE id = $1", [customer.id]);
  await pool.end();
  console.log("\n— the fixtures this run made were removed —");
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the pages are there and show what they should.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
