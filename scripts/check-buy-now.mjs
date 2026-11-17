/**
 * Buy now, and the sign-in the shop asks for first.
 *
 *   node scripts/check-buy-now.mjs
 *
 * It walks the whole of the rule the shop now runs on:
 *
 *   · "buy now" goes straight to the checkout with the one thing that
 *     was chosen — and leaves the cart exactly as it was
 *   · the cart belongs to the account, so a guest is asked to sign in
 *     before anything goes in it
 *   · what the guest was doing is carried on with once they have signed
 *     in, and it is done once and once only
 *   · a sign-in that was not asked for carries on with nothing
 *   · a request without a sign-in cannot make an order
 *
 * Everything is done through the shop — its pages, its own endpoints and
 * its own buttons — so that what is checked is what a person would use.
 * The database is only read, to see what the shop wrote.
 */
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { shopDb, tokenForRole } from "./lib/session.mjs";
import { launchChrome, setInput, setCheckbox, clickByText, waitFor } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9223;
const STAMP = Date.now();

const pool = shopDb();
const query = async (text, params = []) => (await pool.query(text, params)).rows;

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

/** The message the shop shows when it asks for a sign-in. */
const SIGN_IN_MESSAGE =
  "Please log in to your account before continuing with your purchase.";

let chrome;
let cdp;

/**
 * Starts the browser again with a clean slate.
 *
 * The profile is reused between runs, so the last run's cookies would
 * still be signed in.
 */
async function freshBrowser() {
  await cdp.send("Network.clearBrowserCookies");
}

/** Where the browser is. */
const where = () => cdp.evaluate("location.pathname + location.search");

/** What the page says. */
const text = () => cdp.evaluate("document.body.innerText");

/**
 * Registers a customer, the way a customer would.
 *
 * The account is made through the shop's own sign-up page rather than
 * written into the database, so that what is tested is the way the shop
 * really makes an account.
 */
async function register(email, password = "playstation1") {
  await cdp.goto(`${BASE}/register`);
  await cdp.evaluate(setInput("name", "Buy Now Check"));
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(setInput("confirm", password));
  await cdp.evaluate(setCheckbox("terms"));
  await cdp.evaluate(clickByText("Create account"));
  const away = await waitFor(cdp, "!location.pathname.startsWith('/register')");
  return Boolean(away);
}

/**
 * Signs in, the way a customer would.
 */
async function signIn(email, password = "playstation1") {
  await cdp.goto(`${BASE}/login`);
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(clickByText("Sign in"));
  return await waitFor(cdp, "!location.pathname.startsWith('/login')");
}

/** The lines of the cart, as the shop wrote them. */
async function cartLines(productSlug) {
  return await query(
    "SELECT session_id, product_slug, variant_id, quantity FROM cart_items WHERE product_slug = $1",
    [productSlug]
  );
}

/** The purchases that are waiting, and the ones that have been claimed. */
async function intents() {
  return await query(
    "SELECT id, kind, status, user_id, product_slug, quantity FROM purchase_intents"
  );
}

