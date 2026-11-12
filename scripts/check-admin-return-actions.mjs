/**
 * Walks requests through the actions the back office offers, the way a
 * member of staff would: ask for more information, approve, schedule the
 * pickup, mark the product received, inspect it, raise the refund and
 * close it. Each step is a click on the real page.
 *
 * The refund is the point of it. Approving a refund is not the same as
 * paying it, and the request is not finished until the payment has been
 * confirmed.
 *
 *   node scripts/check-admin-return-actions.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { db, closeDb } from "./lib/pg-db.mjs";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9262;

const token = await tokenForRole("admin");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

// A request to work on: the order the other test requests use, with one
// item on it.
const order = await db
  .prepare("SELECT * FROM orders WHERE status = 'delivered' LIMIT 1")
  .get() ?? await db.prepare("SELECT * FROM orders LIMIT 1").get();
const orderItem = await db
  .prepare("SELECT * FROM order_items WHERE order_id = ? LIMIT 1")
  .get(order.id);

/** Makes a fresh request, in the state a customer would have left it in. */
/** Makes a fresh request, in the state a customer would have left it in. */
async function makeRequest(tag) {
  const id = `RET-${tag}${Date.now().toString().slice(-6)}`;
  await db
    .prepare(
      `INSERT INTO return_requests
        (id, order_id, user_id, type, status, reason, customer_notes, refund_amount, refund_status)
       VALUES (?, ?, ?, 'return', 'requested', 'defective', 'Device turns off on its own', ?, 'none')`
    )
    .run(id, order.id, order.user_id, orderItem.price);
  await db
    .prepare(
      `INSERT INTO return_items
        (return_id, order_item_id, product_slug, variant_id, name, price, quantity, reason_detail)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'Auto shutdown')`
    )
    .run(
      id,
      orderItem.id,
      orderItem.product_slug,
      orderItem.variant_id ?? null,
      orderItem.name,
      orderItem.price
    );
  return id;
}

const requestId = await makeRequest("ACT");
const refusedId = await makeRequest("REF");

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-returnactions-chrome"),
  dir: join(ROOT, ".shots"),
});

