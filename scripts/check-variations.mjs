/**
 * The variations test.
 *
 * A product varies by its attributes — colour, edition, storage, the models
 * it works with, what is in the box — and each combination of their values
 * is one option that can be bought on its own.
 *
 * The first half drives the back office's own API: adding an option,
 * refusing a second one with the same values, editing one, and taking one
 * away. The second half is a shopper's: the product page shows what the
 * product can be bought as, the price and the photograph follow the choice,
 * and an option that is not on the shelf cannot be bought — unless the store
 * takes backorders.
 *
 *   node scripts/check-variations.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { tokenForRole } from "./lib/session.mjs";
import { clickByText, launchChrome, setInput } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9334;

/**
 * The product the options are put on.
 *
 * A product that does not vary yet, so the test can give it options and
 * take them away again without touching anything the shop relies on.
 */
const HOST = "dualsense-charging-station";

/** The five kinds of variation a console shop sells. */
const ATTRIBUTES = {
  Colour: ["White", "Black"],
  Edition: ["Standard", "Pro"],
  Storage: ["64GB"],
  "Compatible models": ["PS5"],
  Bundle: ["Console only"],
};

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const admin = tokenForRole(db, "admin");

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

/** The product, as the back office sees it. */
async function host() {
  const { json } = await api(`/api/admin/products/${HOST}`);
  return json;
}

/** The options the product has. */
async function options() {
  return (await host()).variants ?? [];
}

/** The stock the product started the run with, so it can be put back. */
const STARTING_STOCK = db
  .prepare("SELECT stock FROM products WHERE slug = ?")
  .get(HOST)?.stock;

/* ------------------------------------------------------------ the options */

console.log("\n→ what the product varies by");
{
  const saved = await api(`/api/admin/products/${HOST}/attributes`, {
    method: "PATCH",
    body: { attributes: ATTRIBUTES },
  });
  check("the attributes can be saved", saved.status === 200, `status ${saved.status}`);
  check(
    "they come back as they were saved",
    JSON.stringify(saved.json?.attributes) === JSON.stringify(ATTRIBUTES),
    JSON.stringify(saved.json?.attributes)
  );

  const page = await api(`/admin/products/${HOST}`);
  check("the product page offers the variations", page.status === 200);
  check(
    "the page shows the attributes",
    page.body.includes("Variations") && page.body.includes("Colour")
  );
}

console.log("\n→ adding an option");
let firstId = null;
let secondId = null;
{
  const white = {
    Colour: "White",
    Edition: "Standard",
    Storage: "64GB",
    "Compatible models": "PS5",
    Bundle: "Console only",
  };
  const black = { ...white, Colour: "Black" };

  const created = await api(`/api/admin/products/${HOST}/variants`, {
    method: "POST",
    body: {
      attributes: white,
      price: 3499,
      mrp: 4499,
      stock: 7,
      lowStockThreshold: 2,
    },
  });
  check("an option can be added", created.status === 201, `status ${created.status}`);
  firstId = created.json?.id ?? null;

  check(
    "the option is named after its values",
    created.json?.name === "White / Standard / 64GB / PS5 / Console only",
    created.json?.name
  );
  check(
    "the option has a code of its own",
    typeof created.json?.sku === "string" && created.json.sku.length > 0,
    created.json?.sku
  );
  check("the option has its own stock", created.json?.stock === 7);
  check("the option has its own price", created.json?.price === 3499);
  check("the option has its own MRP", created.json?.mrp === 4499);
  check("the option keeps its values", created.json?.attributes?.Colour === "White");

  const duplicate = await api(`/api/admin/products/${HOST}/variants`, {
    method: "POST",
    body: { attributes: white, price: 3499, mrp: 4499, stock: 1 },
  });
  check(
    "the same values twice is refused",
    duplicate.status === 409,
    `status ${duplicate.status}`
  );
  check(
    "the refusal says why",
    /already has an option/i.test(duplicate.json?.error ?? ""),
    duplicate.json?.error
  );

  const other = await api(`/api/admin/products/${HOST}/variants`, {
    method: "POST",
    body: { attributes: black, price: 3999, mrp: 4999, stock: 0 },
  });
  check("a different combination is allowed", other.status === 201, `status ${other.status}`);
  secondId = other.json?.id ?? null;
  check("the second option has a code of its own too", other.json?.sku !== created.json?.sku);
}