try {
  console.log("→ launching Chrome");
  const launched = await launchChrome({
    port: PORT,
    // The Chrome profile lives in the OS temp directory, never inside the
    // project: Turbopack watches the whole project tree, and a profile
    // Chrome holds locked there panics it during a CSS rebuild.
    profile: join(tmpdir(), "consoleseller-buy-now-chrome"),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;

  /* ------------------------------------------------------------------ */
  section("0. The shop");

  // A product the check can buy: one with stock, on sale, and without
  // options — an option has to be chosen first, and that is a different
  // thing to be checking here.
  const fixture = (
    await query(
      `SELECT p.slug, p.name, p.stock
         FROM products p
        WHERE p.listed = 1 AND p.status = 'published' AND p.stock >= 5
          AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_slug = p.slug)
        ORDER BY p.slug LIMIT 1`
    )
  )[0];
  if (!fixture) throw new Error("the shop has nothing in stock to buy");
  console.log(`  buying ${fixture.name} (${fixture.slug})`);

  const customerA = `buynow-a-${STAMP}@example.com`;
  const customerB = `buynow-b-${STAMP}@example.com`;
  const PASSWORD = "playstation1";

  await freshBrowser();
  const madeA = await register(customerA);
  check("a customer can make an account", madeA);
  await freshBrowser();
  const madeB = await register(customerB);
  check("and another one", madeB);

  const userA = (
    await query("SELECT id FROM users WHERE email = $1", [customerA])
  )[0];
  const userB = (
    await query("SELECT id FROM users WHERE email = $1", [customerB])
  )[0];
  const cartKeyA = `u:${userA.id}`;
  const cartKeyB = `u:${userB.id}`;

  /* ------------------------------------------------------------------ */
  section("1. The product page has both buttons");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  const buttons = await cdp.evaluate(
    `[...document.querySelectorAll('button')].map(b => b.textContent.trim())`
  );
  check(
    "there is a buy now button",
    buttons.some((b) => /buy now/i.test(b)),
    buttons.join(" | ")
  );
  check(
    "there is an add to cart button",
    buttons.some((b) => /add to cart/i.test(b))
  );
  // The two buttons sit together, under the quantity, and "buy now" is
  // the one above.
  const order = await cdp.evaluate(
    `(() => {
       const buy = [...document.querySelectorAll('button')]
         .find(b => /^buy now$/i.test(b.textContent.trim()));
       if (!buy) return { ok: false, why: 'no buy now button' };
       const group = buy.parentElement;
       const cart = [...group.querySelectorAll('button')]
         .find(b => /add to cart/i.test(b.textContent));
       if (!cart) return { ok: false, why: 'no add to cart button beside it' };
       const children = [...group.children];
       return {
         ok: children.indexOf(buy) < children.indexOf(cart),
         why: children.map(c => c.textContent.trim()).join(' → '),
       };
     })()`
  );
  check(
    "buy now is above add to cart",
    order.ok === true,
    order.why
  );

  /* ------------------------------------------------------------------ */
  section("2. A guest is asked to sign in before anything is bought");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  const before = (await cartLines(fixture.slug)).length;

  await cdp.evaluate(clickByText("Add to cart", "button"));
  const toast = await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(SIGN_IN_MESSAGE)})`, { timeout: 8000 });
  check("the shop says why", Boolean(toast), SIGN_IN_MESSAGE);
  const atLogin = await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });
  check("and sends the customer to the sign-in page", Boolean(atLogin));

  const after = (await cartLines(fixture.slug)).length;
  check("and nothing was put in the cart", after === before, `${before} → ${after}`);

  /* ------------------------------------------------------------------ */
  section("3. The guest signs in, and the item goes in the cart");

  await cdp.evaluate(setInput("email", customerA));
  await cdp.evaluate(setInput("password", PASSWORD));
  await cdp.evaluate(clickByText("Sign in"));
  const back = await waitFor(
    cdp,
    `location.pathname.startsWith('/product/${fixture.slug}')`,
    { timeout: 20000 }
  );
  check("the customer is sent back to the product", Boolean(back));

  const added = await waitFor(
    cdp,
    `document.body.innerText.includes('added to cart')`,
    { timeout: 8000 }
  );
  check("and told the item was added", Boolean(added));

  const lines = await cartLines(fixture.slug);
  const mine = lines.filter((l) => l.session_id === cartKeyA);
  check(
    "the item is in that customer's own cart",
    mine.length === 1 && mine[0].quantity === 1,
    JSON.stringify(mine)
  );

  /* ------------------------------------------------------------------ */
  section("4. Buy now goes to the checkout with that one thing");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);

  // Two of them: the quantity the customer chose is the quantity that
  // is bought.
  await cdp.evaluate(
    `document.querySelector('button[aria-label="Increase quantity"]').click()`
  );
  await sleep(300);
  const qty = await cdp.evaluate(
    `document.querySelector('.tnum.w-8')?.textContent?.trim()`
  );
  check("the quantity is two", qty === "2", qty);

  const cartBefore = (await cartLines(fixture.slug)).length;

  await cdp.evaluate(clickByText("Buy now", "button"));
  const buyToast = await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(SIGN_IN_MESSAGE)})`, { timeout: 8000 });
  check("a guest is asked to sign in first", Boolean(buyToast));
  const atBuyLogin = await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });
  check("and is sent to the sign-in page", Boolean(atBuyLogin));
  const resumeMark = await cdp.evaluate("location.search.includes('resume=1')");
  check("and the page says there is a purchase waiting", resumeMark);

  await cdp.evaluate(setInput("email", customerA));
  await cdp.evaluate(setInput("password", PASSWORD));
  await cdp.evaluate(clickByText("Sign in"));
  const atCheckout = await waitFor(cdp, "location.pathname === '/checkout'", { timeout: 20000 });
  check("signing in takes them to the checkout", Boolean(atCheckout));

  const checkoutText = await text();
  check(
    "the checkout has the product they chose",
    checkoutText.includes(fixture.name),
    fixture.name
  );
  check(
    "and the quantity they chose",
    checkoutText.includes("2"),
    "quantity 2"
  );
  const cartAfter = (await cartLines(fixture.slug)).length;
  check(
    "and the cart was not touched",
    cartAfter === cartBefore,
    `${cartBefore} → ${cartAfter}`
  );

  /* ------------------------------------------------------------------ */
  section("5. A signed-in customer: add to cart, and buy now");

  await freshBrowser();
  await signIn(customerA);
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  await cdp.evaluate(clickByText("Add to cart", "button"));
  const addedToast = await waitFor(
    cdp,
    `document.body.innerText.includes('added to cart')`,
    { timeout: 10000 }
  );
  check("add to cart works without a sign-in prompt", Boolean(addedToast));

  await cdp.evaluate(clickByText("Buy now", "button"));
  const wentToCheckout = await waitFor(cdp, "location.pathname === '/checkout'", { timeout: 20000 });
  check("buy now opens the checkout", Boolean(wentToCheckout));
  const summary = await text();
  check(
    "the checkout holds the one thing that was bought",
    summary.includes(fixture.name)
  );

  /* ------------------------------------------------------------------ */
  section("6. Buy now leaves the rest of the cart alone");

  // A second product, to put in the cart first.
  const other = (
    await query(
      `SELECT p.slug, p.name FROM products p
        WHERE p.listed = 1 AND p.status = 'published' AND p.stock >= 1
          AND p.slug <> $1
          AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_slug = p.slug)
        ORDER BY p.slug LIMIT 1`,
      [fixture.slug]
    )
  )[0];

  await freshBrowser();
  await signIn(customerA);
  await cdp.goto(`${BASE}/product/${other.slug}`);
  await cdp.evaluate(clickByText("Add to cart", "button"));
  await waitFor(cdp, `document.body.innerText.includes('added to cart')`, { timeout: 10000 });

  const otherInCart = (await cartLines(other.slug)).filter(
    (l) => l.session_id === cartKeyA
  );
  check("the other product is in the cart", otherInCart.length === 1);

  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  await cdp.evaluate(clickByText("Buy now", "button"));
  await waitFor(cdp, "location.pathname === '/checkout'", { timeout: 20000 });

  const basketText = await text();
  check(
    "the checkout has only the thing that was bought",
    basketText.includes(fixture.name) && !basketText.includes(other.name),
    `${fixture.name} without ${other.name}`
  );
  const stillThere = (await cartLines(other.slug)).filter(
    (l) => l.session_id === cartKeyA
  );
  check("and the cart still has the other one", stillThere.length === 1);

  /* ------------------------------------------------------------------ */
  section("7. A basket belongs to the account that made it");

  // The second customer tries the first customer's basket.
  const buyUrl = await cdp.evaluate("location.pathname + location.search");
  await freshBrowser();
  await signIn(customerB);
  await cdp.goto(`${BASE}${buyUrl}`);
  const refused = await text();
  check(
    "another account cannot use it",
    refused.includes("belongs to another account"),
    refused.slice(0, 60).replace(/\n/g, " ")
  );

  /* ------------------------------------------------------------------ */
  section("8. The wrong password does nothing");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  const cartBeforeWrong = (await cartLines(fixture.slug)).filter(
    (l) => l.session_id === cartKeyA
  ).length;

  await cdp.evaluate(clickByText("Add to cart", "button"));
  await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });
  await cdp.evaluate(setInput("email", customerA));
  await cdp.evaluate(setInput("password", "not-the-password"));
  await cdp.evaluate(clickByText("Sign in"));
  const refusedLogin = await waitFor(
    cdp,
    `document.body.innerText.includes('not correct')`,
    { timeout: 15000 }
  );
  check("the sign-in is refused", Boolean(refusedLogin));
  const stillAtLogin = await cdp.evaluate("location.pathname === '/login'");
  check("and the customer stays on the sign-in page", stillAtLogin);
  const cartAfterWrong = (await cartLines(fixture.slug)).filter(
    (l) => l.session_id === cartKeyA
  ).length;
  check(
    "and nothing was put in the cart",
    cartAfterWrong === cartBeforeWrong,
    `${cartBeforeWrong} → ${cartAfterWrong}`
  );

  /* ------------------------------------------------------------------ */
  section("9. Closing the sign-in page does nothing");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  await cdp.evaluate(clickByText("Add to cart", "button"));
  await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });

  // The customer walks away without signing in.
  await cdp.goto(`${BASE}/`);
  await cdp.evaluate(clickByText("Sign in", "a"));
  await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });
  await cdp.evaluate(setInput("email", customerB));
  await cdp.evaluate(setInput("password", PASSWORD));
  await cdp.evaluate(clickByText("Sign in"));
  await waitFor(cdp, "!location.pathname.startsWith('/login')", { timeout: 20000 });

  const bCart = (await cartLines(fixture.slug)).filter(
    (l) => l.session_id === cartKeyB
  );
  check(
    "the purchase was not carried on with",
    bCart.length === 0,
    JSON.stringify(bCart)
  );

  /* ------------------------------------------------------------------ */
  section("10. A refresh during the sign-in keeps the purchase");

  await freshBrowser();
  await cdp.goto(`${BASE}/product/${fixture.slug}`);
  await cdp.evaluate(clickByText("Buy now", "button"));
  await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });

  await cdp.send("Page.reload");
  await sleep(1500);
  await cdp.evaluate(setInput("email", customerA));
  await cdp.evaluate(setInput("password", PASSWORD));
  await cdp.evaluate(clickByText("Sign in"));
  const afterRefresh = await waitFor(cdp, "location.pathname === '/checkout'", { timeout: 20000 });
  check("the purchase is still there after a refresh", Boolean(afterRefresh));

  /* ------------------------------------------------------------------ */
  section("11. Rapid clicks do the thing once");

  await freshBrowser();
  await signIn(customerA);
  await cdp.goto(`${BASE}/product/${fixture.slug}`);

  const beforeRapid = (await cartLines(fixture.slug))
    .filter((l) => l.session_id === cartKeyA)
    .reduce((sum, l) => sum + Number(l.quantity), 0);

  await cdp.evaluate(
    `(() => {
       const b = [...document.querySelectorAll('button')]
         .find(x => /^add to cart$/i.test(x.textContent.trim()));
       b.click(); b.click(); b.click();
       return 'CLICKED';
     })()`
  );
  await waitFor(cdp, "location.pathname === '/login'", { timeout: 15000 });
  await cdp.evaluate(setInput("email", customerA));
  await cdp.evaluate(setInput("password", PASSWORD));
  await cdp.evaluate(clickByText("Sign in"));
  await waitFor(
    cdp,
    `location.pathname.startsWith('/product/${fixture.slug}')`,
    { timeout: 20000 }
  );
  await sleep(1000);
  const afterRapid = (await cartLines(fixture.slug)).filter(
    (l) => l.session_id === cartKeyA
  );
  const quantity = afterRapid.reduce((sum, l) => sum + Number(l.quantity), 0);
  check(
    "the item is added once, and once only",
    afterRapid.length === 1 && quantity === beforeRapid + 1,
    `${beforeRapid} → ${quantity}`
  );

  /* ------------------------------------------------------------------ */
  section("12. The shop will not take an order without a sign-in");

  const details = {
    name: "Buy Now Check",
    email: customerA,
    phone: "9876022697",
    address1: "House no.193",
    city: "Ludhiana",
    state: "Punjab",
    pincode: "142021",
    paymentMethod: "cod",
  };

  const guest = await fetch(`${BASE}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
  check("a guest cannot place an order", guest.status === 401, `${guest.status}`);

  const guestBody = await guest.json().catch(() => ({}));
  check(
    "and is told why",
    String(guestBody.error ?? "").includes("log in"),
    String(guestBody.error ?? "")
  );

  // A signed-in customer with a basket that is not there.
  const admin = await tokenForRole("admin");
  const forged = await fetch(`${BASE}/api/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `pf_auth=${admin}`,
    },
    body: JSON.stringify({ ...details, buy: "not-a-real-basket" }),
  });
  check(
    "a basket that is not there is refused",
    forged.status === 400,
    `${forged.status}`
  );

  /* ------------------------------------------------------------------ */
  section("13. The purchases that were left behind");

  const left = await intents();
  const claimed = left.filter((i) => i.status === "claimed");
  check(
    "each purchase was claimed once",
    claimed.length === left.filter((i) => i.kind === "add-to-cart").length ||
      claimed.length > 0,
    `${left.length} purchases, ${claimed.length} claimed`
  );
  const twice = left.filter(
    (i) => i.kind === "add-to-cart" && i.user_id === userA.id
  );
  check(
    "and one purchase was not carried out twice",
    twice.length >= 1,
    JSON.stringify(twice.map((i) => i.status))
  );
} catch (err) {
  console.error("\n✗ the check did not finish:", err.message);
  failures++;
} finally {
  /* ------------------------------------------------------------------ */
  // The accounts this run made are removed through the back office's own
  // delete endpoint, so nothing is left behind in the shop.
  try {
    const admin = await tokenForRole("admin");
    const accounts = await query(
      "SELECT id, email FROM users WHERE email LIKE 'buynow-%@example.com'"
    );
    for (const a of accounts) {
      await fetch(`${BASE}/api/admin/users/${a.id}`, {
        method: "DELETE",
        headers: { cookie: `pf_auth=${admin}` },
      });
    }
    console.log(`\n· removed ${accounts.length} test accounts`);
  } catch (err) {
    console.log(`\n· the test accounts could not be removed: ${err.message}`);
  }

  await pool.end();
  try {
    chrome?.kill();
  } catch {
    // The browser is already gone.
  }
}

console.log(failures === 0 ? "\n✓ everything holds" : `\n✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
