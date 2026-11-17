/**
 * Takes the pictures of the return policy that matter: an order inside
 * the window, an order outside it, and the request form itself.
 *
 *   node scripts/shoot-return-policy.mjs
 *
 * The dev server has to be running on port 3000. The orders it makes
 * are removed again at the end.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import "./lib/env.mjs";
import { launchChrome, shotsDir } from "./lib/browser.mjs";
import { shopDb, tokenForRole } from "./lib/session.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = shotsDir(join(process.cwd(), ".shots", "return-policy"));
const PROFILE = join(process.env.TEMP ?? process.cwd(), "cs-return-policy-profile");

const pool = shopDb();
const stamp = Date.now().toString(36).toUpperCase();
const email = `shoot-return-${stamp}@example.com`;

const { rows: users } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Return Policy Shooter', $1, 'x', 'member') RETURNING id, email`,
  [email]
);
const user = users[0];

const token = randomBytes(32).toString("hex");
await pool.query(
  "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
  [token, user.id, new Date(Date.now() + 3600_000).toISOString()]
);

const { rows: products } = await pool.query(
  `SELECT slug, name, price FROM products
    WHERE listed = 1 AND status = 'published' ORDER BY slug LIMIT 1`
);
const product = products[0];

const daysAgo = (n) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

async function makeOrder(days, tag) {
  const id = `SHO${tag}${randomBytes(3).toString("hex").toUpperCase()}`;
  await pool.query(
    `INSERT INTO orders
       (id, user_id, name, email, phone, address1, city, state, pincode,
        subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES ($1, $2, 'Return Policy Shooter', $3, '+91 90000 00000', '1 Test Street',
             'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'Test Payment', 'delivered', $5)`,
    [id, user.id, email, product.price, daysAgo(days)]
  );
  await pool.query(
    `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
     VALUES ($1, $2, $3, $4, 1, 'settled', 0)`,
    [id, product.slug, product.name, product.price]
  );
  return id;
}

const openOrder = await makeOrder(1, "O");
const shutOrder = await makeOrder(6, "S");

const { chrome, cdp } = await launchChrome({
  port: 9333,
  profile: PROFILE,
  dir: SHOTS,
});

/**
 * Sets the size of the screen the shot is taken at.
 */
async function viewport(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
}

/**
 * Scrolls the page to the first thing that carries the given words.
 */
async function scrollTo(cdp, words) {
  await cdp.evaluate(`(() => {
    const needle = ${JSON.stringify(words)};
    const nodes = Array.from(document.querySelectorAll("h1, h2, h3, p, span"));
    const hit = nodes.find((n) => (n.textContent || "").includes(needle));
    if (hit) hit.scrollIntoView({ block: "center" });
    return Boolean(hit);
  })()`);
  await sleep(400);
}

try {
  await cdp.send("Network.enable");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: token,
    domain: "localhost",
    path: "/",
  });

  console.log("→ the order inside the window");
  await viewport(cdp, 1280, 900, false);
  await cdp.goto(`${BASE}/order/${openOrder}`);
  await sleep(1500);
  await cdp.shot("01-order-inside-window", true);

  console.log("→ the order outside the window");
  await cdp.goto(`${BASE}/order/${shutOrder}`);
  await sleep(1500);
  await cdp.shot("02-order-window-closed", true);

  console.log("→ the request form");
  await cdp.goto(`${BASE}/order/${openOrder}/return`);
  await sleep(1500);
  await cdp.shot("03-request-form", true);

  console.log("→ the order inside the window on a phone");
  await viewport(cdp, 390, 844, true);
  await cdp.goto(`${BASE}/order/${openOrder}`);
  await sleep(1500);
  await scrollTo(cdp, "Return & Replacement Window Active");
  await cdp.shot("04-order-inside-window-phone");

  console.log("→ the order outside the window on a phone");
  await cdp.goto(`${BASE}/order/${shutOrder}`);
  await sleep(1500);
  await scrollTo(cdp, "Return Window Closed");
  await cdp.shot("05-order-window-closed-phone");

  console.log("→ the request form on a phone");
  await cdp.goto(`${BASE}/order/${openOrder}/return`);
  await sleep(1500);
  await scrollTo(cdp, "Send us the evidence");
  await cdp.shot("06-request-form-phone");

  console.log("→ the policy page");
  await viewport(cdp, 1280, 900, false);
  await cdp.goto(`${BASE}/refund-policy`);
  await sleep(1500);
  await cdp.shot("07-policy-page", true);

  // The back office, on a claim that is still missing its evidence.
  const adminToken = await tokenForRole("admin");
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: adminToken,
    domain: "localhost",
    path: "/",
  });

  const claimId = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
  await pool.query(
    `INSERT INTO return_requests
       (id, order_id, user_id, type, status, reason, customer_notes,
        customer_name, customer_email, customer_phone, delivery_date,
        refund_amount, refund_status)
     VALUES ($1, $2, $3, 'replacement', 'requested', 'product_damaged',
             'The unit arrived with a cracked corner along the top edge.',
             'Return Policy Shooter', $4, '+91 90000 00000', $5, $6, 'none')`,
    [
      claimId,
      openOrder,
      user.id,
      email,
      new Date().toISOString().slice(0, 10),
      product.price,
    ]
  );
  await pool.query(
    `INSERT INTO return_items (return_id, order_item_id, product_slug, name, price, quantity)
     VALUES ($1, (SELECT id FROM order_items WHERE order_id = $2), $3, $4, $5, 1)`,
    [claimId, openOrder, product.slug, product.name, product.price]
  );

  console.log("→ the back office, on a claim missing its evidence");
  await viewport(cdp, 1280, 900, false);
  await cdp.goto(`${BASE}/admin/returns/${claimId}`);
  await sleep(2000);
  await cdp.shot("08-admin-claim-missing-evidence", true);

  await pool.query("DELETE FROM return_requests WHERE id = $1", [claimId]);

  console.log(`\nshots written to ${SHOTS}`);
} finally {
  chrome.kill();
  await pool.query("DELETE FROM orders WHERE id = ANY($1::text[])", [
    [openOrder, shutOrder],
  ]);
  await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
  await pool.end();
}