console.log("\n→ changing an option");
{
  const before = await options();
  const white = before.find((v) => v.id === firstId);

  const changed = await api(`/api/admin/products/${HOST}/variants/${firstId}`, {
    method: "PATCH",
    body: {
      price: 3699,
      mrp: 4799,
      stock: 12,
      lowStockThreshold: 4,
      barcode: "8901234567890",
      sku: "ZZ-VAR-TEST-001",
    },
  });
  check("an option can be changed", changed.status === 200, `status ${changed.status}`);
  check("the new price is saved", changed.json?.price === 3699);
  check("the new MRP is saved", changed.json?.mrp === 4799);
  check("the new stock is saved", changed.json?.stock === 12);
  check("the new threshold is saved", changed.json?.low_stock_threshold === 4);
  check("the barcode is saved", changed.json?.barcode === "8901234567890");
  check("the code is saved", changed.json?.sku === "ZZ-VAR-TEST-001");
  check("the values are kept", changed.json?.attributes?.Colour === "White");

  // The stock change goes through the inventory, so it is written down.
  const history = await api(
    "/api/admin/inventory/movements?product=" + encodeURIComponent(HOST) + "&limit=50"
  );
  const movement = history.json.rows.find(
    (m) => m.stock_key === `v:${firstId}` && m.quantity_changed === 5
  );
  check(
    "the stock change was written down",
    Boolean(movement),
    movement ? `${movement.previous_stock} → ${movement.new_stock}` : "no movement"
  );
  check(
    "the movement says why",
    movement ? /variation editor/i.test(movement.reason) : false,
    movement?.reason
  );

  // A code that is already in use is refused.
  const clashSku = await api(`/api/admin/products/${HOST}/variants/${secondId}`, {
    method: "PATCH",
    body: { sku: "ZZ-VAR-TEST-001" },
  });
  check(
    "a code already in use is refused",
    clashSku.status === 409,
    `status ${clashSku.status}`
  );

  // So is a barcode.
  const clashBarcode = await api(
    `/api/admin/products/${HOST}/variants/${secondId}`,
    { method: "PATCH", body: { barcode: "8901234567890" } }
  );
  check(
    "a barcode already in use is refused",
    clashBarcode.status === 409,
    `status ${clashBarcode.status}`
  );

  // The option must still belong to its own product.
  const wrongProduct = await api(
    "/api/admin/products/playstation-vr2/variants/" + firstId,
    { method: "PATCH", body: { price: 1 } }
  );
  check(
    "an option cannot be reached through another product",
    wrongProduct.status === 404 || wrongProduct.status === 409,
    `status ${wrongProduct.status}`
  );
}

console.log("\n→ the product page");
{
  const page = await fetch(`${BASE}/product/${HOST}`).then((r) => r.text());
  check("the page shows the attribute", page.includes("Colour"));
  check("the page shows the values", page.includes("White") && page.includes("Black"));
  check("the page shows the other kinds too", page.includes("Edition") && page.includes("Bundle"));
  check(
    "the price shown is the chosen option's",
    page.includes("3,699") || page.includes("3,499")
  );
}

/* The sold-out option is kept until the shopper's half of the test has
   used it, so it is taken away at the end instead. */

/* ------------------------------------------------------------- purchasing */

let chrome;
let cdp;

/**
 * Waits for the page to reach a state.
 *
 * The page has to be hydrated before a click does anything, and a page that
 * is still compiling its JavaScript swallows the click.
 */
async function until(expression, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdp.evaluate(expression)) return true;
    await sleep(300);
  }
  return false;
}