/** The status shown on the request page. */
const STATUS = `(() => {
  const badge = [...document.querySelectorAll('span')].find(s =>
    /^(Request Submitted|Under Review|Evidence Required|Evidence Received|Approved|Rejected|Cancelled|Return Pickup Scheduled|Product Received by ConsoleSeller|Product Inspection in Progress|Inspection Completed|Inspection Failed|Replacement Approved|Replacement Dispatched|Refund Approved|Refund Processing|Refund Completed|Request Resolved)$/.test(s.textContent.trim())
  );
  return badge ? badge.textContent.trim() : null;
})()`;

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: token,
    domain: "localhost",
    path: "/",
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /** Fills the named field and presses the button with the given label. */
  async function act(fields, buttonLabel, expected, note) {
    for (const [name, value] of Object.entries(fields)) {
      await cdp.evaluate(setInput(name, value));
    }
    await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('button[type=submit]')]
        .find(x => x.textContent.trim().startsWith(${JSON.stringify(buttonLabel)}));
      b?.click();
      return Boolean(b);
    })()`);

    let status = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(750);
      status = await cdp.evaluate(STATUS);
      if (status === expected) break;
    }
    check(note, status === expected, `status is ${status}`);
  }

  /** Walks a request as far as the inspection. */
  async function toInspection(id) {
    await cdp.goto(`${BASE}/admin/returns/${id}`);
    await sleep(1800);
    check(
      "the request opens in the back office",
      (await cdp.evaluate(STATUS)) === "Request Submitted"
    );

    const buttons = await cdp.evaluate(
      `[...document.querySelectorAll('button[type=submit]')].map(b => b.textContent.trim())`
    );
    console.log(`   buttons here: ${buttons.join(" · ")}`);
    check(
      buttons.some((b) => b.includes("Approve")),
      "there is an Approve Request button"
    );
    check(
      buttons.some((b) => b.includes("Reject")),
      "there is a Reject Request button"
    );
    check(
      buttons.some((b) => b.includes("Ask the customer")),
      "there is a Request More Information button"
    );

    // A rejection cannot be done without saying why.
    const rejectNeedsReason = await cdp.evaluate(`(() => {
      const form = [...document.querySelectorAll('form')].find(f =>
        f.querySelector('button[type=submit]')?.textContent.includes('Reject')
      );
      const field = form?.querySelector('textarea[name=rejectionReason]');
      return Boolean(field?.required);
    })()`);
    check("a rejection has to be given a reason", rejectNeedsReason);

    await act(
      { message: "Please send a photo of the serial number on the box." },
      "Ask the customer",
      "Evidence Required",
      "asking the customer for more information"
    );

    await act(
      { adminNotes: "Checked against the order." },
      "Approve Return Request",
      "Approved",
      "approving the request"
    );

    await act(
      {
        courier: "Bluedart Express",
        tracking: "AWB998877665",
        date: "2026-11-20",
        notes: "Collect from the front desk.",
      },
      "Save & Dispatch Pickup",
      "Return Pickup Scheduled",
      "scheduling the pickup"
    );

    await act(
      { notes: "One box, controller inside." },
      "Mark as Received",
      "Product Received by ConsoleSeller",
      "marking the product received"
    );

    await act(
      { notes: "Box opened, controller present, no physical damage." },
      "Submit QC & Update Stock",
      "Inspection Completed",
      "marking the inspection completed"
    );
  }

  console.log(`\n— walking ${requestId} through the back office —`);
  await toInspection(requestId);

  await act(
    { amount: String(orderItem.price), method: "Bank IMPS/NEFT", notes: "To the original card." },
    "Approve Refund",
    "Refund Approved",
    "approving the refund"
  );
  await cdp.shot("admin-return-refund-pending");

  // The refund has been approved, not paid. Nothing so far may say it has
  // gone back to the customer.
  const raised = await db
    .prepare("SELECT status, refund_status, refund_reference FROM return_requests WHERE id = ?")
    .get(requestId);
  check(
    "the refund is pending, not paid",
    raised?.refund_status === "pending",
    `refund_status is ${raised?.refund_status}`
  );
  check(
    "the refund has no payment reference yet",
    !raised?.refund_reference
  );

  // And the request cannot be closed while the money is still owed.
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('button[type=submit]')]
      .find(x => x.textContent.trim().startsWith('Mark as Completed'));
    b?.click();
    return true;
  })()`);
  await sleep(2500);
  const stillOpen = await db
    .prepare("SELECT status FROM return_requests WHERE id = ?")
    .get(requestId);
  check(
    "the request stays open while the refund is unpaid",
    stillOpen?.status === "refund_approved",
    `status is ${stillOpen?.status}`
  );

  await act(
    { reference: "UTR123456789", notes: "Sent by IMFS at 4pm." },
    "Confirm the Refund Has Been Paid",
    "Refund Completed",
    "confirming the refund has been paid"
  );

  const paid = await db
    .prepare(
      "SELECT refund_status, refund_reference, refund_processed_at FROM return_requests WHERE id = ?"
    )
    .get(requestId);
  check("the refund is now paid", paid?.refund_status === "processed");
  check(
    "the payment reference is on the record",
    paid?.refund_reference === "UTR123456789"
  );
  check("the time it was paid is on the record", Boolean(paid?.refund_processed_at));

  await act(
    { notes: "Money returned to the customer." },
    "Mark as Completed",
    "Request Resolved",
    "closing the request"
  );

  // Everything that was done is in the history, with who did it and when.
  const history = await db
    .prepare(
      "SELECT status, actor_type, note, created_at FROM return_events WHERE return_id = ? ORDER BY id"
    )
    .all(requestId);
  console.log(`   history: ${history.map((h) => h.status).join(" → ")}`);
  for (const step of [
    "info_requested",
    "approved",
    "pickup_scheduled",
    "received",
    "qc_passed",
    "refund_approved",
    "refund_completed",
    "resolved",
  ]) {
    check(
      `the history records ${step}`,
      history.some((h) => h.status === step)
    );
  }
  check(
    "every step has a time on it",
    history.every((h) => Boolean(h.created_at))
  );
  check(
    "the staff who did it is named",
    history
      .filter((h) => h.actor_type === "staff")
      .every((h) => Boolean(h.note))
  );

  console.log(`\n— refusing the refund on ${refusedId} —`);
  await toInspection(refusedId);

  await act(
    { amount: String(orderItem.price), method: "Bank IMPS/NEFT" },
    "Approve Refund",
    "Refund Approved",
    "approving the refund"
  );

  const refusalNeedsReason = await cdp.evaluate(`(() => {
    const form = [...document.querySelectorAll('form')].find(f =>
      f.querySelector('button[type=submit]')?.textContent.includes('Refuse the Refund')
    );
    const field = form?.querySelector('textarea[name=reason]');
    return Boolean(field?.required);
  })()`);
  check("refusing a refund has to be given a reason", refusalNeedsReason);

  await act(
    { reason: "The unit was not returned in the condition claimed." },
    "Refuse the Refund",
    "Rejected",
    "refusing the refund"
  );

  const refused = await db
    .prepare(
      "SELECT status, refund_status, rejection_reason FROM return_requests WHERE id = ?"
    )
    .get(refusedId);
  check("the refund is recorded as failed", refused?.refund_status === "failed");
  check("the request is closed as refused", refused?.status === "rejected");
  check(
    "the reason for refusing it is on the record",
    (refused?.rejection_reason ?? "").includes("not returned"),
    refused?.rejection_reason ?? "none"
  );
  check(
    "the customer can see the reason",
    (await cdp.evaluate(`document.body.innerText`)).includes(
      "not returned in the condition claimed"
    )
  );

  await cdp.shot("admin-return-actions");
} finally {
  chrome.kill();
  // The requests were made for the test, so they go when the test is over.
  for (const id of [requestId, refusedId]) {
    await db.prepare("DELETE FROM return_events WHERE return_id = ?").run(id);
    await db.prepare("DELETE FROM return_items WHERE return_id = ?").run(id);
    await db.prepare("DELETE FROM return_requests WHERE id = ?").run(id);
  }
  await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  await closeDb();
}

console.log(failures ? `\n${failures} check(s) failed` : "\n✓ every check passed");
if (failures) process.exitCode = 1;
