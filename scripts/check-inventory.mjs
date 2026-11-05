/**
 * The inventory test.
 *
 * Two halves. The first drives the back office's own API: changing a stock
 * level by hand, with a reason, and checking that the change is written
 * down and that the stock cannot go negative.
 *
 * The second places a real order through the shop's own checkout in a
 * browser, and then walks that order through its journey — cancelled,
 * reopened, shipped and cancelled — checking that the stock follows it
 * every step of the way.
 *
 *   node scripts/check-inventory.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { tokenForRole } from "./lib/session.mjs";
import {
  clickByText,
  launchChrome,
  setInput,
} from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9333;

/** The product the order test buys. It has no options of its own. */
const PRODUCT = "dualsense-charging-station";
/** A product that is stocked by its options, each counted separately. */
const WITH_OPTIONS = "dualsense-white";

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const admin = tokenForRole(db, "admin");

/** The stock the product started the run with, so it can be put back. */
const ORIGINAL_STOCK = db
  .prepare("SELECT stock FROM products WHERE slug = ?")
  .get(PRODUCT)?.stock;

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function api(path, { method = "GET", body, cookie = admin } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie: `pf_auth=${cookie}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON — the status is what matters */
  }
  return { status: res.status, body: text, json };
}

async function page(path, cookie = admin) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `pf_auth=${cookie}` },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

/** The stock of one bucket, as the back office counts it. */
async function bucket(productSlug, variantId = null) {
  const { json } = await api("/api/admin/inventory");
  return (
    json.buckets.find(
      (b) => b.product_slug === productSlug && b.variant_id === variantId
    ) ?? null
  );
}

/** The movements recorded for one order. */
async function movementsFor(orderId) {
  const { json } = await api("/api/admin/inventory/movements?limit=100");
  return json.rows.filter((m) => m.order_id === orderId);
}

/* ---------------------------------------------------------- the stock itself */

console.log("\n→ the inventory page and its API");
{
  const p = await page("/admin/inventory");
  check("the inventory page renders", p.status === 200, `status ${p.status}`);
  check(
    "the page shows the stock levels",
    p.body.includes("Stock levels") && p.body.includes("On hand")
  );
  check("the page offers an adjustment", p.body.includes("Adjust stock"));
  check("the page links to the history", p.body.includes("History"));

  const h = await page("/admin/inventory/history");
  check("the history page renders", h.status === 200, `status ${h.status}`);

  const api_ = await api("/api/admin/inventory");
  check("the API answers", api_.status === 200, `status ${api_.status}`);
  check(
    "every bucket carries its own threshold",
    api_.json.buckets.every((b) => typeof b.threshold === "number")
  );
  check(
    "every bucket carries a level",
    api_.json.buckets.every((b) =>
      ["in", "low", "out"].includes(b.level)
    )
  );
  check(
    "a product with options is listed one line per option",
    api_.json.buckets.filter((b) => b.product_slug === WITH_OPTIONS).length ===
      2
  );
  check(
    "a product without options is listed once",
    api_.json.buckets.filter((b) => b.product_slug === PRODUCT).length === 1
  );

  const anon = await fetch(`${BASE}/api/admin/inventory`, {
    redirect: "manual",
  });
  check(
    "an anonymous visitor is turned away",
    anon.status === 401 || anon.status === 403,
    `status ${anon.status}`
  );

  const support = tokenForRole(db, "support");
  const asSupport = await api("/api/admin/inventory", { cookie: support });
  check("support can see the stock", asSupport.status === 200);
  const supportAdjust = await api("/api/admin/inventory/adjust", {
    method: "POST",
    cookie: support,
    body: { productSlug: PRODUCT, mode: "add", quantity: 1, reason: "nope" },
  });
  check(
    "support cannot change a stock level",
    supportAdjust.status === 403,
    `status ${supportAdjust.status}`
  );
}

console.log("\n→ changing a stock level by hand");
{
  const before = await bucket(PRODUCT);

  const noReason = await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: { productSlug: PRODUCT, mode: "add", quantity: 1, reason: "  " },
  });
  check(
    "a change without a reason is refused",
    noReason.status === 400,
    `status ${noReason.status}`
  );

  const tooMany = await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: {
      productSlug: PRODUCT,
      mode: "remove",
      quantity: before.stock + 100,
      reason: "Stock take correction",
    },
  });
  check(
    "a change that would leave the count negative is refused",
    tooMany.status === 409,
    `status ${tooMany.status}`
  );
  const afterTooMany = await bucket(PRODUCT);
  check(
    "the refused change left the stock alone",
    afterTooMany.stock === before.stock,
    `${before.stock} → ${afterTooMany.stock}`
  );

  const added = await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: {
      productSlug: PRODUCT,
      mode: "add",
      quantity: 3,
      reason: "Stock received",
      note: "A pallet arrived",
    },
  });
  check("a change with a reason goes through", added.status === 200, `status ${added.status}`);
  check(
    "the API says what the stock was and what it is now",
    added.json.previous === before.stock &&
      added.json.stock === before.stock + 3,
    `${added.json.previous} → ${added.json.stock}`
  );

  const now = await bucket(PRODUCT);
  check("the stock really changed", now.stock === before.stock + 3);

  const history = await api("/api/admin/inventory/movements?limit=20");
  const movement = history.json.rows.find(
    (m) => m.reason === "Stock received" && m.note === "A pallet arrived"
  );
  check("the change was written down", Boolean(movement));
  if (movement) {
    check(
      "the history says what it was, what changed and what it became",
      movement.previous_stock === before.stock &&
        movement.quantity_changed === 3 &&
        movement.new_stock === before.stock + 3,
      `${movement.previous_stock} → ${movement.new_stock}`
    );
    check("the history keeps the reason", movement.reason === "Stock received");
    check("the history keeps the date", Boolean(movement.created_at));
    check(
      "the history says who made the change",
      movement.user_name === "PlayForge Admin" || movement.user_id !== null
    );
  }

  // Put it back where it was.
  await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: {
      productSlug: PRODUCT,
      mode: "set",
      quantity: before.stock,
      reason: "Stock restored after the test run",
    },
  });
  const restored = await bucket(PRODUCT);
  check("the stock was put back", restored.stock === before.stock);
}

console.log("\n→ options are counted separately");
{
  const options = await api(`/api/admin/products/${WITH_OPTIONS}`);
  const white = options.json.variants.find((v) => v.name === "White");
  const blue = options.json.variants.find((v) => v.name === "Midnight Blue");
  const productBefore = options.json.stock;

  const moved = await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: {
      productSlug: WITH_OPTIONS,
      variantId: white.id,
      mode: "add",
      quantity: 2,
      reason: "Stock received",
    },
  });
  check("an option's stock can be changed", moved.status === 200);

  const after = await api(`/api/admin/products/${WITH_OPTIONS}`);
  const whiteAfter = after.json.variants.find((v) => v.id === white.id);
  const blueAfter = after.json.variants.find((v) => v.id === blue.id);
  check(
    "the option that was changed went up by two",
    whiteAfter.stock === white.stock + 2,
    `${white.stock} → ${whiteAfter.stock}`
  );
  check(
    "the other option was left alone",
    blueAfter.stock === blue.stock,
    `${blue.stock}`
  );
  check(
    "the product's own count was left alone",
    after.json.stock === productBefore,
    `${productBefore}`
  );

  // A product with options cannot be stocked at the product level.
  const productLevel = await api(`/api/admin/products/${WITH_OPTIONS}`, {
    method: "PATCH",
    body: { stock: 99 },
  });
  check(
    "a product with options cannot have its own count set",
    productLevel.status === 409,
    `status ${productLevel.status}`
  );

  // An option cannot be reached through another product.
  const wrongProduct = await api("/api/admin/products/playstation-vr2", {
    method: "PATCH",
    body: { variants: [{ id: white.id, stock: 0 }] },
  });
  check(
    "an option cannot be reached through another product",
    wrongProduct.status === 409,
    `status ${wrongProduct.status}`
  );
  const untouched = await api(`/api/admin/products/${WITH_OPTIONS}`);
  check(
    "the option that was aimed at is untouched",
    untouched.json.variants.find((v) => v.id === white.id).stock ===
      whiteAfter.stock
  );

  await api("/api/admin/inventory/adjust", {
    method: "POST",
    body: {
      productSlug: WITH_OPTIONS,
      variantId: white.id,
      mode: "set",
      quantity: white.stock,
      reason: "Stock restored after the test run",
    },
  });

  // A card for a product with options cannot pick one on the shopper's
  // behalf — it sends them to the product page to choose.
  const shop = await fetch(`${BASE}/shop`).then((r) => r.text());
  check(
    "a card for a product with options asks for an option",
    shop.includes("Choose an option")
  );
  check(
    "a card for a product without options adds it straight away",
    shop.includes("Add to cart")
  );
}

console.log("\n→ the low-stock threshold");
{
  const before = await bucket(PRODUCT);
  const threshold = before.threshold;

  const raised = await api(`/api/admin/products/${PRODUCT}`, {
    method: "PATCH",
    body: { lowStockThreshold: before.stock + 10 },
  });
  check("the threshold can be changed", raised.status === 200);

  const after = await bucket(PRODUCT);
  check(
    "the new threshold is the one the back office shows",
    after.threshold === before.stock + 10,
    `${after.threshold}`
  );
  check(
    "a product at or below its threshold counts as low",
    after.level === "low",
    after.level
  );

  // The catalogue's own filter has to agree with the inventory.
  const lowList = await api("/api/admin/products?stock=low&limit=100");
  check(
    "the catalogue's low-stock filter agrees with the inventory",
    lowList.json.rows.some((p) => p.slug === PRODUCT),
    `${lowList.json.rows.length} low`
  );

  const dashboard = await api("/api/admin/stats");
  check(
    "the dashboard counts the low stock",
    dashboard.json.lowStock >= 1,
    `${dashboard.json.lowStock}`
  );
  const dashPage = await page("/admin");
  check(
    "the dashboard names the product that is low",
    dashPage.body.includes("Running low")
  );

  await api(`/api/admin/products/${PRODUCT}`, {
    method: "PATCH",
    body: { lowStockThreshold: threshold },
  });
  const restored = await bucket(PRODUCT);
  check("the threshold was put back", restored.threshold === threshold);
}

/* ------------------------------------------------------- orders and the stock */

/** The number on the basket button in the header. */
const BAG_COUNT = `(() => {
  const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
  const m = link && link.textContent.match(/(\\d+)/);
  return m ? m[1] : '0';
})()`;

/**
 * Puts a product in the basket.
 *
 * The button only works once the page has hydrated, and a page that is
 * still compiling its JavaScript will swallow the click — so it is
 * clicked again until the basket says something has been added.
 */
async function addToCart(slug) {
  await cdp.goto(`${BASE}/product/${slug}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    await cdp.evaluate(clickByText("Add to cart"));
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const count = await cdp.evaluate(BAG_COUNT);
      if (count !== "0") return count;
    }
  }
  return "0";
}