try {
  console.log("\n→ buying an option");
  {
    const launched = await launchChrome({
      port: PORT,
      // The profile lives outside the project: Chrome keeps files locked
      // while it runs, and a dev server watching the project would try to
      // read them.
      profile: join(tmpdir(), "playforge-variations-chrome"),
      dir: join(ROOT, ".shots"),
    });
    chrome = launched.chrome;
    cdp = launched.cdp;
    await cdp.send("Network.clearBrowserCookies");

    await cdp.goto(`${BASE}/product/${HOST}`);

    // The page has to have finished rendering before anything is clicked.
    const ready = await until(
      "document.body.innerText.toLowerCase().includes('colour')"
    );
    check("the page offers the options", ready);

    // The sold-out option can be looked at, but not bought.
    await cdp.evaluate(clickByText("Black"));
    const soldOut = await until(
      "document.body.innerText.includes('Out of stock')"
    );
    check("the option that is not on the shelf says so", soldOut);

    const disabledWhenOut = await cdp.evaluate(`
      (() => {
        // The big button in the purchase panel, not the ones on the
        // related products further down the page.
        const btn = document.querySelector('button.btn-lg');
        return btn ? btn.disabled : 'NO BUTTON';
      })()
    `);
    check(
      "an option that is not on the shelf cannot be bought",
      disabledWhenOut === true,
      String(disabledWhenOut)
    );

    // The one that is on the shelf can.
    await cdp.evaluate(clickByText("White"));
    const inStock = await until(
      "!document.body.innerText.includes('Out of stock')"
    );
    check("the option that is on the shelf does not", inStock);

    const enabledWhenIn = await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('button.btn-lg');
        return btn ? btn.disabled : 'NO BUTTON';
      })()
    `);
    check(
      "an option that is on the shelf can be bought",
      enabledWhenIn === false,
      String(enabledWhenIn)
    );

    // The price shown follows the choice.
    await cdp.evaluate(clickByText("White"));
    await sleep(500);
    const whiteText = await cdp.evaluate("document.body.innerText");
    await cdp.evaluate(clickByText("Black"));
    await sleep(500);
    const blackText = await cdp.evaluate("document.body.innerText");
    check(
      "the price shown follows the choice",
      whiteText.includes("3,699") && blackText.includes("3,999"),
      `white: ${/₹[\d,]+/.exec(whiteText)?.[0]}, black: ${/₹[\d,]+/.exec(blackText)?.[0]}`
    );

    // Back to the one that is on the shelf, to buy it.
    await cdp.evaluate(clickByText("White"));
    await sleep(500);

    await cdp.evaluate(clickByText("Add to cart"));
    await sleep(1500);
    const badge = await cdp.evaluate(`
      (() => {
        const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
        const m = link && link.textContent.match(/(\\d+)/);
        return m ? m[1] : '0';
      })()
    `);
    check("the option went in the basket", badge === "1", `basket ${badge}`);

    // The basket must carry the option, not the product.
    await cdp.goto(`${BASE}/cart`);
    const cartText = await cdp.evaluate("document.body.innerText");
    check(
      "the basket shows the option that was chosen",
      /White/.test(cartText),
      cartText.split("\n").find((l) => /White/.test(l)) ?? ""
    );

    // And the order.
    await cdp.goto(`${BASE}/checkout`);
    await cdp.evaluate(setInput("name", "Variation Tester"));
    await cdp.evaluate(setInput("email", "variation@example.com"));
    await cdp.evaluate(setInput("phone", "9876543210"));
    await cdp.evaluate(setInput("address1", "12 Palm Grove, Baner"));
    await cdp.evaluate(setInput("city", "Pune"));
    await cdp.evaluate(setInput("state", "Maharashtra"));
    await cdp.evaluate(setInput("pincode", "411045"));
    await sleep(300);
    await cdp.evaluate(clickByText("Place order"));
    await sleep(3500);

    const orderBody = await cdp.evaluate("document.body.innerText");
    const orderId = (orderBody.match(/PF[A-Z0-9]{6}/) ?? [])[0] ?? null;
    check("the order went through", Boolean(orderId), orderId ?? "none");

    if (orderId) {
      const order = await api(`/api/admin/orders/${orderId}`);
      const line = order.json?.items?.[0];
      check("the order carries the option", line?.variant_name === "White / Standard / 64GB / PS5 / Console only", line?.variant_name);
      check("the order prices the option", line?.price === 3699, `${line?.price}`);
      check("the option's stock came off the shelf", line?.stock_state === "deducted", line?.stock_state);

      const after = await options();
      const white = after.find((v) => v.id === firstId);
      check("the option's stock went down by one", white?.stock === 11, `${white?.stock}`);

      // The sold-out option cannot be bought with backorders off.
      await cdp.goto(`${BASE}/product/${HOST}`);
      await until("document.body.innerText.toLowerCase().includes('colour')");
      await cdp.evaluate(clickByText("Black"));
      await until("document.body.innerText.includes('Out of stock')");
      const disabled = await cdp.evaluate(`
        (() => {
          const btn = document.querySelector('button.btn-lg');
          return btn ? btn.disabled : 'NO BUTTON';
        })()
      `);
      check(
        "an option that is not on the shelf cannot be bought",
        disabled === true,
        String(disabled)
      );

      /* ------------------------------------------------- backorders */

      console.log("\n→ when the store takes backorders");
      const policy = await api("/api/admin/settings", {
        method: "PATCH",
        body: { backorderPolicy: "allow" },
      });
      check(
        "the backorder policy can be changed",
        policy.status === 200,
        `status ${policy.status}`
      );

      await cdp.goto(`${BASE}/product/${HOST}`);
      await until("document.body.innerText.toLowerCase().includes('colour')");
      await cdp.evaluate(clickByText("Black"));
      await until("document.body.innerText.includes('Sold out')");

      const enabledOnBackorder = await cdp.evaluate(`
        (() => {
          const btn = document.querySelector('button.btn-lg');
          return btn ? btn.disabled : 'NO BUTTON';
        })()
      `);
      check(
        "with backorders on, the option can be bought",
        enabledOnBackorder === false,
        String(enabledOnBackorder)
      );

      await cdp.evaluate(clickByText("Add to cart"));
      await sleep(1500);
      await cdp.goto(`${BASE}/checkout`);
      await cdp.evaluate(setInput("name", "Backorder Tester"));
      await cdp.evaluate(setInput("email", "backorder@example.com"));
      await cdp.evaluate(setInput("phone", "9876543210"));
      await cdp.evaluate(setInput("address1", "12 Palm Grove, Baner"));
      await cdp.evaluate(setInput("city", "Pune"));
      await cdp.evaluate(setInput("state", "Maharashtra"));
      await cdp.evaluate(setInput("pincode", "411045"));
      await sleep(300);
      await cdp.evaluate(clickByText("Place order"));
      await sleep(3500);

      const backorderBody = await cdp.evaluate("document.body.innerText");
      const backorderId =
        (backorderBody.match(/PF[A-Z0-9]{6}/) ?? [])[0] ?? null;
      check("the order went through", Boolean(backorderId), backorderId ?? "none");

      if (backorderId) {
        const order = await api(`/api/admin/orders/${backorderId}`);
        const line = order.json?.items?.[0];
        check(
          "the order records what is on backorder",
          line?.backordered === 1,
          `${line?.backordered}`
        );
        check(
          "the order carries the option that was chosen",
          line?.variant_name === "Black / Standard / 64GB / PS5 / Console only",
          line?.variant_name
        );
      }

      // And back to no backorders.
      const reset = await api("/api/admin/settings", {
        method: "PATCH",
        body: { backorderPolicy: "none" },
      });
      check("the policy can be put back", reset.status === 200);
    }
  }
} finally {
  chrome?.kill();
}

/* ------------------------------------------------------------------ cleanup */

console.log("\n→ removing an option");
{
  const removed = await api(`/api/admin/products/${HOST}/variants/${secondId}`, {
    method: "DELETE",
  });
  check("an option can be removed", removed.status === 200, `status ${removed.status}`);

  const again = await api(`/api/admin/products/${HOST}/variants/${secondId}`, {
    method: "DELETE",
  });
  check(
    "removing it twice is refused",
    again.status === 409 || again.status === 404,
    `status ${again.status}`
  );

  const left = await options();
  check("the other option is still there", left.length === 1, `${left.length} left`);
}

console.log("\n→ putting the store back as it was found");
{
  if (firstId) {
    await api(`/api/admin/products/${HOST}/variants/${firstId}`, {
      method: "DELETE",
    });
  }
  await api(`/api/admin/products/${HOST}/attributes`, {
    method: "PATCH",
    body: { attributes: {} },
  });
  const left = await options();
  check("the options are gone", left.length === 0, `${left.length} left`);

  const product = await host();
  check(
    "the product is stocked as itself again",
    product.stock === STARTING_STOCK,
    `${product.stock}`
  );
  check(
    "the product does not vary any more",
    Object.keys(product.attributes ?? {}).length === 0,
    JSON.stringify(product.attributes)
  );

  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — variations test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
