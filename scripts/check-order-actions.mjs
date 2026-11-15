/**
 * The order actions, the way the back office uses them.
 *
 *   node scripts/check-order-actions.mjs
 *
 * It opens an order in a browser and does what an administrator does:
 *
 *   · the Confirm Order button is there, and the Refund button is greyed
 *     out
 *   · the arrow beside it opens the Cancel Order menu
 *   · Confirm Order opens the shipping form, and the form cannot be sent
 *     without a courier, a method and a tracking number
 *   · saving the details shows them on the order, and on the customer's
 *     own page
 *   · cancelling the order — with a reason — turns the Refund button on
 *   · the refund dialog says what it is about before anything is sent
 *
 * The dev server must be running on port 3000.
 *
 * The order it makes has no gateway payment on it, so the refund can
 * never be sent while this runs: the button that sends it is greyed out
 * and the test does not press it. Nothing is sent to the real payment
 * gateway by this script.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, clickByText, setInput, waitFor } from "./lib/browser.mjs";
import { tokenForRole, deleteToken } from "./lib/session.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9251;

registerTsResolver();
const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { takeStockForOrder } = await import("../src/lib/inventory.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();

/**
 * A product the test can order.
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

/** The order the test works on. */
const orderId = `ACT${randomBytes(4).toString("hex").toUpperCase()}`;
const customerEmail = `actions-${stamp.toLowerCase()}@example.invalid`;

/**
 * Writes an order and takes its stock, the way the shop does.
 */