/**
 * Places the order and waits for the confirmation page.
 *
 * The button submits a server action, so it needs a hydrated page for the
 * same reason the basket button does.
 */
async function placeOrder() {
  await cdp.goto(`${BASE}/checkout`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await cdp.evaluate(setInput("name", "Inventory Tester"));
    await cdp.evaluate(setInput("email", "inventory@example.com"));
    await cdp.evaluate(setInput("phone", "9876543210"));
    await cdp.evaluate(setInput("address1", "12 Palm Grove, Baner"));
    await cdp.evaluate(setInput("city", "Pune"));
    await cdp.evaluate(setInput("state", "Maharashtra"));
    await cdp.evaluate(setInput("pincode", "411045"));
    await sleep(300);
    await cdp.evaluate(clickByText("Place order"));
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const path = await cdp.evaluate("location.pathname");
      if (/^\/order\/PF/.test(path)) {
        const body = await cdp.evaluate("document.body.innerText");
        return (body.match(/PF[A-Z0-9]{6}/) ?? [])[0] ?? null;
      }
    }
  }
  return null;
}

let chrome;
let cdp;
let orderId = null;

try {
  console.log("\n→ an order takes its stock off the shelf");
  const launched = await launchChrome({
    port: PORT,
    // The profile lives outside the project. Chrome keeps files locked while
    // it runs, and a dev server watching the project would try to read them.
    profile: join(tmpdir(), "playforge-inventory-chrome"),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;
  await cdp.send("Network.clearBrowserCookies");
  cdp.on("Runtime.exceptionThrown", (p) =>
    console.log(
      "    · page error:",
      p.exceptionDetails?.exception?.description ??
        p.exceptionDetails?.text ??
        "unknown"
    )
  );
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error" || p.type === "warning") {
      console.log(
        "    · console:",
        (p.args ?? []).map((a) => a.value ?? a.description).join(" ")
      );
    }
  });

  const before = await bucket(PRODUCT);

  const inBasket = await addToCart(PRODUCT);
  check("the product went in the basket", inBasket === "1", `basket ${inBasket}`);

  orderId = await placeOrder();
  check("the order went through", Boolean(orderId), orderId ?? "none");

  if (orderId) {
    const after = await bucket(PRODUCT);
    check(
      "the stock came off the shelf",
      after.stock === before.stock - 1,
      `${before.stock} → ${after.stock}`
    );

    const movements = await movementsFor(orderId);
    const sales = movements.filter((m) => m.movement_type === "sale");
    check(
      "the order wrote exactly one sale movement",
      sales.length === 1,
      `${sales.length} sale movements`
    );
    if (sales[0]) {
      check(
        "the sale movement says what it took",
        sales[0].previous_stock === before.stock &&
          sales[0].quantity_changed === -1 &&
          sales[0].new_stock === before.stock - 1,
        `${sales[0].previous_stock} → ${sales[0].new_stock}`
      );
    }

    console.log("\n→ cancelling gives the stock back");
    const cancelled = await api(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "cancelled" },
    });
    check("the order can be cancelled", cancelled.status === 200, `status ${cancelled.status}`);

    const afterCancel = await bucket(PRODUCT);
    check(
      "the stock went back on the shelf",
      afterCancel.stock === before.stock,
      `${after.stock} → ${afterCancel.stock}`
    );

    const cancelMovements = await movementsFor(orderId);
    check(
      "the cancellation wrote one restock movement",
      cancelMovements.filter((m) => m.movement_type === "restock").length === 1
    );

    console.log("\n→ cancelling twice does not give the stock back twice");
    await api(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "cancelled" },
    });
    const afterSecondCancel = await bucket(PRODUCT);
    check(
      "the stock was not given back a second time",
      afterSecondCancel.stock === before.stock,
      `${afterSecondCancel.stock}`
    );
    check(
      "there is still only one restock movement",
      (await movementsFor(orderId)).filter(
        (m) => m.movement_type === "restock"
      ).length === 1
    );

    console.log("\n→ reopening takes the stock off the shelf again");
    const reopened = await api(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "confirmed" },
    });
    check("the order can be reopened", reopened.status === 200, `status ${reopened.status}`);
    const afterReopen = await bucket(PRODUCT);
    check(
      "the stock came off the shelf again",
      afterReopen.stock === before.stock - 1,
      `${afterCancel.stock} → ${afterReopen.stock}`
    );

    console.log("\n→ a return is not put back into stock until it is checked");
    await api(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "shipped" },
    });
    await api(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "cancelled" },
    });
    const afterReturn = await bucket(PRODUCT);
    check(
      "the stock did not go back on the shelf",
      afterReturn.stock === before.stock - 1,
      `${afterReturn.stock}`
    );

    const pending = await api("/api/admin/inventory");
    check(
      "the return is waiting for a check",
      pending.json.pendingChecks.some((c) => c.order_id === orderId),
      `${pending.json.pendingChecks.length} waiting`
    );
    const pendingPage = await page("/admin/inventory");
    check(
      "the waiting return is on the inventory page",
      pendingPage.body.includes("Returns waiting to be checked")
    );

    const writtenOff = await api(
      `/api/admin/inventory/orders/${orderId}/resolve`,
      {
        method: "POST",
        body: { action: "write_off", reason: "The unit did not come back." },
      }
    );
    check("the return can be settled", writtenOff.status === 200, `status ${writtenOff.status}`);
    const afterWriteOff = await bucket(PRODUCT);
    check(
      "a return that is not restocked leaves the count alone",
      afterWriteOff.stock === before.stock - 1,
      `${afterWriteOff.stock}`
    );
  }
} finally {
  chrome?.kill();
}

/* ------------------------------------------------------------------ cleanup */

console.log("\n→ putting the store back as it was found");
{
  if (typeof ORIGINAL_STOCK === "number") {
    await api("/api/admin/inventory/adjust", {
      method: "POST",
      body: {
        productSlug: PRODUCT,
        mode: "set",
        quantity: ORIGINAL_STOCK,
        reason: "Stock restored after the test run",
      },
    });
    const now = await bucket(PRODUCT);
    check(
      "the stock is back where it was",
      now.stock === ORIGINAL_STOCK,
      `${now.stock}`
    );
  }
  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — inventory test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
