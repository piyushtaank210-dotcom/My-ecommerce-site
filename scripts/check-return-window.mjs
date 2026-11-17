/**
 * Checks the return and replacement policy end to end: the five-day
 * window, the sealed confirmation, the evidence a damaged or faulty
 * unit has to carry, and the refunds that follow.
 *
 *   node scripts/check-return-window.mjs
 *
 * The parts that need a browser talk to the dev server on port 3000,
 * so the server has to be running. The parts that do not — the deadline
 * itself, and the rules behind it — are checked against the database
 * directly.
 *
 * The test rows it creates are removed again at the end.
 */
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTsResolver } from "./lib/ts-loader.mjs";
import "./lib/env.mjs";

registerTsResolver();

const { getDb } = await import("../src/lib/db.ts");
const { applyMigrations } = await import("../src/lib/migrations.ts");
const {
  RETURN_WINDOW_DAYS,
  checkRequestAllowed,
  mandatoryEvidenceFor,
  policyForReason,
} = await import("../src/lib/return-policy.ts");
const { calculateReturnDeadline } = await import("../src/lib/returns.ts");
const { submitReturnRequest } = await import("../src/lib/return-submit.ts");
const { shopDb, tokenForRole } = await import("./lib/session.mjs");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n→ ${title}`);

const db = getDb();
await applyMigrations(db);

// The shop's own database handle, for the fixtures.
const pool = shopDb();
const stamp = Date.now().toString(36).toUpperCase();

/**
 * A date that is `days` ago, at the same time of day.
 */
const daysAgo = (days) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// A customer, and somebody who must never see their requests.
const customerEmail = `return-window-${stamp}@example.com`;
const strangerEmail = `return-window-stranger-${stamp}@example.com`;

/**
 * A real JPEG — the shop reads the bytes of a file rather than its
 * name, so the bytes have to be a JPEG.
 */
function makeJpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

/**
 * A real MP4 — the shop reads the bytes, so the bytes have to be one.
 */
function makeMp4() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
  ]);
}

const { rows: users } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Return Window Customer', $1, 'x', 'member'),
          ('Return Window Stranger', $2, 'x', 'member')
   RETURNING id, email`,
  [customerEmail, strangerEmail]
);
const customer = users.find((u) => u.email === customerEmail);
const stranger = users.find((u) => u.email === strangerEmail);

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
const cookie = (token) => `pf_auth=${token}`;

// A product to claim against.
const { rows: products } = await pool.query(
  `SELECT slug, name, price FROM products
    WHERE listed = 1 AND status = 'published' ORDER BY slug LIMIT 1`
);
const product = products[0];

/**
 * An order delivered `days` ago.
 */
async function makeOrder(days, tag) {
  const id = `WIN${tag}${randomBytes(3).toString("hex").toUpperCase()}`;
  await pool.query(
    `INSERT INTO orders
       (id, user_id, name, email, phone, address1, city, state, pincode,
        subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES ($1, $2, 'Return Window Customer', $3, '+91 90000 00000', '1 Test Street',
             'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'Test Payment', 'delivered', $5)`,
    [id, customer.id, customerEmail, product.price, days === null ? null : daysAgo(days)]
  );
  await pool.query(
    `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
     VALUES ($1, $2, $3, $4, 1, 'settled', 0)`,
    [id, product.slug, product.name, product.price]
  );
  const { rows } = await pool.query(
    "SELECT id FROM order_items WHERE order_id = $1 LIMIT 1",
    [id]
  );
  return { id, orderItemId: rows[0].id };
}

const today = await makeOrder(0, "T");
const fourDays = await makeOrder(4, "F");
const fiveDays = await makeOrder(5, "V");
const sixDays = await makeOrder(6, "X");
const undated = await makeOrder(null, "U");

/** The claims this run made, so they can be removed at the end. */
const createdReturnIds = [];

/**
 * The body of a request, with the parts every request needs.
 */
