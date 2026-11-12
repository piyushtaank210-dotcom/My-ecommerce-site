/**
 * Walks a replacement request through the whole workflow the way a member
 * of staff would, and checks the things that must not go wrong:
 *
 *   - the shelf is checked before a replacement is promised;
 *   - the admin can send a different unit;
 *   - the stock comes off the shelf exactly once;
 *   - a second attempt to dispatch does nothing at all;
 *   - the courier, tracking, dispatch date and delivery status are on the
 *     record, and the customer can see them.
 *
 *   node scripts/check-admin-return-replacement.mjs
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
const PORT = 9263;

const token = await tokenForRole("admin");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

// A replacement on an order that really bought the unit — the case where
// taking the same shelf twice used to be refused by the database.
const order = await db
  .prepare("SELECT * FROM orders WHERE status = 'delivered' LIMIT 1")
  .get() ?? await db.prepare("SELECT * FROM orders LIMIT 1").get();
const orderItem = await db
  .prepare("SELECT * FROM order_items WHERE order_id = ? LIMIT 1")
  .get(order.id);

const requestId = `RET-RPL${Date.now().toString().slice(-6)}`;
await db
  .prepare(
    `INSERT INTO return_requests
      (id, order_id, user_id, type, status, reason, customer_notes, refund_amount, refund_status)
     VALUES (?, ?, ?, 'replacement', 'requested', 'defective', 'Console will not turn on', 0, 'none')`
  )
  .run(requestId, order.id, order.user_id);
await db
  .prepare(
    `INSERT INTO return_items
      (return_id, order_item_id, product_slug, variant_id, name, price, quantity, reason_detail)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'Will not power on')`
  )
  .run(
    requestId,
    orderItem.id,
    orderItem.product_slug,
    orderItem.variant_id ?? null,
    orderItem.name,
    orderItem.price
  );

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-returnreplacement-chrome"),
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

    await sleep(1200);
    let status = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(750);
      status = await cdp.evaluate(STATUS);
      if (status === expected) break;
    }
    check(note, status === expected, `status is ${status}`);
  }

  console.log(`\n— walking ${requestId} through the replacement workflow —`);
  const page = `${BASE}/admin/returns/${requestId}`;

  await cdp.goto(page);
  await sleep(1800);
  check(
    "the replacement request opens in the back office",
    (await cdp.evaluate(STATUS)) === "Request Submitted"
  );

  await act(
    { adminNotes: "Checked against the order." },
    "Approve Return Request",
    "Replacement Approved",
    "approving the request"
  );
  await act(
    {
      courier: "Bluedart Express",
      tracking: "AWB112233445",
      date: "2026-11-22",
      notes: "Collect from the front desk.",
    },
    "Save & Dispatch Pickup",
    "Return Pickup Scheduled",
    "scheduling the pickup"
  );
  await act(
    { notes: "One box." },
    "Mark as Received",
    "Product Received by ConsoleSeller",
    "marking the product received"
  );
  await act(
    { notes: "Box opened, console present, no physical damage." },
    "Submit QC & Update Stock",
    "Inspection Completed",
    "marking the inspection completed"
  );

  /* ------------------------------------------------ what is on the shelf */

  console.log("\n— the shelf —");
  const panel = await cdp.evaluate(`(() => {
    const section = [...document.querySelectorAll('section')].find(s =>
      s.textContent.includes('Create the Replacement Shipment')
    );
    if (!section) return null;
    const select = section.querySelector('select[name=replacementChoice]');
    return {
      options: select ? [...select.options].map(o => ({ value: o.value, text: o.textContent.trim() })) : [],
      showsStock: section.innerText.includes('on the shelf'),
      mentionsStock: /\\d+ in stock|out of stock/.test(section.innerText),
      choices: section.querySelector('input[name=choices]')?.value ?? null,
    };
  })()`);

  check("the replacement panel is there", panel !== null);
  console.log(`   options: ${panel?.options.map((o) => o.text).join(" | ")}`);
  check("the panel says how many are on the shelf", panel?.showsStock === true);
  check(
    "the options carry a stock count",
    panel?.mentionsStock === true,
    panel?.options[0]?.text
  );
  await cdp.evaluate(`(() => {
    const section = [...document.querySelectorAll('section')].find(s =>
      s.textContent.includes('Create the Replacement Shipment')
    );
    section?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(500);
  await cdp.shot("admin-replacement-panel");

  /* --------------------------------------------------- choosing the unit */

  console.log("\n— choosing what goes out —");
  const current = panel?.options.find((o) => o.text.includes("the unit that came back"));
  const other = panel?.options.find((o) => !o.text.includes("the unit that came back"));
  const chosen = other?.value ?? current?.value;

  if (other) {
    await cdp.evaluate(setInput("replacementChoice", other.value));
    await sleep(600);
    const after = await cdp.evaluate(`(() => {
      const section = [...document.querySelectorAll('section')].find(s =>
        s.textContent.includes('Create the Replacement Shipment')
      );
      const select = section?.querySelector('select[name=replacementChoice]');
      return {
        value: select?.value ?? null,
        choices: section?.querySelector('input[name=choices]')?.value ?? null,
      };
    })()`);
    check("a different unit can be chosen", after.value === other.value, after.value);
    check(
      "the choice is carried with the form",
      (after.choices ?? "").includes(other.value.split("::")[0]),
      after.choices ?? ""
    );
  } else {
    check("a different unit can be chosen", false, "only one option was offered");
  }

  /* ------------------------------------------------ creating the shipment */

  console.log("\n— creating the shipment —");
  // What was chosen, and how many were on the shelf before it went.
  const choice = JSON.parse(
    await cdp.evaluate(
      `document.querySelector('input[name=choices]')?.value ?? '[]'`
    )
  )[0];
  const stockBefore = choice?.variantId
    ? await db
        .prepare(`SELECT stock FROM variants WHERE id = ?`)
        .get(choice.variantId)
    : await db
        .prepare(`SELECT stock FROM products WHERE slug = ?`)
        .get(choice?.productSlug);

  await act(
    {
      courier: "Delhivery",
      tracking: "REP-TRK-556677",
      dispatchDate: "2026-11-23",
      notes: "Sent from the warehouse.",
    },
    "Create the Replacement Shipment",
    "Replacement Dispatched",
    "creating the replacement shipment"
  );

  const shipment = await db
    .prepare(
      `SELECT replacement_order_id, replacement_courier, replacement_tracking,
              replacement_dispatch_date, replacement_delivery_status,
              replacement_product_slug, replacement_variant_id
       FROM return_requests WHERE id = ?`
    )
    .get(requestId);
  console.log(`   shipment: ${JSON.stringify(shipment)}`);

  check("the shipment has a reference", Boolean(shipment?.replacement_order_id));
  check("the courier is on the record", shipment?.replacement_courier === "Delhivery");
  check("the tracking number is on the record", shipment?.replacement_tracking === "REP-TRK-556677");
  check("the dispatch date is on the record", shipment?.replacement_dispatch_date === "2026-11-23");
  check(
    "the delivery starts as dispatched",
    shipment?.replacement_delivery_status === "dispatched",
    String(shipment?.replacement_delivery_status)
  );
  check(
    "what is going out is on the record",
    Boolean(shipment?.replacement_product_slug)
  );

  // The stock came off the shelf exactly once, and it came off as a
  // replacement rather than as a second sale of the original order.
  const movements = await db
    .prepare(
      `SELECT movement_type, quantity_changed, reason FROM inventory_movements
       WHERE reason LIKE ? ORDER BY id`
    )
    .all(`%${shipment?.replacement_order_id}%`);
  console.log(`   movements: ${JSON.stringify(movements)}`);
  check(
    "the stock was taken once",
    movements.length === 1,
    `${movements.length} movement(s)`
  );
  check(
    "it was booked as a replacement, not a sale",
    movements[0]?.movement_type === "replacement",
    movements[0]?.movement_type
  );

  if (stockBefore) {
    const stockAfter = await db
      .prepare(`SELECT stock FROM variants WHERE id = ?`)
      .get(choice?.variantId);
    check(
      "the shelf is one down",
      Number(stockAfter?.stock) === Number(stockBefore.stock) - 1,
      `${stockBefore.stock} → ${stockAfter?.stock}`
    );
  }

  /* ------------------------------------------- a second attempt does nothing */

  console.log("\n— trying to dispatch a second time —");
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('button[type=submit]')]
      .find(x => x.textContent.trim().startsWith('Create the Replacement Shipment'));
    b?.click();
    return true;
  })()`);
  await sleep(2500);

  const movementsAfter = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM inventory_movements WHERE reason LIKE ?`
    )
    .get(`%${shipment?.replacement_order_id}%`);
  const shipments = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM inventory_movements WHERE movement_type = 'replacement' AND reason LIKE '%${requestId}%'`
    )
    .get();
  check(
    "a second dispatch takes nothing off the shelf",
    Number(movementsAfter?.c) === 1,
    `${movementsAfter?.c} movement(s)`
  );
  check("there is still only one shipment", Number(shipments?.c) === 1);

  const stillOne = await db
    .prepare(`SELECT replacement_order_id FROM return_requests WHERE id = ?`)
    .get(requestId);
  check(
    "the shipment reference has not changed",
    stillOne?.replacement_order_id === shipment?.replacement_order_id
  );

  /* ------------------------------------------------- delivery, then done */

  console.log("\n— the delivery —");
  await act(
    { deliveryStatus: "delivered", notes: "Left with the customer." },
    "Record the delivery",
    "Request Resolved",
    "recording the delivery as delivered"
  );

  const delivered = await db
    .prepare(
      `SELECT replacement_delivery_status, replacement_delivered_at
       FROM return_requests WHERE id = ?`
    )
    .get(requestId);
  check(
    "the delivery is recorded as delivered",
    delivered?.replacement_delivery_status === "delivered"
  );
  check("the time it was delivered is on the record", Boolean(delivered?.replacement_delivered_at));

  await act(
    { notes: "The customer has the replacement." },
    "Mark as Completed",
    "Request Resolved",
    "closing the request"
  );

  /* ------------------------------------------------------ what the customer sees */

  console.log("\n— what the customer can see —");
  await cdp.goto(`${BASE}/account/returns/${requestId}`);
  await sleep(2000);
  const customer = await cdp.evaluate(`(() => {
    const text = document.body.innerText;
    return {
      hasShipment: text.includes('${shipment?.replacement_order_id}'),
      hasCourier: text.includes('Delhivery'),
      hasTracking: text.includes('REP-TRK-556677'),
      hasDispatchDate: text.includes('2026-11-23'),
      hasDelivered: text.includes('Delivered'),
      noInventedCourier: !text.includes('Delhivery') || text.includes('REP-TRK-556677'),
    };
  })()`);
  check("the customer can see the shipment", customer.hasShipment);
  check("the customer can see the courier", customer.hasCourier);
  check("the customer can see the tracking number", customer.hasTracking);
  check("the customer can see the dispatch date", customer.hasDispatchDate);
  check("the customer can see the delivery", customer.hasDelivered);

  await cdp.shot("admin-replacement");

  /* ------------------------------------------------------- the store, restored */

  // The test took a unit off the shelf. It goes back, through the
  // back office's own adjustment, so the store is found as it was.
  console.log("\n— putting the shelf back —");
  const taken = await db
    .prepare(
      `SELECT product_slug, variant_id, quantity_changed FROM inventory_movements
       WHERE reason LIKE ? ORDER BY id DESC LIMIT 1`
    )
    .get(`%${shipment?.replacement_order_id}%`);

  if (taken && typeof stockBefore?.stock === "number") {
    const res = await fetch(`${BASE}/api/admin/inventory/adjust`, {
      method: "POST",
      headers: {
        cookie: `pf_auth=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        productSlug: taken.product_slug,
        variantId: taken.variant_id ?? undefined,
        mode: "set",
        quantity: Number(stockBefore.stock),
        reason: "Stock restored after the test run",
      }),
    });
    check("the shelf was put back", res.status === 200, `status ${res.status}`);

    const now = await db
      .prepare(`SELECT stock FROM variants WHERE id = ?`)
      .get(taken.variant_id);
    check(
      "the stock is where it was found",
      Number(now?.stock) === Number(stockBefore.stock),
      `${stockBefore.stock} → ${now?.stock}`
    );
  }
} finally {
  chrome.kill();
  // The request was made for the test, so it goes when the test is over.
  await db.prepare("DELETE FROM return_events WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_items WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_requests WHERE id = ?").run(requestId);
  await db.prepare("DELETE FROM return_events WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_items WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_requests WHERE id = ?").run(requestId);
  await db.prepare("DELETE FROM return_events WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_items WHERE return_id = ?").run(requestId);
  await db.prepare("DELETE FROM return_requests WHERE id = ?").run(requestId);
  await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  await closeDb();
}

console.log(failures ? `\n${failures} check(s) failed` : "\n✓ every check passed");
if (failures) process.exitCode = 1;