async function makeOrder(id) {
  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO orders
           (id, user_id, name, email, phone, address1, city, state, pincode,
            subtotal, shipping, total, payment_method, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'cod','confirmed')`
      )
      .run(
        id,
        null,
        "Actions Check",
        customerEmail,
        "9876022697",
        "House no.193",
        "Ludhiana",
        "Punjab",
        "142021",
        200,
        0,
        200
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
        100,
        2,
        taken.backordered
      );
  });
  createdOrders.push(id);
  return id;
}

const createdOrders = [];
await makeOrder(orderId);

const admin = await tokenForRole("admin");

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-orderactions-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: admin,
    domain: "localhost",
    path: "/",
  });

  /* ─────────────────────────────────────────────────────────────── */
  section("1. The order page, as it opens");

  await cdp.goto(`${BASE}/admin/orders/${orderId}`);
  const loaded = await waitFor(cdp, `document.body.innerText.includes('Order actions')`);
  check("the order page opens", Boolean(loaded));

  const buttons = await cdp.evaluate(`
    [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent.trim(),
      disabled: b.disabled,
      label: b.getAttribute('aria-label')
    }))
  `);

  const confirmButton = buttons.find((b) => /confirm order/i.test(b.text));
  check("there is a Confirm Order button", Boolean(confirmButton));
  check("and it is enabled", confirmButton && confirmButton.disabled === false);

  const refundButton = buttons.find((b) => /^refund$/i.test(b.text));
  check("there is a Refund button", Boolean(refundButton));
  check("and it is greyed out", refundButton && refundButton.disabled === true);

  const arrow = buttons.find((b) => b.label === "More order actions");
  check("the button has an arrow beside it", Boolean(arrow));

  /* ─────────────────────────────────────────────────────────────── */
  section("2. The arrow opens the Cancel Order menu");

  await cdp.evaluate(
    `document.querySelector('[aria-label="More order actions"]')?.click()`
  );
  await sleep(400);
  const menu = await waitFor(
    cdp,
    `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Cancel Order')`
  );
  check("the menu opens", Boolean(menu));
  check(
    "and it holds the Cancel Order option",
    await cdp.evaluate(
      `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Cancel Order')`
    )
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("3. Confirm Order opens the shipping form");

  await cdp.evaluate(clickByText("Confirm Order"));
  await sleep(500);

  const form = await waitFor(
    cdp,
    `!!document.querySelector('input[name="courierPartner"]')`
  );
  check("the shipping form opens", Boolean(form));

  const required = await cdp.evaluate(`
    ['courierPartner','shippingMethod','trackingId'].map(name => {
      const el = document.querySelector('[name="' + name + '"]');
      return { name, found: !!el, required: el ? el.required : false };
    })
  `);
  for (const field of required) {
    check(`the ${field.name} field is there`, field.found);
    check(`and it is required`, field.required);
  }

  const methods = await cdp.evaluate(`
    [...document.querySelectorAll('select[name="shippingMethod"] option')].map(o => o.value)
  `);
  check(
    "the shipping method is Surface, Air and Other",
    ["surface", "air", "other"].every((m) => methods.includes(m)),
    methods.join(", ")
  );

  const canSubmitEmpty = await cdp.evaluate(`
    (() => {
      const form = document.querySelector('input[name="courierPartner"]')?.closest('form');
      return form ? form.checkValidity() : null;
    })()
  `);
  check("the form cannot be sent without all three", canSubmitEmpty === false);

  const otherField = await cdp.evaluate(`
    (() => {
      const select = document.querySelector('select[name="shippingMethod"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'other');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
  await sleep(400);
  check(
    "'Other' asks for a shipping method of its own",
    await cdp.evaluate(`!!document.querySelector('input[name="customShippingMethod"]')`)
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("4. The shipping details are saved and shown");

  // The form is opened afresh, so that what is saved is what an
  // administrator would actually type in.
  await cdp.goto(`${BASE}/admin/orders/${orderId}`);
  await waitFor(cdp, `document.body.innerText.includes('Order actions')`);
  await cdp.evaluate(clickByText("Confirm Order"));
  await sleep(500);

  await cdp.evaluate(setInput("courierPartner", "Delhivery"));
  await cdp.evaluate(setInput("trackingId", "AWB-UI-4242"));

  const readyToSend = await cdp.evaluate(`
    (() => {
      const form = document.querySelector('input[name="courierPartner"]')?.closest('form');
      if (!form) return null;
      const method = form.querySelector('select[name="shippingMethod"]');
      return { valid: form.checkValidity(), method: method ? method.value : null };
    })()
  `);
  check(
    "the form is ready to send with the courier and the tracking number",
    readyToSend && readyToSend.valid === true,
    JSON.stringify(readyToSend)
  );

  await cdp.evaluate(clickByText("Confirm & Save"));

  const saved = await waitFor(
    cdp,
    `document.body.innerText.includes('AWB-UI-4242')`,
    { timeout: 40000 }
  );
  check("the details are shown on the order", Boolean(saved));

  const card = await cdp.evaluate(`
    (() => {
      const text = document.body.innerText;
      return {
        courier: text.includes('Delhivery'),
        tracking: text.includes('AWB-UI-4242'),
        shipping: text.includes('Shipping information')
      };
    })()
  `);
  check("the shipping card is there", card.shipping);
  check("it names the courier", card.courier);
  check("and it carries the tracking number", card.tracking);

  const onFile = await getDb()
    .prepare(
      "SELECT courier_partner, shipping_method, tracking_id, status FROM orders WHERE id = ?"
    )
    .get(orderId);
  check("the details are on the order in the database", onFile?.courier_partner === "Delhivery");
  check("and the tracking number is too", onFile?.tracking_id === "AWB-UI-4242");

  /* ─────────────────────────────────────────────────────────────── */
  section("5. The customer can follow their parcel");

  await cdp.goto(`${BASE}/order/${orderId}`);
  await sleep(1500);
  const customerView = await cdp.evaluate(`
    (() => {
      const text = document.body.innerText;
      return {
        courier: text.includes('Delhivery'),
        tracking: text.includes('AWB-UI-4242'),
        track: text.includes('Track your order')
      };
    })()
  `);
  check("the customer sees the courier", customerView.courier);
  check("the customer sees the tracking number", customerView.tracking);
  check("and there is a link to follow it", customerView.track);

  /* ─────────────────────────────────────────────────────────────── */
  section("6. Cancelling asks for a reason");

  await cdp.goto(`${BASE}/admin/orders/${orderId}`);
  await waitFor(cdp, `document.body.innerText.includes('Order actions')`);
  await cdp.evaluate(
    `document.querySelector('[aria-label="More order actions"]')?.click()`
  );
  await sleep(400);
  await cdp.evaluate(clickByText("Cancel Order"));
  await sleep(500);

  const dialog = await waitFor(
    cdp,
    `[...document.querySelectorAll('[role="dialog"]')].some(d => d.innerText.includes('Why are you cancelling'))`
  );
  check("the cancellation asks why", Boolean(dialog));

  const reasons = await cdp.evaluate(`
    [...document.querySelectorAll('input[name="reasonCode"]')].map(r => r.value)
  `);
  check(
    "the reasons are the ones the shop uses",
    ["customer_requested", "out_of_stock", "payment_issue", "incorrect_address", "courier_issue", "other"].every(
      (r) => reasons.includes(r)
    ),
    reasons.join(", ")
  );

  const cancelNeedsAReason = await cdp.evaluate(`
    (() => {
      const form = document.querySelector('input[name="reasonCode"]')?.closest('form');
      return form ? form.checkValidity() : null;
    })()
  `);
  check("it cannot be sent without a reason", cancelNeedsAReason === false);

  await cdp.evaluate(`
    (() => {
      const radio = document.querySelector('input[name="reasonCode"][value="customer_requested"]');
      if (!radio) return 'NOT_FOUND';
      radio.click();
      return radio.checked ? 'CHECKED' : 'FAILED';
    })()
  `);
  await sleep(300);
  await cdp.evaluate(clickByText("Confirm Cancellation"));

  const cancelled = await waitFor(
    cdp,
    `document.body.innerText.includes('Cancelled on')`,
    { timeout: 40000 }
  );
  check("the order is cancelled", Boolean(cancelled));

  const afterCancel = await getDb()
    .prepare(
      "SELECT status, cancellation_reason, cancellation_reason_code, cancelled_at FROM orders WHERE id = ?"
    )
    .get(orderId);
  check("the status is cancelled", afterCancel?.status === "cancelled");
  check("the reason is on the order", afterCancel?.cancellation_reason_code === "customer_requested");
  check("and the moment it happened is too", Boolean(afterCancel?.cancelled_at));

  /* ─────────────────────────────────────────────────────────────── */
  section("7. The refund is only possible once the order is cancelled");

  const afterButtons = await cdp.evaluate(`
    [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent.trim(),
      disabled: b.disabled
    }))
  `);
  const refundNow = afterButtons.find((b) => /^refund$/i.test(b.text));
  check("the Refund button is there", Boolean(refundNow));
  check("and it is now enabled", refundNow && refundNow.disabled === false);

  await cdp.evaluate(clickByText("Refund"));
  await sleep(500);

  const refundDialog = await waitFor(
    cdp,
    `[...document.querySelectorAll('[role="dialog"]')].some(d => d.innerText.includes('Refund this order'))`
  );
  check("the refund dialog opens", Boolean(refundDialog));

  const refundText = await cdp.evaluate(`
    (() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.innerText : '';
    })()
  `);
  check("it says which order it is about", refundText.includes(orderId));
  check("it names the customer", refundText.includes("Actions Check"));
  check("it shows the amount paid", /₹\s?200/.test(refundText));
  check("it shows the payment id", refundText.includes("Payment ID"));
  check("and it offers the full refund", refundText.includes("Confirm Full Refund"));

  const refundDisabled = await cdp.evaluate(`
    (() => {
      const d = document.querySelector('[role="dialog"]');
      const b = [...(d?.querySelectorAll('button') ?? [])].find(x => /Confirm Full Refund/.test(x.textContent));
      return b ? b.disabled : null;
    })()
  `);
  check(
    "and the money cannot be sent for an order with no gateway payment",
    refundDisabled === true
  );

  /* ─────────────────────────────────────────────────────────────── */
  section("8. The endpoints behind it");

  /**
   * Calls the back office's own endpoint.
   */
  async function api(path, { method = "POST", body = null, cookie = admin } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie: `pf_auth=${cookie}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // A page rather than JSON — the status is what matters here.
    }
    return { status: res.status, json, text };
  }

  const apiOrder = `ACT${randomBytes(4).toString("hex").toUpperCase()}`;
  await makeOrder(apiOrder);

  const incomplete = await api(`/api/admin/orders/${apiOrder}/ship`, {
    body: { courierPartner: "Delhivery", shippingMethod: "surface" },
  });
  check("an incomplete shipment is refused", incomplete.status === 400);
  check(
    "and it says what is missing",
    /tracking number/i.test(incomplete.json?.error ?? ""),
    incomplete.json?.error
  );

  const shipped = await api(`/api/admin/orders/${apiOrder}/ship`, {
    body: {
      courierPartner: "Delhivery",
      shippingMethod: "surface",
      trackingId: "AWB-API-1",
    },
  });
  check("a complete shipment is accepted", shipped.status === 200);
  check(
    "and the order comes back with the details on it",
    shipped.json?.order?.courier_partner === "Delhivery" &&
      shipped.json?.order?.tracking_id === "AWB-API-1"
  );

  const noReason = await api(`/api/admin/orders/${apiOrder}/cancel`, {
    body: {},
  });
  check("a cancellation without a reason is refused", noReason.status === 400);
  check(
    "and it says a reason is needed",
    /choose why/i.test(noReason.json?.error ?? ""),
    noReason.json?.error
  );

  const patchNoReason = await api(`/api/admin/orders/${apiOrder}`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  check(
    "and the old endpoint cannot cancel one without a reason either",
    patchNoReason.status === 400,
    `status ${patchNoReason.status}`
  );

  const stillOpen = await getDb()
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(apiOrder);
  check("the order is still open", stillOpen?.status === "confirmed");

  const cancelledApi = await api(`/api/admin/orders/${apiOrder}/cancel`, {
    body: { reasonCode: "customer_requested" },
  });
  check("a cancellation with a reason is accepted", cancelledApi.status === 200);
  check(
    "and the order comes back cancelled",
    cancelledApi.json?.order?.status === "cancelled"
  );

  const refundNoPayment = await api(`/api/admin/orders/${apiOrder}/refund`, {
    body: {},
  });
  check("a refund with no gateway payment is refused", refundNoPayment.status === 400);
  check(
    "and it says the refund has to be paid by hand",
    /by hand/i.test(refundNoPayment.json?.error ?? ""),
    refundNoPayment.json?.error
  );

  const anonymous = await api(`/api/admin/orders/${apiOrder}/ship`, {
    body: { courierPartner: "Delhivery", shippingMethod: "air", trackingId: "X" },
    cookie: null,
  });
  check("and nobody can do it without signing in", anonymous.status === 401);

  /* ─────────────────────────────────────────────────────────────── */
  section("9. The page on a narrow screen");

  for (const width of [320, 375, 768, 1024]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await cdp.goto(`${BASE}/admin/orders/${apiOrder}`);
    await waitFor(cdp, `document.body.innerText.includes('Order actions')`);
    await sleep(400);

    const overflow = await cdp.evaluate(`
      (() => {
        const doc = document.documentElement;
        const widest = [...document.querySelectorAll('body *')]
          .filter(el => el.getBoundingClientRect().right > doc.clientWidth + 1)
          .slice(0, 3)
          .map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0,2).join('.'));
        return { scroll: doc.scrollWidth, client: doc.clientWidth, widest };
      })()
    `);
    check(
      `the back office runs nothing off the side at ${width}px`,
      overflow.scroll <= overflow.client + 1,
      `${overflow.scroll} > ${overflow.client} ${overflow.widest.join(", ")}`
    );

    await cdp.goto(`${BASE}/order/${apiOrder}`);
    await sleep(900);
    const customer = await cdp.evaluate(`
      (() => {
        const doc = document.documentElement;
        return { scroll: doc.scrollWidth, client: doc.clientWidth };
      })()
    `);
    check(
      `and the customer's own page does not either at ${width}px`,
      customer.scroll <= customer.client + 1,
      `${customer.scroll} > ${customer.client}`
    );
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");
  try {
    await cdp.shot("order-actions");
  } catch {
    // The screenshot is a nicety, not a reason to fail the run.
  }
  chrome.kill();

  const db = getDb();
  await withTransaction(async (tx) => {
    for (const id of createdOrders) {
      await tx.prepare("DELETE FROM order_refunds WHERE order_id = ?").run(id);
      await tx.prepare("DELETE FROM notifications WHERE order_id = ?").run(id);
      await tx.prepare("DELETE FROM inventory_movements WHERE order_id = ?").run(id);
      await tx.prepare("DELETE FROM order_items WHERE order_id = ?").run(id);
      await tx.prepare("DELETE FROM orders WHERE id = ?").run(id);
    }
  });
  console.log("  ✓ the fixtures this run made were removed");

  await deleteToken(admin);
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the order actions work in the browser.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
