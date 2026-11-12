/**
 * Checks the HTTP surface of the returns system: the endpoints, who may
 * reach them, and what they answer.
 *
 *   node scripts/check-returns-api.mjs
 *
 * The dev server must be running on port 3000.
 */
import { randomBytes } from "node:crypto";
import "./lib/env.mjs";
import { shopDb, tokenForRole } from "./lib/session.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();
const CUSTOMER_EMAIL = `returns-api-${stamp}@example.com`;

const pool = shopDb();

// Two customers: one who owns the claim, and one who must never see it.
const { rows: made } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Returns API Customer', $1, 'x', 'member'),
          ('Returns API Stranger', $2, 'x', 'member')
   RETURNING id, email`,
  [CUSTOMER_EMAIL, `returns-api-stranger-${stamp}@example.com`]
);
const customer = made.find((u) => u.email === CUSTOMER_EMAIL);
const stranger = made.find((u) => u.email !== CUSTOMER_EMAIL);

// A session for each of them, and one for the back office.
async function sessionFor(userId) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, new Date(Date.now() + 3600_000).toISOString()]
  );
  return token;
}

const customerToken = await sessionFor(customer.id);
const strangerToken = await sessionFor(stranger.id);
const adminToken = await tokenForRole("admin");

// A claim for the customer to look at.
const { rows: productRows } = await pool.query(
  `SELECT p.slug, p.name, p.price FROM products p
    WHERE p.listed = 1 AND p.status = 'published' ORDER BY p.slug LIMIT 1`
);
const product = productRows[0];

const orderId = `API${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO orders
     (id, user_id, name, email, phone, address1, city, state, pincode,
      subtotal, shipping, total, payment_method, status, delivered_at)
   VALUES ($1, $2, $3, $4, '+91 90000 00000', '1 Test Street', 'Ludhiana', 'Punjab', '142021',
           $5, 0, $5, 'Test Payment', 'delivered', $6)`,
  [
    orderId,
    customer.id,
    customer.email,
    CUSTOMER_EMAIL,
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
      customer_email, customer_phone, delivery_date, refund_amount, refund_status)
   VALUES ($1, $2, $3, 'return', 'requested', 'product_damaged',
           'The unit arrived with a cracked corner.', $4, $5, '+91 90000 00000',
           $6, $7, 'none')`,
  [
    returnId,
    orderId,
    customer.id,
    customer.email,
    CUSTOMER_EMAIL,
    new Date().toISOString().slice(0, 10),
    product.price,
  ]
);
await pool.query(
  `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
   VALUES ($1, (SELECT id FROM order_items WHERE order_id = $2), $3, $4, $5, 1)`,
  [returnId, orderId, product.slug, product.name, product.price]
);

// A piece of evidence on it, so the evidence route has something to serve.
const imageId = `img${randomBytes(4).toString("hex")}.jpg`;
await pool.query(
  `INSERT INTO return_images (return_id, path, kind, evidence_kind, stored_name, mime_type, size_bytes, original_name, version, superseded)
   VALUES ($1, '/uploads/returns/' || $1 || '/' || $2, 'photo', 'product', $2, 'image/jpeg', 12, 'fault.jpg', 1, 0)`,
  [returnId, imageId]
);