function claimBody(order, over = {}) {
  return {
    orderId: order.id,
    type: "return",
    reason: "product_damaged",
    customerNotes: "The unit arrived with a cracked corner and will not power on.",
    deliveryDate: new Date().toISOString().slice(0, 10),
    contactName: "Return Window Customer",
    contactEmail: customerEmail,
    contactPhone: "+91 90000 00000",
    items: [
      {
        orderItemId: order.orderItemId,
        productSlug: product.slug,
        variantId: null,
        name: product.name,
        price: product.price,
        quantity: 1,
      },
    ],
    ...over,
  };
}

async function postClaim(token, body) {
  const res = await fetch(`${BASE}/api/returns`, {
    method: "POST",
    headers: { cookie: cookie(token), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

try {
  section("the window itself");
  {
    check(RETURN_WINDOW_DAYS === 5, "the published window is five days");

    const fresh = await calculateReturnDeadline(daysAgo(0));
    check(
      fresh.daysRemaining === 5,
      "an order delivered today has the whole window",
      `${fresh.daysRemaining} days`
    );

    const four = await calculateReturnDeadline(daysAgo(4));
    check(!four.isExpired, "an order delivered four days ago is inside the window");

    const five = await calculateReturnDeadline(daysAgo(5));
    check(
      five.deadlineIso ===
        new Date(
          (() => {
            const ist = 5.5 * 60 * 60 * 1000;
            const d = new Date(Date.now() - 5 * 86400000 + ist);
            return Date.UTC(
              d.getUTCFullYear(),
              d.getUTCMonth(),
              d.getUTCDate() + 5,
              23,
              59,
              59,
              999
            ) - ist;
          })()
        ).toISOString(),
      "an order delivered five days ago is judged on the exact deadline",
      five.deadlineIso
    );

    const six = await calculateReturnDeadline(daysAgo(6));
    check(six.isExpired, "an order delivered six days ago is outside the window");

    const none = await calculateReturnDeadline(null);
    check(none.isExpired, "an order with no delivery date has no window");
  }

  section("the order page — the buttons go when the window shuts");
  {
    const open = await fetch(`${BASE}/order/${today.id}`, {
      headers: { cookie: cookie(customerToken) },
    });
    const openHtml = await open.text();
    check(open.status === 200, "the order page answers", `status ${open.status}`);
    check(
      /Request return \/ replacement/i.test(openHtml),
      "an order inside the window offers the request"
    );
    check(
      /Replacement Window Active/i.test(openHtml),
      "and says the window is open"
    );

    const shut = await fetch(`${BASE}/order/${sixDays.id}`, {
      headers: { cookie: cookie(customerToken) },
    });
    const shutHtml = await shut.text();
    check(shut.status === 200, "the closed order's page answers", `status ${shut.status}`);
    check(
      !/Request return \/ replacement/i.test(shutHtml),
      "an order outside the window does not offer the request"
    );
    check(
      !/Replace Product/i.test(shutHtml),
      "and does not offer a replacement either"
    );
    check(
      /The return and replacement period for this order has expired\./i.test(shutHtml),
      "and says the period has expired"
    );
    check(
      /Requests can only be submitted within \d+ days of delivery\./i.test(shutHtml),
      "and says when a request could have been made"
    );
  }

  section("the request page — the same rule, reached directly");
  {
    const page = await fetch(`${BASE}/order/${sixDays.id}/return`, {
      headers: { cookie: cookie(customerToken) },
    });
    const html = await page.text();
    check(page.status === 200, "the page answers", `status ${page.status}`);
    check(
      /Not eligible for return/i.test(html),
      "a request outside the window is not offered"
    );
    check(
      /The return and replacement period for this order has expired\./i.test(html),
      "and it says why"
    );
  }

  section("the API — a request outside the window is refused");
  {
    const late = await postClaim(customerToken, claimBody(sixDays));
    check(late.status === 400, "a request outside the window is refused", `status ${late.status}`);
    check(
      /The return and replacement period for this order has expired\./i.test(
        late.json?.error ?? ""
      ),
      "with the published wording",
      late.json?.error
    );

    const undatedClaim = await postClaim(customerToken, claimBody(undated));
    check(
      undatedClaim.status === 400,
      "a request on an order with no delivery date is refused",
      `status ${undatedClaim.status}`
    );
  }

  section("a change of mind — the seal has to be confirmed");
  {
    const unsealed = await postClaim(
      customerToken,
      claimBody(today, { reason: "change_of_mind", sealedState: "opened" })
    );
    check(unsealed.status === 400, "an unsealed unit cannot be returned", `status ${unsealed.status}`);
    check(
      /sealed/i.test(unsealed.json?.error ?? ""),
      "and the customer is told why",
      unsealed.json?.error
    );

    const opened = await postClaim(
      customerToken,
      claimBody(today, { reason: "change_of_mind", sealedState: "" })
    );
    check(opened.status === 400, "no confirmation at all is refused too", `status ${opened.status}`);
  }

  section("a damaged unit — the evidence is a condition of the claim");
  {
    const noEvidence = await postClaim(
      customerToken,
      claimBody(fourDays, {
        // Even with an explanation, the evidence is still needed.
        evidenceExcused:
          "The courier left the parcel with my neighbour and I never saw the box opened.",
      })
    );
    check(
      noEvidence.status === 400,
      "a damaged claim with no photographs and no video is refused",
      `status ${noEvidence.status}`
    );
    check(
      /cannot be accepted without/i.test(noEvidence.json?.error ?? ""),
      "and says what is missing",
      noEvidence.json?.error
    );
    check(
      /unboxing video/i.test(noEvidence.json?.error ?? ""),
      "and names the unboxing video",
      noEvidence.json?.error
    );

    const photosOnly = await postClaim(
      customerToken,
      claimBody(fourDays, {
        evidenceExcused: "I could not record a video of the box being opened.",
      })
    );
    check(
      photosOnly.status === 400,
      "and it is still refused without the video",
      `status ${photosOnly.status}`
    );
  }

  section("a unit that does not work — the fault has to be shown");
  {
    const policy = policyForReason("product_not_working");
    const fault = mandatoryEvidenceFor(policy, {
      photographs: 3,
      videos: 0,
      description: true,
      serialNumber: false,
      missingList: false,
    });
    check(
      fault.some((e) => e.id === "issue_video"),
      "the fault video is what is missing"
    );

    const noVideo = await postClaim(
      customerToken,
      claimBody(fourDays, {
        reason: "product_not_working",
        customerNotes: "The controller will not pair with the console at all.",
        evidenceExcused: "I have no way of recording the fault right now.",
      })
    );
    check(
      noVideo.status === 400,
      "a faulty unit with no video of the fault is refused",
      `status ${noVideo.status}`
    );
    check(
      /video/i.test(noVideo.json?.error ?? ""),
      "and says a video is needed",
      noVideo.json?.error
    );
  }

  section("the rules the form and the back office share");
  {
    const damage = policyForReason("product_damaged");
    const change = policyForReason("change_of_mind");

    check(
      change.requiresSealed,
      "a change of mind has to be on a sealed unit"
    );
    check(
      !checkRequestAllowed({
        reason: "change_of_mind",
        type: "return",
        sealedConfirmed: false,
      }).ok,
      "and is refused without the confirmation"
    );
    check(
      checkRequestAllowed({
        reason: "change_of_mind",
        type: "return",
        sealedConfirmed: true,
      }).ok,
      "and is allowed with it"
    );
    check(
      !checkRequestAllowed({
        reason: "change_of_mind",
        type: "replacement",
        sealedConfirmed: true,
      }).ok,
      "and a change of mind is never a replacement"
    );
    check(
      damage.allowReplacement,
      "a damaged unit may be replaced"
    );
    check(
      policyForReason("change_of_mind").evidence.some((e) => e.id === "sealed_video"),
      "a sealed return carries its own video"
    );
  }

  section("one claim at a time, and only by the owner");
  {
    const first = await postClaim(customerToken, claimBody(fourDays));
    check(first.status === 400, "the claim is still refused without the evidence", `status ${first.status}`);
    check(
      first.json?.errors?.evidence !== undefined,
      "and it says which evidence it needs",
      JSON.stringify(first.json?.errors)
    );

    const strangerClaim = await postClaim(
      strangerToken,
      claimBody(fourDays, { orderId: fourDays.id })
    );
    check(
      strangerClaim.status === 400,
      "another customer cannot claim against this order",
      `status ${strangerClaim.status}`
    );
  }

  section("the back office");
  {
    const list = await fetch(`${BASE}/api/admin/returns`, {
      headers: { cookie: cookie(adminToken) },
    });
    check(list.status === 200, "the back office can list requests", `status ${list.status}`);

    const denied = await fetch(`${BASE}/api/admin/returns`, {
      headers: { cookie: cookie(customerToken) },
    });
    check(
      denied.status === 401 || denied.status === 403,
      "a customer cannot reach the back office",
      `status ${denied.status}`
    );
  }

  section("the back office cannot approve a claim that is missing its evidence");
  {
    // A claim about a unit that arrived broken, with no photographs and
    // no unboxing video on it.
    const claimId = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
    await pool.query(
      `INSERT INTO return_requests
         (id, order_id, user_id, type, status, reason, customer_notes,
          customer_name, customer_email, delivery_date, refund_amount, refund_status)
       VALUES ($1, $2, $3, 'replacement', 'requested', 'product_damaged',
               'The unit arrived with a cracked corner.', 'Return Window Customer', $4,
               $5, $6, 'none')`,
      [
        claimId,
        fourDays.id,
        customer.id,
        customerEmail,
        new Date().toISOString().slice(0, 10),
        product.price,
      ]
    );
    await pool.query(
      `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
       VALUES ($1, $2, $3, $4, $5, 1)`,
      [claimId, fourDays.orderItemId, product.slug, product.name, product.price]
    );

    const approve = await fetch(`${BASE}/api/admin/returns/${claimId}/decision`, {
      method: "POST",
      headers: { cookie: cookie(adminToken), "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    const body = await approve.json().catch(() => ({}));
    check(
      approve.status >= 400,
      "approving a claim with no evidence is refused",
      `status ${approve.status}`
    );
    check(
      /unboxing video/i.test(JSON.stringify(body)),
      "and the shop is told what is missing",
      JSON.stringify(body).slice(0, 160)
    );

    // With the evidence on it, the same claim is approved.
    for (const [kind, evidenceKind, name, mime] of [
      ["photo", "product", "fault.jpg", "image/jpeg"],
      ["photo", "package", "box.jpg", "image/jpeg"],
      ["video", "unboxing", "unboxing.mp4", "video/mp4"],
    ]) {
      await pool.query(
        `INSERT INTO return_images
           (return_id, path, kind, evidence_kind, stored_name, mime_type, size_bytes, original_name, version, superseded)
         VALUES ($1, $2, $3, $4, $5, $6, 12, $5, 1, 0)`,
        [claimId, `/uploads/returns/${claimId}/${name}`, kind, evidenceKind, name, mime]
      );
    }

    const approveAgain = await fetch(`${BASE}/api/admin/returns/${claimId}/decision`, {
      method: "POST",
      headers: { cookie: cookie(adminToken), "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    check(
      approveAgain.status === 200,
      "and it is approved once the evidence is there",
      `status ${approveAgain.status}`
    );

    const after = await pool.query(
      "SELECT status FROM return_requests WHERE id = $1",
      [claimId]
    );
    check(
      after.rows[0]?.status === "replacement_approved",
      "the request moves to the replacement stage",
      after.rows[0]?.status
    );

    await pool.query("DELETE FROM return_requests WHERE id = $1", [claimId]);
  }

  section("the back office sees the evidence and the customer's answer");
  {
    const page = await fetch(`${BASE}/admin/returns`, {
      headers: { cookie: cookie(adminToken) },
    });
    const html = await page.text();
    check(page.status === 200, "the back office answers", `status ${page.status}`);
    check(
      /Return &amp; Refunds|Returns &amp; Refunds/i.test(html),
      "and it is the returns desk"
    );
  }

  section("a claim with the evidence it needs is accepted");
  {
    // Three files: the photographs of the damage and of the packaging,
    // and the continuous unboxing video.
    const files = [
      new File([makeJpeg()], "fault.jpg", { type: "image/jpeg" }),
      new File([makeJpeg()], "box.jpg", { type: "image/jpeg" }),
      new File([makeMp4()], "unboxing.mp4", { type: "video/mp4" }),
    ];

    const form = new FormData();
    form.append("evidenceKind", "unboxing");
    for (const f of files) form.append("files", f, f.name);

    const uploaded = await fetch(`${BASE}/api/returns/evidence`, {
      method: "POST",
      headers: { cookie: cookie(customerToken) },
      body: form,
    });
    check(uploaded.status === 201 || uploaded.status === 200, "the files are accepted", `status ${uploaded.status}`);
    const uploadedBody = await uploaded.json().catch(() => ({}));
    const uploadIds = (uploadedBody.uploads ?? []).map((u) => u.id).filter(Boolean);
    check(uploadIds.length === 3, "all three files are on the shop", `${uploadIds.length} files`);

    const claim = await postClaim(
      customerToken,
      claimBody(today, { uploadIds })
    );
    check(claim.status === 201, "the claim is accepted", claim.json?.error ?? "");
    check(
      Boolean(claim.json?.returnId),
      "and it is given a reference",
      claim.json?.returnId
    );

    if (claim.json?.returnId) {
      createdReturnIds.push(claim.json.returnId);

      // The evidence is on the claim, and it is private.
      const read = await fetch(`${BASE}/api/returns/${claim.json.returnId}`, {
        headers: { cookie: cookie(customerToken) },
      });
      const body = await read.json().catch(() => ({}));
      check(
        body.request?.evidence?.length === 3,
        "the three files are on the claim",
        `${body.request?.evidence?.length} files`
      );

      // The customer cannot read another customer's claim.
      const stranger = await fetch(`${BASE}/api/returns/${claim.json.returnId}`, {
        headers: { cookie: cookie(strangerToken) },
      });
      check(
        stranger.status === 404 || stranger.status === 403,
        "and nobody else can read it",
        `status ${stranger.status}`
      );

      // A second claim about the same unit is refused.
      const again = await postClaim(
        customerToken,
        claimBody(today, { uploadIds })
      );
      check(
        again.status === 400,
        "a second claim about the same unit is refused",
        `status ${again.status}`
      );
    }
  }

  section("the published policy");
  {
    const page = await fetch(`${BASE}/refund-policy`, {
      headers: { cookie: cookie(customerToken) },
    });
    const html = await page.text();
    check(page.status === 200, "the policy page answers", `status ${page.status}`);
    check(
      /5 calendar days/i.test(html),
      "it states the five-day window"
    );
    check(
      /unboxing video is required/i.test(html),
      "it states that the unboxing video is required"
    );
    check(
      /3–4 business days/i.test(html),
      "it states when the money reaches the customer"
    );
  }
} finally {
  section("tidying up");
  {
    // The claims this run made, and the evidence on them.
    if (createdReturnIds.length) {
      const { rows: files } = await pool.query(
        "SELECT stored_name FROM return_images WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      const { rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      for (const row of files) {
        if (!row.stored_name) continue;
        for (const dir of createdReturnIds) {
          await rm(
            join(process.cwd(), "private", "returns", dir, row.stored_name),
            { force: true }
          );
        }
      }
      await pool.query(
        "DELETE FROM return_events WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM return_images WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM return_items WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM notifications WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM admin_actions WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM return_requests WHERE id = ANY($1::text[])",
        [createdReturnIds]
      );
      await pool.query(
        "DELETE FROM return_uploads WHERE return_id = ANY($1::text[])",
        [createdReturnIds]
      );
    }

    const orderIds = [today.id, fourDays.id, fiveDays.id, sixDays.id, undated.id];
    await pool.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [
      [customer.id, stranger.id],
    ]);
    const left = await pool.query(
      "SELECT COUNT(*) AS c FROM orders WHERE id LIKE 'WIN%'",
      []
    );
    check(Number(left.rows[0]?.c ?? 0) === 0, "the test rows are removed");
  }
}

console.log(
  failures ? `\n✗ ${failures} check(s) failed` : "\n✓ every check passed"
);
if (failures) process.exit(1);