// A second claim, untouched, for the decisions and the extra evidence.
const returnId2 = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO return_requests
     (id, order_id, user_id, type, status, reason, customer_notes, customer_name,
      customer_email, customer_phone, delivery_date, refund_amount, refund_status)
   VALUES ($1, $2, $3, 'return', 'requested', 'product_damaged',
           'The unit arrived with a cracked corner.', $4, $5, '+91 90000 00000',
           $6, $7, 'none')`,
  [
    returnId2,
    orderId,
    customer.id,
    customer.email,
    CUSTOMER_EMAIL,
    new Date().toISOString().slice(0, 10),
    product.price,
  ]
);
await pool.query(
  `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
   VALUES ($1, (SELECT id FROM order_items WHERE order_id = $2), $3, $4, $5, 1)`,
  [returnId2, orderId, product.slug, product.name, product.price]
);

const cookie = (token) => `pf_auth=${token}`;

try {
  section("1. The customer's own requests");

  const mine = await fetch(`${BASE}/api/returns`, {
    headers: { cookie: cookie(customerToken) },
  });
  check("the endpoint answers", mine.status === 200, `status ${mine.status}`);
  const mineBody = await mine.json();
  check(
    "the customer sees their own request",
    mineBody.requests?.some((r) => r.id === returnId)
  );
  check(
    "and nobody else's",
    mineBody.requests?.every((r) => r.customer_email === CUSTOMER_EMAIL || r.customer_email === undefined)
  );

  const nobody = await fetch(`${BASE}/api/returns`);
  check("an anonymous caller is refused", nobody.status === 401, `status ${nobody.status}`);

  section("2. One request, and its history");

  const one = await fetch(`${BASE}/api/returns/${returnId}`, {
    headers: { cookie: cookie(customerToken) },
  });
  check("the owner can read it", one.status === 200, `status ${one.status}`);
  const oneBody = await one.json();
  check("it carries the evidence", oneBody.request?.evidence?.length === 1);
  check(
    "the evidence is served through the authorised route",
    oneBody.request?.evidence?.[0]?.url?.startsWith(`/api/returns/${returnId}/evidence/`)
  );

  const history = await fetch(`${BASE}/api/returns/${returnId}/history`, {
    headers: { cookie: cookie(customerToken) },
  });
  check("the history is there", history.status === 200, `status ${history.status}`);

  section("3. Nobody else may read it");

  const other = await fetch(`${BASE}/api/returns/${returnId}`, {
    headers: { cookie: cookie(strangerToken) },
  });
  check(
    "another customer is refused",
    other.status === 404 || other.status === 403,
    `status ${other.status}`
  );

  const otherList = await fetch(`${BASE}/api/returns`, {
    headers: { cookie: cookie(strangerToken) },
  });
  const otherBody = await otherList.json();
  check(
    "and it is not in their list either",
    otherBody.requests?.every((r) => r.id !== returnId)
  );

  section("4. The back office");

  const adminList = await fetch(`${BASE}/api/admin/returns?q=${returnId}`, {
    headers: { cookie: cookie(adminToken) },
  });
  check("the back office can list requests", adminList.status === 200, `status ${adminList.status}`);
  const adminBody = await adminList.json();
  check("the claim is in the list", adminBody.rows?.some((r) => r.id === returnId));
  check("the list is paged", typeof adminBody.total === "number");

  const adminOne = await fetch(`${BASE}/api/admin/returns/${returnId}`, {
    headers: { cookie: cookie(adminToken) },
  });
  check("the back office can read one request", adminOne.status === 200);
  const adminOneBody = await adminOne.json();
  check("it carries the audit log", Array.isArray(adminOneBody.actions));
  check("it carries the evidence with its metadata", adminOneBody.request?.evidence?.[0]?.mime_type === "image/jpeg");
  check(
    "and a download link for it",
    adminOneBody.request?.evidence?.[0]?.download_url?.includes("download=1")
  );

  const customerInAdmin = await fetch(`${BASE}/api/admin/returns`, {
    headers: { cookie: cookie(customerToken) },
  });
  check(
    "a customer cannot reach the back office",
    customerInAdmin.status === 401 || customerInAdmin.status === 403,
    `status ${customerInAdmin.status}`
  );

  section("5. The evidence itself");

  const evidence = await fetch(
    `${BASE}/api/returns/${returnId}/evidence/1`,
    { headers: { cookie: cookie(adminToken) } }
  );
  check("the file is not found when it is not in the store", evidence.status === 404);

  const strangerEvidence = await fetch(
    `${BASE}/api/returns/${returnId}/evidence/1`,
    { headers: { cookie: cookie(strangerToken) } }
  );
  check(
    "another customer cannot reach the evidence",
    strangerEvidence.status === 403 || strangerEvidence.status === 404,
    `status ${strangerEvidence.status}`
  );

  section("6. The refund and replacement records");

  const refunds = await fetch(`${BASE}/api/admin/refunds`, {
    headers: { cookie: cookie(adminToken) },
  });
  check("the refund records are there", refunds.status === 200);
  const refundsBody = await refunds.json();
  check("and they are paged", typeof refundsBody.total === "number");

  const replacements = await fetch(`${BASE}/api/admin/replacements`, {
    headers: { cookie: cookie(adminToken) },
  });
  check("the replacement records are there", replacements.status === 200);

  const customerRefunds = await fetch(`${BASE}/api/admin/refunds`, {
    headers: { cookie: cookie(customerToken) },
  });
  check(
    "a customer cannot read the refund records",
    customerRefunds.status === 401 || customerRefunds.status === 403
  );

  section("7. A refund cannot be marked paid without its reference");

  const refundId = `RFD${randomBytes(4).toString("hex").toUpperCase()}`;
  await pool.query(
    `INSERT INTO return_refunds
       (id, return_id, order_id, user_id, amount, payment_method, status, approved_by_name, approved_at)
     VALUES ($1, $2, $3, $4, $5, 'Original Payment Source', 'approved', 'Test', $6)`,
    [refundId, returnId, orderId, customer.id, product.price, new Date().toISOString()]
  );

  const noReference = await fetch(`${BASE}/api/admin/refunds/${refundId}`, {
    method: "PATCH",
    headers: { cookie: cookie(adminToken), "content-type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
  check(
    "a refund with no transaction reference is refused",
    noReference.status === 400,
    `status ${noReference.status}`
  );

  const withReference = await fetch(`${BASE}/api/admin/refunds/${refundId}`, {
    method: "PATCH",
    headers: { cookie: cookie(adminToken), "content-type": "application/json" },
    body: JSON.stringify({ status: "completed", gatewayTransactionId: "UTR-API-1" }),
  });
  check(
    "a refund with a transaction reference is accepted",
    withReference.status === 200,
    `status ${withReference.status}`
  );

  const paid = await pool.query(
    "SELECT status, gateway_transaction_id, completed_at FROM return_refunds WHERE id = $1",
    [refundId]
  );
  check("the refund is recorded as paid", paid.rows[0]?.status === "completed");
  check("the transaction reference is kept", paid.rows[0]?.gateway_transaction_id === "UTR-API-1");
  check("the completion date is kept", Boolean(paid.rows[0]?.completed_at));

  section("8. A decision needs the right permission");

  const customerDecision = await fetch(
    `${BASE}/api/admin/returns/${returnId2}/decision`,
    {
      method: "POST",
      headers: { cookie: cookie(customerToken), "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    }
  );
  check(
    "a customer cannot approve a claim",
    customerDecision.status === 401 || customerDecision.status === 403,
    `status ${customerDecision.status}`
  );

  const noReason = await fetch(
    `${BASE}/api/admin/returns/${returnId2}/decision`,
    {
      method: "POST",
      headers: { cookie: cookie(adminToken), "content-type": "application/json" },
      body: JSON.stringify({ decision: "reject", reason: "" }),
    }
  );
  check(
    "a rejection with no reason is refused",
    noReason.status === 400,
    `status ${noReason.status}`
  );

  const approved = await fetch(
    `${BASE}/api/admin/returns/${returnId2}/decision`,
    {
      method: "POST",
      headers: { cookie: cookie(adminToken), "content-type": "application/json" },
      body: JSON.stringify({ decision: "start_review" }),
    }
  );
  check("the back office can pick a claim up", approved.status === 200, `status ${approved.status}`);

  const moved = await pool.query(
    "SELECT status FROM return_requests WHERE id = $1",
    [returnId2]
  );
  check("the claim moved to under review", moved.rows[0]?.status === "under_review");

  section("9. Uploading evidence");

  const noFile = await fetch(`${BASE}/api/returns/evidence`, {
    method: "POST",
    headers: { cookie: cookie(customerToken) },
    body: new FormData(),
  });
  check("an upload with no file is refused", noFile.status === 400, `status ${noFile.status}`);

  const anonymousUpload = await fetch(`${BASE}/api/returns/evidence`, {
    method: "POST",
    body: new FormData(),
  });
  check(
    "an anonymous upload is refused",
    anonymousUpload.status === 401,
    `status ${anonymousUpload.status}`
  );

  const form = new FormData();
  form.append(
    "files",
    new File([Buffer.from("not an image")], "notes.txt", { type: "text/plain" })
  );
  const badFile = await fetch(`${BASE}/api/returns/evidence`, {
    method: "POST",
    headers: { cookie: cookie(customerToken) },
    body: form,
  });
  check("a file that is not a photograph is refused", badFile.status === 400);

  const goodForm = new FormData();
  goodForm.append(
    "files",
    new File(
      [
        Buffer.from(
          "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z",
          "base64"
        )
      ],
      "photo.jpg",
      { type: "image/jpeg" }
    )
  );
  goodForm.append("evidenceKind", "product");

  const goodUpload = await fetch(`${BASE}/api/returns/evidence`, {
    method: "POST",
    headers: { cookie: cookie(customerToken) },
    body: goodForm,
  });
  check("a photograph is accepted", goodUpload.status === 201, `status ${goodUpload.status}`);
  const uploaded = await goodUpload.json();
  check("it comes back with a name of its own", Boolean(uploaded.uploads?.[0]?.id));

  const uploadId = uploaded.uploads?.[0]?.id;

  const attach = await fetch(`${BASE}/api/returns/${returnId2}`, {
    method: "POST",
    headers: { cookie: cookie(customerToken), "content-type": "application/json" },
    body: JSON.stringify({ uploadIds: [uploadId], note: "A photograph of the crack." }),
  });
  check("it can be attached to the request", attach.status === 201, `status ${attach.status}`);

  const after = await pool.query(
    "SELECT COUNT(*)::int AS n FROM return_images WHERE return_id = $1",
    [returnId2]
  );
  check("the evidence is on the request", after.rows[0]?.n === 1, `${after.rows[0]?.n} files`);

  const strangerAttach = await fetch(`${BASE}/api/returns/${returnId2}`, {
    method: "POST",
    headers: { cookie: cookie(strangerToken), "content-type": "application/json" },
    body: JSON.stringify({ uploadIds: [uploadId] }),
  });
  check(
    "another customer cannot attach evidence to it",
    strangerAttach.status === 403 || strangerAttach.status === 404,
    `status ${strangerAttach.status}`
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  for (const id of [returnId, returnId2]) {
    await pool.query("DELETE FROM return_events WHERE return_id = $1", [id]);
    await pool.query("DELETE FROM return_images WHERE return_id = $1", [id]);
    await pool.query("DELETE FROM notifications WHERE return_id = $1", [id]);
    await pool.query("DELETE FROM return_refunds WHERE return_id = $1", [id]);
    await pool.query("DELETE FROM return_items WHERE return_id = $1", [id]);
    await pool.query("DELETE FROM return_requests WHERE id = $1", [id]);
  }
  await pool.query("DELETE FROM return_images WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM notifications WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_refunds WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_items WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_requests WHERE id = $1", [returnId]);
  await pool.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  await pool.query("DELETE FROM sessions WHERE user_id IN ($1, $2)", [
    customer.id,
    stranger.id,
  ]);
  await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [
    customer.id,
    stranger.id,
  ]);
  console.log("\n— the fixtures this run made were removed —");
  await pool.end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the endpoints and their guards work.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
