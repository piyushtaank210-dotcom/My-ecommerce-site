/**
 * Dependency-free end-to-end check + screenshots, driving Chrome over CDP.
 * Node 24 ships a global WebSocket, so no puppeteer needed.
 *
 *   npm run e2e                       # against http://localhost:3000
 *   BASE_URL=http://localhost:3001 npm run e2e
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import {
  clickByText,
  launchChrome,
  setCheckbox,
  setInput,
} from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, ".shots");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9222;

mkdirSync(SHOTS, { recursive: true });

/* -------------------------------------------------------------------- main */
let chrome;
let cdp;
let exitCode = 0;
const STAMP = Date.now();
const ACCOUNT = {
  name: "Arjun Mehta",
  email: `e2e${STAMP}@example.com`,
  password: "playstation1",
};

/**
 * The stock the suite found.
 *
 * Placing an order takes a unit off the shelf, so a run of the suite would
 * slowly sell the demo store dry. The stock is put back at the end, through
 * the back office's own inventory endpoint, and the store is left exactly as
 * it was found.
 */
const stockFound = { products: [], variants: [] };
{
  const store = new DatabaseSync(join(ROOT, "data/store.db"));
  stockFound.products = store.prepare("SELECT slug, stock FROM products").all();
  stockFound.variants = store
    .prepare("SELECT id, product_slug, stock FROM variants")
    .all();
  store.close();
}

/**
 * The orders this run placed.
 *
 * They are cancelled at the end, through the back office's own endpoint, so
 * the stock goes back the way it went out — and the order and the stock
 * agree with each other afterwards. Putting the stock back by hand would
 * leave the order still marked as holding a unit it no longer holds.
 */
const placedOrders = [];

/**
 * Puts the stock back, through the back office's own inventory endpoint.
 *
 * A product with options is stocked by its options, so its own count is
 * left alone and each option is put back on its own.
 */
async function restoreStock() {
  const variantsByProduct = new Map();
  for (const v of stockFound.variants) {
    const list = variantsByProduct.get(v.product_slug) ?? [];
    list.push({ id: v.id, stock: v.stock });
    variantsByProduct.set(v.product_slug, list);
  }

  const bodies = [];
  for (const p of stockFound.products) {
    const options = variantsByProduct.get(p.slug) ?? [];
    if (options.length === 0) {
      bodies.push({
        productSlug: p.slug,
        variantId: null,
        quantity: p.stock,
      });
    } else {
      for (const o of options) {
        bodies.push({
          productSlug: p.slug,
          variantId: o.id,
          quantity: o.stock,
        });
      }
    }
  }

  for (const body of bodies) {
    const payload = JSON.stringify({
      ...body,
      mode: "set",
      reason: "Stock restored after the test run",
    });
    await cdp.evaluate(`fetch('/api/admin/inventory/adjust', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: ${JSON.stringify(payload)}
    }).then(r => r.text()).then(() => 'OK')`);
  }
}

try {
  console.log("→ launching Chrome");
  const launched = await launchChrome({
    port: PORT,
    // The Chrome profile lives in the OS temp directory, never inside the
    // project: Turbopack watches the whole project tree, and a profile Chrome
    // holds locked there panics it during a CSS rebuild — the server keeps
    // answering 200 while the client bundle stays dead and no button works.
    profile: join(tmpdir(), "consoleseller-e2e-chrome"),
    dir: SHOTS,
  });
  chrome = launched.chrome;
  cdp = launched.cdp;

  // The Chrome profile is reused between runs, so the last run's cookies
  // would still be signed in. Start from a clean slate.
  await cdp.send("Network.clearBrowserCookies");

  /**
   * Sets a form field, saying which field it was when it goes wrong. A
   * bare "Illegal invocation" from a form is not much of a clue.
   */
  const setField = async (name, value) => {
    try {
      return await cdp.evaluate(setInput(name, value));
    } catch (err) {
      throw new Error(`the field "${name}" could not be set: ${err.message}`);
    }
  };

  const checks = [];
  const check = (label, ok, detail = "") => {
    checks.push({ label, ok, detail });
    console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) exitCode = 1;
  };

  /* ---- 1. Homepage ---- */
  console.log("\n→ homepage");
  await cdp.goto(BASE);
  const h1 = await cdp.evaluate(`document.querySelector('h1')?.textContent?.trim()`);
  check("homepage renders", Boolean(h1) && h1.length > 0, h1);

  // The old over-₹999 offer was removed from the site, and the phrase
  // "free delivery" is not used anywhere. No page may state a minimum
  // order value, and none may use the phrase.
  const homeText = await cdp.evaluate(`document.body.innerText`);
  check(
    "homepage does not state a delivery threshold",
    !/₹\s*999|free delivery over|free over\s*₹/i.test(homeText)
  );
  check(
    "homepage does not say free delivery",
    !/free\s+delivery/i.test(homeText),
    homeText.match(/.{0,40}free\s+delivery.{0,40}/i)?.[0] ?? "clear"
  );
  check("homepage states fast delivery", /fast delivery/i.test(homeText));

  const heroSel = `section[aria-roledescription="carousel"]`;
  const imgOk = await cdp.evaluate(`
    (() => {
      const hero = document.querySelector('${heroSel} img');
      return hero ? (hero.complete && hero.naturalWidth > 0) : false;
    })()
  `);
  check("hero image loads", imgOk === true);

  const dotCount = await cdp.evaluate(
    `document.querySelectorAll('${heroSel} [role="tab"]').length`
  );
  check("hero carousel has slides", dotCount >= 2, `${dotCount} slides`);

  // The carousel advances on its own every 6s.
  const slideBefore = await cdp.evaluate(
    `document.querySelector('${heroSel} [role="group"][aria-hidden="false"]')?.getAttribute('aria-label')`
  );
  await sleep(7000);
  const slideAfter = await cdp.evaluate(
    `document.querySelector('${heroSel} [role="group"][aria-hidden="false"]')?.getAttribute('aria-label')`
  );
  check(
    "hero carousel auto-advances",
    Boolean(slideBefore) && slideBefore !== slideAfter,
    `${slideBefore} -> ${slideAfter}`
  );

  // The copy stands on the side of the frame the photograph has room for.
  // That only happens on a wide screen, so the viewport is set to one.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.goto(BASE);
  await sleep(800);

  const headlineBox = async (dot) => {
    await cdp.evaluate(
      `document.querySelectorAll('${heroSel} [role="tab"]')[${dot}]?.click()`
    );
    await sleep(900);
    return JSON.parse(
      await cdp.evaluate(`(() => {
        const group = document.querySelector('${heroSel} [role="group"][aria-hidden="false"]');
        const h1 = group?.querySelector('h1');
        if (!h1) return 'null';
        const r = h1.getBoundingClientRect();
        return JSON.stringify({ left: Math.round(r.left), width: window.innerWidth });
      })()`)
    );
  };

  const firstSlide = await headlineBox(0);
  const secondSlide = await headlineBox(1);
  check(
    "the copy stands on the left when the photograph has room on the right",
    firstSlide && firstSlide.left < firstSlide.width / 2,
    `left edge at ${firstSlide?.left} of ${firstSlide?.width}`
  );
  check(
    "the copy moves aside when the photograph needs the room",
    secondSlide && secondSlide.left > firstSlide.left,
    `${firstSlide?.left} -> ${secondSlide?.left}`
  );

  // Every slide carries a photograph, a headline and a way in.
  const slideCount = await cdp.evaluate(
    `document.querySelectorAll('${heroSel} [role="group"]').length`
  );
  check("the hero has five slides", slideCount === 5, `${slideCount} slides`);

  const slideParts = await cdp.evaluate(`(() => {
    const hero = document.querySelector('${heroSel}');
    const photos = hero.querySelectorAll('img').length;
    const groups = [...hero.querySelectorAll('[role="group"]')];
    const complete = groups.filter(g => {
      const h1 = g.querySelector('h1');
      const link = g.querySelector('a');
      return Boolean(h1 && h1.textContent.trim() && link && link.getAttribute('href'));
    }).length;
    return JSON.stringify({ photos, complete });
  })()`);
  const parts = JSON.parse(slideParts);
  check(
    "every slide has a photograph of its own",
    parts.photos >= slideCount,
    `${parts.photos} photographs for ${slideCount} slides`
  );
  check(
    "every slide has a headline and a button",
    parts.complete === slideCount,
    `${parts.complete} of ${slideCount} complete`
  );

  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.goto(BASE);
  await sleep(600);

  await cdp.shot("01-home", true);

  /* ---- 2. Categories ---- */
  console.log("\n→ category listing");
  await cdp.goto(`${BASE}/category/consoles`);
  const catCount = await cdp.evaluate(
    `document.querySelectorAll('article').length`
  );
  check("category page lists products", catCount > 0, `${catCount} products`);
  await cdp.shot("02-category", true);

  /* ---- 3. Product page ---- */
  console.log("\n→ product page");
  await cdp.goto(`${BASE}/product/playstation-5-slim-disc-1tb`);
  const prodTitle = await cdp.evaluate(`document.querySelector('h1')?.textContent?.trim()`);
  check("product page loads", prodTitle?.includes("PlayStation 5"), prodTitle ?? "none");
  const options = await cdp.evaluate(
    `document.querySelectorAll('button[aria-pressed]').length`
  );
  check("variant options render", options >= 2, `${options} options`);
  await cdp.shot("03-product", true);

  /* ---- 4. Add to cart ---- */
  await cdp.evaluate(clickByText("Add to cart"));
  await sleep(1500);
  const badge = await cdp.evaluate(`
    (() => {
      const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
      const m = link && link.textContent.match(/(\\d+)/);
      return m ? m[1] : '0';
    })()
  `);
  check("cart badge incremented", badge === "1", `badge=${badge}`);

  /* ---- 5. Cart ---- */
  await cdp.goto(`${BASE}/cart`);
  const cartText = await cdp.evaluate(`document.body.innerText`);
  check("cart shows the item", /PlayStation 5/.test(cartText));
  check("cart shows a summary", /Order summary/i.test(cartText));
  // Delivery costs nothing on every order now, and the old over-₹999
  // threshold is gone from the site — the cart must not mention it, must
  // not try to upsell the shopper past a minimum order value, and must not
  // use the phrase.
  check("cart shows no delivery charge", /Delivery\s*\n?\s*₹0/i.test(cartText));
  check(
    "cart does not say free delivery",
    !/free\s+delivery/i.test(cartText),
    cartText.match(/.{0,40}free\s+delivery.{0,40}/i)?.[0] ?? "clear"
  );
  check(
    "cart does not mention a delivery threshold",
    !/free delivery over|more for\s*₹|₹\s*999/i.test(cartText)
  );
  await cdp.shot("04-cart", true);

  /* ---- 6. Checkout + order ---- */
  console.log("\n→ checkout");
  await cdp.goto(`${BASE}/checkout`);
  check(
    "checkout form renders",
    (await cdp.evaluate(`document.body.innerText.includes('Payment method')`)) === true
  );
  await cdp.shot("05-checkout", true);

  await cdp.evaluate(setInput("name", ACCOUNT.name));
  await cdp.evaluate(setInput("email", ACCOUNT.email));
  await cdp.evaluate(setInput("phone", "9876543210"));
  await cdp.evaluate(setInput("address1", "12 Palm Grove, Baner"));
  await cdp.evaluate(setInput("city", "Pune"));
  await cdp.evaluate(setInput("state", "Maharashtra"));
  await cdp.evaluate(setInput("pincode", "411045"));
  await sleep(250);

  await cdp.evaluate(clickByText("Place order"));
  await sleep(3000);

  const orderUrl = await cdp.evaluate("location.pathname");
  const orderBody = await cdp.evaluate("document.body.innerText");
  const orderId = (orderBody.match(/PF[A-Z0-9]{6}/) ?? [])[0] ?? null;
  check("redirected to the order page", /^\/order\/PF/.test(orderUrl), orderUrl);
  check("order confirmed", /Order confirmed/i.test(orderBody));
  check("order id issued", Boolean(orderId), orderId ?? "none");
  if (orderId) placedOrders.push(orderId);
  await cdp.shot("06-order", true);

  /* ---- 7. Cart emptied ---- */
  await cdp.goto(`${BASE}/cart`);
  check(
    "cart cleared after checkout",
    /Your cart is empty/i.test(await cdp.evaluate("document.body.innerText"))
  );

  /* ---- 8. Validation ---- */
  console.log("\n→ checkout validation");
  await cdp.goto(`${BASE}/product/dualsense-white`);
  await cdp.evaluate(clickByText("Add to cart"));
  await sleep(1400);
  await cdp.goto(`${BASE}/checkout`);
  await cdp.evaluate(clickByText("Place order"));
  await sleep(1800);
  const errText = await cdp.evaluate("document.body.innerText");
  check(
    "empty checkout is rejected",
    /Check the highlighted fields|Please enter|Enter a valid/i.test(errText)
  );
  check(
    "stays on checkout",
    (await cdp.evaluate("location.pathname")) === "/checkout"
  );

  /* ---- 9. Register ---- */
  console.log("\n→ register");
  await cdp.goto(`${BASE}/register`);
  check(
    "register page renders",
    (await cdp.evaluate(`document.body.innerText.includes('Create your account')`)) === true
  );
  await cdp.shot("07-register", true);

  await cdp.evaluate(setInput("name", ACCOUNT.name));
  await cdp.evaluate(setInput("email", ACCOUNT.email));
  await cdp.evaluate(setInput("password", ACCOUNT.password));
  await cdp.evaluate(setInput("confirm", ACCOUNT.password));
  await cdp.evaluate(setCheckbox("terms"));
  await sleep(250);
  await cdp.evaluate(clickByText("Create account"));
  await sleep(3000);

  check(
    "registration signs the user in",
    (await cdp.evaluate("location.pathname")) === "/",
    await cdp.evaluate("location.pathname")
  );
  // Check the link, not the label — the "Account" text is hidden on
  // narrower viewports, but the link is always there.
  const signedIn = await cdp.evaluate(
    `!!document.querySelector('header a[href="/account"]')`
  );
  check("header shows the signed-in state", signedIn === true);

  /* ---- 10. Account ---- */
  await cdp.goto(`${BASE}/account`);
  const acctText = await cdp.evaluate("document.body.innerText");
  check("account page shows the user", acctText.includes(ACCOUNT.email), ACCOUNT.email);
  check("account page shows orders", /My orders/.test(acctText));
  await cdp.shot("08-account", true);

  /* ---- 11. Sign out, then sign back in ---- */
  console.log("\n→ sign out / sign in");
  await cdp.evaluate(clickByText("Sign out", "button"));
  await sleep(2200);
  await cdp.goto(`${BASE}/login`);
  check(
    "login page renders",
    (await cdp.evaluate(`document.body.innerText.includes('Sign in to your account')`)) === true
  );
  await cdp.shot("09-login", true);

  await cdp.evaluate(setInput("email", ACCOUNT.email));
  await cdp.evaluate(setInput("password", ACCOUNT.password));
  await sleep(200);
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(3000);
  check(
    "login succeeds",
    (await cdp.evaluate("location.pathname")) === "/",
    await cdp.evaluate("location.pathname")
  );

  /* ---- 12. Wrong password is rejected ---- */
  await cdp.goto(`${BASE}/account`);
  await cdp.evaluate(clickByText("Sign out", "button"));
  await sleep(2200);
  await cdp.goto(`${BASE}/login`);
  await cdp.evaluate(setInput("email", ACCOUNT.email));
  await cdp.evaluate(setInput("password", "wrongpassword1"));
  await sleep(200);
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(2500);
  check(
    "wrong password is rejected",
    /not correct|highlighted/i.test(
      await cdp.evaluate("document.body.innerText")
    )
  );

  /* ---- 13. Shop, About and Contact ---- */
  console.log("\n→ shop / about / contact");

  // The phrase the store does not use. It is checked on every page of the
  // shop, so it cannot creep back in.
  const PHRASE = /free\s+delivery/i;
  for (const path of [
    "/",
    "/shop",
    "/category/consoles",
    "/product/playstation-5-slim-disc-1tb",
    "/cart",
    "/about",
    "/contact",
    "/terms-of-service",
    "/refund-policy",
    "/privacy-policy",
  ]) {
    await cdp.goto(`${BASE}${path}`);
    const text = await cdp.evaluate("document.body.innerText");
    check(
      `${path} does not say free delivery`,
      !PHRASE.test(text),
      text.match(/.{0,40}free\s+delivery.{0,40}/i)?.[0] ?? "clear"
    );
  }

  await cdp.goto(BASE);
  const navLabels = await cdp.evaluate(
    `[...document.querySelectorAll('header nav a')].map(a => a.textContent.trim())`
  );
  check(
    "nav shows Shop Now, About Us, Contact Us",
    ["Shop Now", "About Us", "Contact Us"].every((l) => navLabels.includes(l)),
    navLabels.join(" · ")
  );

  // The centre menu must sit in the middle of the whole bar — not in the
  // leftover space between the logo and the right-hand group.
  for (const width of [1920, 1440, 1280, 1024]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.goto(BASE);
    const geom = await cdp.evaluate(`(() => {
      const nav = document.querySelector('header nav');
      const bar = document.querySelector('header .container-x > div');
      if (!nav || !bar) return null;
      const n = nav.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const logo = document.querySelector('header a[href="/"]').getBoundingClientRect();
      const right = bar.lastElementChild.getBoundingClientRect();
      return {
        delta: Math.abs((n.left + n.width / 2) - (b.left + b.width / 2)),
        gapLeft: n.left - logo.right,
        gapRight: right.left - n.right,
      };
    })()`);
    check(
      `centre nav is centred at ${width}px`,
      geom !== null && geom.delta < 1,
      geom ? `off by ${geom.delta.toFixed(2)}px` : "not found"
    );
    check(
      `centre nav clears the sides at ${width}px`,
      geom !== null && geom.gapLeft >= 0 && geom.gapRight >= 0,
      geom ? `gaps ${geom.gapLeft.toFixed(0)} / ${geom.gapRight.toFixed(0)}px` : "not found"
    );
  }
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.goto(BASE);

  // Shop Now lists every product — consoles and controllers — in one grid.
  await cdp.goto(`${BASE}/shop`);
  const shopCount = await cdp.evaluate(`document.querySelectorAll('article').length`);
  check("shop lists every product", shopCount === 9, `${shopCount} products`);
  const shopText = await cdp.evaluate("document.body.innerText");
  check(
    "shop shows both categories",
    /Consoles/.test(shopText) && /Controllers/.test(shopText)
  );
  check(
    "shop has a category filter",
    (await cdp.evaluate(`document.querySelectorAll('[aria-pressed]').length`)) >= 3
  );
  await cdp.shot("12-shop", true);

  // Filtering narrows the grid to one category.
  await cdp.goto(`${BASE}/shop?category=controllers`);
  const filtered = await cdp.evaluate(`document.querySelectorAll('article').length`);
  check("category filter narrows the grid", filtered === 3, `${filtered} controllers`);

  // Sorting by price puts the cheapest first.
  await cdp.goto(`${BASE}/shop?sort=price-asc`);
  const prices = (
    await cdp.evaluate(`
      [...document.querySelectorAll('article')].map(a => {
        const el = [...a.querySelectorAll('span')].find(s => /^₹[\\d,]+$/.test(s.textContent.trim()));
        return el ? Number(el.textContent.replace(/[^\\d]/g, '')) : null;
      })
    `)
  ).filter((p) => typeof p === "number");
  check(
    "price sort is ascending",
    prices.length > 1 && prices.every((p, i) => i === 0 || p >= prices[i - 1]),
    prices.slice(0, 3).join(", ")
  );

  await cdp.goto(`${BASE}/shop`);
  const badgeBefore = await cdp.evaluate(`
    (() => {
      const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
      const m = link && link.textContent.match(/(\\d+)/);
      return m ? m[1] : '0';
    })()
  `);
  await cdp.evaluate(clickByText("Add to cart"));
  await sleep(1600);
  const badgeAfter = await cdp.evaluate(`
    (() => {
      const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
      const m = link && link.textContent.match(/(\\d+)/);
      return m ? m[1] : '0';
    })()
  `);
  check(
    "add to cart works from the shop page",
    Number(badgeAfter) === Number(badgeBefore) + 1,
    `badge ${badgeBefore} -> ${badgeAfter}`
  );

  // Leave the cart empty behind us.
  await cdp.goto(`${BASE}/cart`);
  for (let i = 0; i < 5; i++) {
    const removed = await cdp.evaluate(`(() => {
      const btn = document.querySelector('[aria-label^="Remove"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!removed) break;
    await sleep(1300);
  }
  check(
    "cart emptied after the shop check",
    /Your cart is empty/i.test(await cdp.evaluate("document.body.innerText"))
  );

  await cdp.goto(`${BASE}/about`);
  const aboutText = await cdp.evaluate("document.body.innerText");
  check(
    "about page renders",
    /Every console and controller, from one store/i.test(aboutText)
  );
  check("about page explains the business", /Why we started/i.test(aboutText));
  check("about page states its promises", /What we promise/i.test(aboutText));
  await cdp.shot("13-about", true);

  await cdp.goto(`${BASE}/contact`);
  check(
    "contact page renders",
    (await cdp.evaluate(`document.body.innerText.includes('Send us a message')`)) === true
  );

  // An empty form is rejected rather than sent.
  await cdp.evaluate(clickByText("Send message"));
  await sleep(2200);
  check(
    "contact form validates",
    /Check the highlighted fields/i.test(await cdp.evaluate("document.body.innerText"))
  );

  // A real message is accepted.
  await cdp.evaluate(setInput("name", "Priya Raman"));
  await cdp.evaluate(setInput("email", `contact${STAMP}@example.com`));
  await cdp.evaluate(setInput("orderId", "PFJTTPT7"));
  await cdp.evaluate(
    setInput("message", "Is the PS5 Pro in stock for delivery to Pune?")
  );
  await sleep(250);
  await cdp.evaluate(clickByText("Send message"));
  await sleep(2500);
  check(
    "contact form submits",
    /Message received/i.test(await cdp.evaluate("document.body.innerText"))
  );
  await cdp.shot("14-contact", true);

  /* ---- 14. Policy pages ---- */
  console.log("\n→ policies");

  // The footer must carry a Customer Support section with all three
  // policies, and every one of those links must work.
  await cdp.goto(BASE);
  const footerLinks = await cdp.evaluate(`
    [...document.querySelectorAll('footer a')].map(a => ({
      href: a.getAttribute('href'),
      label: a.textContent.trim(),
    }))
  `);
  const footerHrefs = footerLinks.map((l) => l.href);
  check(
    "footer links to all three policies",
    ["/privacy-policy", "/terms-of-service", "/refund-policy"].every((h) =>
      footerHrefs.includes(h)
    ),
    footerHrefs.join(" · ")
  );
  check(
    "footer section is labelled Customer Support",
    /Customer Support/i.test(
      await cdp.evaluate("document.querySelector('footer').innerText")
    )
  );

  const POLICY_EXPECTATIONS = [
    {
      path: "/privacy-policy",
      label: "Privacy Policy",
      must: [
        "Information We Collect",
        "Cookies",
        "Data Security",
        "Data Retention",
        "Customer Privacy Rights",
        "Children's Privacy",
        "Contact Information",
      ],
    },
    {
      path: "/terms-of-service",
      label: "Terms of Service",
      must: [
        "Acceptance of Terms",
        "Products and Availability",
        "Pricing and Payment",
        "Shipping and Delivery",
        "Product Warranty",
        "Intellectual Property",
        "Applicable Law",
      ],
    },
    {
      path: "/refund-policy",
      label: "Refund and Return Policy",
      must: [
        "Return Eligibility",
        "Return Window",
        "Refund Processing Time",
        "Damaged or Defective Products",
        "Missing Items",
        "Non-Returnable Items",
        "Refund Method",
        "Return Shipping Costs",
        "Order Cancellations",
        "How to Request a Return",
        "Contact Information",
      ],
    },
  ];

  for (const policy of POLICY_EXPECTATIONS) {
    // These pages must be readable without signing in.
    await cdp.goto(`${BASE}${policy.path}`);
    const text = await cdp.evaluate("document.body.innerText");
    check(
      `${policy.label} renders`,
      text.includes(policy.label),
      `${policy.path}`
    );
    const missing = policy.must.filter((m) => !text.includes(m));
    check(
      `${policy.label} covers every section`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : `${policy.must.length} sections`
    );
    check(
      `${policy.label} has a table of contents`,
      (await cdp.evaluate(`document.querySelectorAll('nav a[href^="#"]').length`)) >=
        policy.must.length
    );
  }

  // The refund timeline is the headline number, and it starts at approval.
  await cdp.goto(`${BASE}/refund-policy`);
  const refundText = await cdp.evaluate("document.body.innerText");
  check(
    "refund policy states 7-15 days",
    /7-15 days|7–15 days/.test(refundText),
    refundText.match(/within 7[-–]15 days[^.]*/i)?.[0] ?? "not found"
  );
  check(
    "refund policy measures the window from approval",
    /begins on the date we approve/i.test(refundText)
  );
  check(
    "refund policy has no placeholder left in it",
    !/\[INSERT /.test(refundText)
  );
  await cdp.shot("15-policies", true);

  /* ---- 15. Mobile ---- */
  console.log("\n→ mobile");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.goto(BASE);
  await cdp.shot("16-mobile-home");

  await cdp.evaluate(
    `document.querySelector('[aria-label="Open menu"]')?.click()`
  );
  await sleep(700);
  const drawerText = await cdp.evaluate("document.body.innerText");
  check(
    "mobile menu lists the nav links",
    /Shop Now/.test(drawerText) &&
      /About Us/.test(drawerText) &&
      /Contact Us/.test(drawerText)
  );
  // The links have to be on screen, not just present in the DOM.
  const drawerVisible = await cdp.evaluate(`(() => {
    const link = [...document.querySelectorAll('a')]
      .find(a => a.textContent.trim() === 'Shop Now' && a.closest('.fixed'));
    if (!link) return false;
    const r = link.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1;
  })()`);
  check("mobile drawer links are on screen", drawerVisible === true);
  await cdp.shot("17-mobile-menu");

  await cdp.goto(`${BASE}/login`);
  await cdp.shot("18-mobile-login");
  await cdp.send("Emulation.clearDeviceMetricsOverride");

  /* ---- 16. The back office ---- */
  // The admin panel is driven through a real sign-in, so the session, the
  // redirects and the client components are all exercised together.
  console.log("\n→ back office");

  // The account the local environment file names — that is the one whose
  // password it also holds. The scripts do not load .env.local themselves,
  // so it is read here. If the file names nothing, fall back to whichever
  // account holds the admin role.
  const localEnv = existsSync(join(ROOT, ".env.local"))
    ? readFileSync(join(ROOT, ".env.local"), "utf8")
    : "";
  const ADMIN_EMAIL =
    process.env.PF_ADMIN_EMAIL ??
    localEnv.match(/^PF_ADMIN_EMAIL="(.*)"/m)?.[1] ??
    new DatabaseSync(join(ROOT, "data/store.db"))
      .prepare("SELECT email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
      .get()?.email ??
    "consoleseller.in@gmail.com";
  const ADMIN_PASSWORD =
    process.env.PF_ADMIN_PASSWORD ??
    localEnv.match(/^PF_ADMIN_PASSWORD="(.*)"/m)?.[1] ??
    "myconsole@121";

  await cdp.goto(`${BASE}/login`);
  await cdp.evaluate(setInput("email", ADMIN_EMAIL));
  await cdp.evaluate(setInput("password", ADMIN_PASSWORD));
  await sleep(200);
  await cdp.evaluate(clickByText("Sign in"));
  await sleep(3000);
  check(
    "the admin can sign in",
    (await cdp.evaluate("location.pathname")) === "/",
    await cdp.evaluate("location.pathname")
  );

  await cdp.goto(`${BASE}/admin/products`);
  const catalogueText = await cdp.evaluate("document.body.innerText");
  check("the catalogue lists the products", catalogueText.includes("Catalogue"));
  check(
    "the catalogue shows a SKU",
    catalogueText.includes("PLAYSTATION-5-SLIM-DISC-1TB")
  );
  check(
    "the catalogue shows the filters",
    catalogueText.includes("All brands") &&
      catalogueText.includes("Low stock") &&
      catalogueText.includes("Price: low to high")
  );

  // Searching by SKU narrows the list.
  await cdp.goto(`${BASE}/admin/products?q=DUALSENSE-EDGE`);
  const searched = await cdp.evaluate("document.body.innerText");
  check(
    "searching by SKU narrows the catalogue",
    searched.includes("DualSense Edge") && !searched.includes("Charging Station")
  );

  // The sort and the filters, read back through the API the browser is
  // already signed in to.
  const apiRows = (query) =>
    cdp.evaluate(
      `fetch('/api/admin/products?limit=100&${query}')
         .then(r => r.json())
         .then(d => JSON.stringify(d.rows.map(p => ({ slug: p.slug, price: p.price, brand: p.brand, stock: p.stock }))))`
    );

  const sorted = JSON.parse(await apiRows("sort=price-asc"));
  check(
    "sorting by price works",
    sorted.every((p, i, rows) => i === 0 || rows[i - 1].price <= p.price),
    sorted.map((p) => p.price).join(" · ")
  );

  const byBrand = JSON.parse(await apiRows("brand=Sony"));
  check(
    "filtering by brand works",
    byBrand.length > 0 && byBrand.every((p) => p.brand === "Sony"),
    `${byBrand.length} rows`
  );

  // Bulk selection: tick a row, use the toolbar, and put it back.
  const BULK_SLUG = "playstation-portal";
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(800);
  const ticked = await cdp.evaluate(`(() => {
    const el = document.querySelector('[aria-label="Select ${BULK_SLUG}"]');
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'CLICKED';
  })()`);
  await sleep(600);
  check("a row can be ticked", ticked === "CLICKED", ticked);

  const toolbarText = await cdp.evaluate("document.body.innerText");
  check(
    "the bulk toolbar appears",
    toolbarText.includes("1 selected") &&
      toolbarText.includes("Publish") &&
      toolbarText.includes("Archive")
  );

  await cdp.evaluate(clickByText("Delist"));
  await sleep(400);
  const confirmText = await cdp.evaluate("document.body.innerText");
  check("a bulk action asks first", /Yes,/.test(confirmText));

  await cdp.evaluate(clickByText("Yes,"));
  await sleep(2500);
  const afterDelist = JSON.parse(
    await cdp.evaluate(
      `fetch('/api/admin/products?q=${BULK_SLUG}').then(r => r.json()).then(d => JSON.stringify(d.rows[0]))`
    )
  );
  check("the bulk delist worked", afterDelist.listed === false, `listed ${afterDelist.listed}`);

  // Put it back, so the suite leaves the catalogue as it found it.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(800);
  await cdp.evaluate(`document.querySelector('[aria-label="Select ${BULK_SLUG}"]')?.click()`);
  await sleep(600);
  await cdp.evaluate(clickByText("Publish"));
  await sleep(400);
  await cdp.evaluate(clickByText("Yes,"));
  await sleep(2500);
  const afterPublish = JSON.parse(
    await cdp.evaluate(
      `fetch('/api/admin/products?q=${BULK_SLUG}').then(r => r.json()).then(d => JSON.stringify(d.rows[0]))`
    )
  );
  check(
    "the catalogue is left as it was found",
    afterPublish.listed === true && afterPublish.status === "published",
    `listed ${afterPublish.listed}, status ${afterPublish.status}`
  );

  // The row itself has to show the new state, not the one it had before
  // the bulk action — a control that holds its own copy of the value would
  // still read "Delisted" here.
  const bulkRow = await cdp.evaluate(`(() => {
    const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('PlayStation Portal'));
    return row ? row.innerText.replace(/\\s+/g, ' ') : '';
  })()`);
  check(
    "the row shows the state it was just given",
    /\bListed\b/.test(bulkRow) && !/Delisted/.test(bulkRow),
    bulkRow
  );

  /* ---- the catalogue's search, filters and sorting, driven for real ---- */
  console.log("\n→ the catalogue's controls");

  await cdp.goto(`${BASE}/admin/products`);
  await sleep(700);

  // The search box narrows the list, and the search goes into the URL so
  // it can be shared and reloaded.
  await cdp.evaluate(setInput("q", "DualSense Charging"));
  await cdp.evaluate(
    "document.querySelector('[name=q]')?.closest('form')?.requestSubmit()"
  );
  await sleep(2500);
  const searchUrl = await cdp.evaluate("location.search");
  check(
    "the search goes into the URL",
    searchUrl.includes("q=DualSense+Charging"),
    searchUrl
  );
  const searchedRows = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check(
    "the search narrows the list",
    searchedRows === 1,
    `${searchedRows} rows`
  );

  // A search that matches nothing offers a way back — and the box must not
  // go on showing the old answer once the filters are cleared.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(700);
  await cdp.evaluate(setInput("q", "zzzz-nothing-here"));
  await cdp.evaluate(
    "document.querySelector('[name=q]')?.closest('form')?.requestSubmit()"
  );
  await sleep(2500);
  check(
    "a search with no matches says so",
    (await cdp.evaluate("document.body.innerText")).includes(
      "Nothing matches those filters"
    )
  );
  await cdp.evaluate(clickByText("Clear filters", "a"));
  await sleep(2500);
  const boxAfterClear = await cdp.evaluate(
    "document.querySelector('[name=q]')?.value ?? ''"
  );
  check(
    "the search box does not keep the old answer",
    boxAfterClear === "",
    `"${boxAfterClear}"`
  );
  const rowsAfterClear = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check(
    "clearing the filters brings the whole catalogue back",
    rowsAfterClear === 9,
    `${rowsAfterClear} rows`
  );

  // A filter dropdown narrows the list, and says so in the URL.
  await cdp.evaluate(setInput("stock", "out"));
  await sleep(2500);
  const stockUrl = await cdp.evaluate("location.search");
  check("the filter goes into the URL", stockUrl.includes("stock=out"), stockUrl);
  const outRows = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  // What the table shows and what the API says have to be the same list.
  const outCount = await cdp.evaluate(
    `fetch('/api/admin/products?stock=out&limit=100')
       .then(r => r.json())
       .then(d => String(d.rows.length))`
  );
  check(
    "the stock filter shows exactly the products with no stock",
    Number(outCount) === outRows,
    `${outRows} rows shown, ${outCount} out of stock`
  );

  // The sort dropdown reorders the list.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(700);
  await cdp.evaluate(setInput("sort", "price-asc"));
  await sleep(2500);
  const sortPrices = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    return JSON.stringify(rows.map(r => {
      const cell = r.children[3];
      const m = cell?.innerText.match(/([\\d,]+)/);
      return m ? Number(m[1].replace(/,/g, '')) : 0;
    }));
  })()`);
  const priceList = JSON.parse(sortPrices);
  check(
    "the sort dropdown reorders the list",
    priceList.every((p, i) => i === 0 || priceList[i - 1] <= p),
    priceList.join(" · ")
  );

  /* ---- the row actions, driven for real ---- */
  console.log("\n→ the catalogue's row actions");

  // Duplicating a product opens the copy, ready to be edited.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(700);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Duplicate DualSense Edge Wireless Controller"]')?.click()`
  );
  await sleep(3000);
  const copyPath = await cdp.evaluate("location.pathname");
  check(
    "duplicating opens the copy",
    copyPath === "/admin/products/dualsense-edge-copy",
    copyPath
  );
  const copyHeading = await cdp.evaluate("document.body.innerText");
  check(
    "the copy is named as a copy",
    copyHeading.includes("DualSense Edge Wireless Controller (copy)"),
    "DualSense Edge Wireless Controller (copy)"
  );
  const copyStatus = await cdp.evaluate(
    `document.querySelector('select[aria-label^="Status for"]')?.value ?? ''`
  );
  check("the copy starts as a draft", copyStatus === "draft", copyStatus);

  // The copy is removed again, through the catalogue's own delete action.
  await cdp.goto(`${BASE}/admin/products?q=DUALSENSE-EDGE-COPY`);
  await sleep(1500);
  const copyRows = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check("the copy is in the catalogue", copyRows === 1, `${copyRows} rows`);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Delete DualSense Edge Wireless Controller (copy)"]')?.click()`
  );
  await sleep(600);
  await cdp.evaluate(clickByText("Delete", "button"));
  await sleep(3000);
  const copiesLeft = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check("the copy can be deleted again", copiesLeft === 0, `${copiesLeft} rows`);

  // Archiving takes a product off sale and can be undone. The dropdown is
  // read for its value, not its text — a dropdown shows every option.
  await cdp.goto(`${BASE}/admin/products`);
  await sleep(700);

  // The suite must leave the catalogue exactly as it found it. The prices
  // are read here because a price is the one thing a stray click can
  // quietly change without anything looking wrong.
  const catalogueBefore = await cdp.evaluate(
    `fetch('/api/admin/products/playstation-5-slim-disc-1tb')
       .then(r => r.json())
       .then(d => JSON.stringify({ price: d.price, mrp: d.mrp, sku: d.sku }))`
  );

  const portalStatus = () =>
    cdp.evaluate(`(() => {
      const row = [...document.querySelectorAll('tr')].find(r => r.innerText.includes('PlayStation Portal'));
      const sel = row?.querySelector('select');
      return sel ? sel.value : '';
    })()`);

  await cdp.evaluate(
    `document.querySelector('[aria-label="Archive PlayStation Portal Remote Player"]')?.click()`
  );
  await sleep(3000);
  const archivedStatus = await portalStatus();
  check(
    "the row shows the product archived",
    archivedStatus === "archived",
    archivedStatus
  );
  await cdp.evaluate(
    `document.querySelector('[aria-label="Restore PlayStation Portal Remote Player"]')?.click()`
  );
  await sleep(3000);
  const restoredStatus = await portalStatus();
  check(
    "the row shows the product published again",
    restoredStatus === "published",
    restoredStatus
  );

  /* ---- pagination, and acting on everything that matches ---- */
  console.log("\n→ pagination and bulk scope");

  // More than a page of products, so the pagination and the control that
  // acts on everything matching are both there to be driven. They are
  // removed again at the end of this section.
  const PAGER_BRAND = "Pager";
  const pagerSlugs = Array.from(
    { length: 22 },
    (_, i) => `zz-e2e-page-${String(i + 1).padStart(2, "0")}`
  );
  const store = new DatabaseSync(join(ROOT, "data/store.db"));
  const insPager = store.prepare(
    `INSERT INTO products
       (slug, sku, name, brand, category_slug, price, mrp, rating, reviews, stock,
        badge, short_desc, specs, image, listed, status, position)
     VALUES (?,?,?,?,?,?,?,0,0,?,NULL,NULL,'{}',NULL,1,'published',?)`
  );
  pagerSlugs.forEach((slug, i) => {
    insPager.run(
      slug,
      slug.toUpperCase(),
      `Pager Test Product ${i + 1}`,
      PAGER_BRAND,
      "consoles",
      1000 + i,
      1000 + i,
      5,
      9500 + i
    );
  });
  store.close();

  try {
    await cdp.goto(`${BASE}/admin/products?brand=${PAGER_BRAND}`);
    await sleep(1500);
    const firstPageRows = await cdp.evaluate(
      "document.querySelectorAll('tbody tr').length"
    );
    check(
      "the first page holds twenty rows",
      firstPageRows === 20,
      `${firstPageRows} rows`
    );
    const pagerText = await cdp.evaluate("document.body.innerText");
    check(
      "the page says how much of the list is showing",
      pagerText.includes(`Showing 1–20 of ${pagerSlugs.length} products`),
      `Showing 1–20 of ${pagerSlugs.length} products`
    );
    check(
      "the catalogue offers to select everything matching",
      pagerText.includes(`Select all ${pagerSlugs.length} matching products`),
      `Select all ${pagerSlugs.length} matching products`
    );

    await cdp.goto(`${BASE}/admin/products?brand=${PAGER_BRAND}&page=2`);
    await sleep(1500);
    const secondPageRows = await cdp.evaluate(
      "document.querySelectorAll('tbody tr').length"
    );
    check(
      "the second page holds the rest",
      secondPageRows === pagerSlugs.length - 20,
      `${secondPageRows} rows`
    );

    // Select everything that matches, rather than only this page.
    await cdp.goto(`${BASE}/admin/products?brand=${PAGER_BRAND}`);
    await sleep(1200);
    await cdp.evaluate(
      clickByText(`Select all ${pagerSlugs.length} matching products`, "button")
    );
    await sleep(800);
    const scopeText = await cdp.evaluate("document.body.innerText");
    check(
      "the toolbar says every matching product is selected",
      scopeText.includes(
        `All ${pagerSlugs.length} matching products selected`
      ),
      `All ${pagerSlugs.length} matching products selected`
    );

    await cdp.evaluate(clickByText("Delist"));
    await sleep(500);
    await cdp.evaluate(clickByText("Yes,"));
    await sleep(4000);
    const delistedCount = await cdp.evaluate(
      `fetch('/api/admin/products?brand=${PAGER_BRAND}&limit=100')
         .then(r => r.json())
         .then(d => String(d.rows.filter(p => !p.listed).length))`
    );
    check(
      "the bulk delist reached every matching product, not just this page",
      delistedCount === String(pagerSlugs.length),
      `${delistedCount} delisted`
    );
  } finally {
    // Put them back on sale and take them out of the catalogue again,
    // through the back office's own endpoints.
    await cdp.evaluate(
      `fetch('/api/admin/products', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ action: 'publish', scope: 'all', filters: { brand: '${PAGER_BRAND}' } })
       }).then(r => r.text()).then(() => 'OK')`
    );
    await cdp.evaluate(
      `(async () => {
         for (const slug of ${JSON.stringify(pagerSlugs)}) {
           await fetch('/api/admin/products/' + slug, { method: 'DELETE' });
         }
         return 'DONE';
       })()`
    );
    await sleep(2000);
  }

  await cdp.goto(`${BASE}/admin/products`);
  await sleep(1500);
  const catalogueRows = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check(
    "the catalogue is back to the nine products it started with",
    catalogueRows === 9,
    `${catalogueRows} rows`
  );

  /* ---- the product form, driven for real ---- */
  console.log("\n→ the product form");

  await cdp.goto(`${BASE}/admin/products/new`);
  await sleep(900);

  const formText = await cdp.evaluate("document.body.innerText");
  for (const section of [
    "Basic information",
    "Product images",
    "Pricing",
    "Product specifications",
    "Shipping and warranty",
    "SEO",
    "Publishing",
  ]) {
    check(`the form has a ${section.toLowerCase()} section`, formText.includes(section));
  }
  check(
    "the form offers the three publishing choices",
    formText.includes("Publish product") &&
      formText.includes("Save as draft") &&
      formText.includes("Preview product")
  );

  // The category decides which specifications the product is asked about.
  const consoleFields = await cdp.evaluate(
    `document.body.innerText.includes('Storage capacity')`
  );
  check(
    "a console is asked the console questions",
    consoleFields === true,
    "Storage capacity"
  );

  await cdp.evaluate(setInput("category", "controllers"));
  await sleep(600);
  const afterCategory = await cdp.evaluate("document.body.innerText");
  check(
    "a controller is asked the controller questions",
    afterCategory.includes("Battery information") &&
      afterCategory.includes("Model and colour"),
    "Battery information"
  );
  check(
    "and not the console ones",
    !afterCategory.includes("Storage capacity"),
    "the console fields are gone"
  );

  await cdp.evaluate(setInput("category", "consoles"));
  await sleep(600);
  const backToConsole = await cdp.evaluate("document.body.innerText");
  check(
    "and switching back brings them again",
    backToConsole.includes("Storage capacity") &&
      !backToConsole.includes("Battery information")
  );

  // The validation. An MRP below the selling price is refused, and the
  // message says why.
  await setField("name", "E2E Test Console");
  await setField("price", "5000");
  await setField("mrp", "4000");
  await cdp.evaluate(clickByText("Publish product", "button"));
  await sleep(2500);
  const mrpError = await cdp.evaluate("document.body.innerText");
  check(
    "an MRP below the selling price is refused",
    mrpError.includes("The MRP cannot be lower than the selling price."),
    "the message says why"
  );
  check(
    "and nothing was created",
    (await cdp.evaluate("location.pathname")) === "/admin/products/new",
    await cdp.evaluate("location.pathname")
  );

  // A SKU that another product already uses is refused too.
  await setField("mrp", "9000");
  await setField("sku", "DUALSENSE-EDGE");
  await cdp.evaluate(clickByText("Publish product", "button"));
  await sleep(2500);
  const skuError = await cdp.evaluate("document.body.innerText");
  check(
    "a SKU that is already taken is refused",
    skuError.includes("Another product already uses this SKU."),
    "the message says why"
  );

  // Now the whole form, filled in properly.
  await setField("sku", "E2E-TEST-CONSOLE");
  await setField("brand", "E2E");
  await setField("subcategory", "Test");
  await setField("modelNumber", "E2E-1");
  await setField("condition", "open-box");
  await setField("shortDesc", "A console that only exists for the test.");
  await setField(
    "description",
    "This product exists so the test can look at it."
  );
  await setField("stock", "4");
  await setField("salePrice", "4500");
  await setField("purchaseCost", "3000");
  await setField("specLabel", "Storage");
  await setField("specValue", "512GB");
  await setField("weightGrams", "2500");
  await setField("packageLength", "30");
  await setField("packageWidth", "20");
  await setField("packageHeight", "8");
  await setField("warranty", "1 year warranty");
  await setField("returns", "7-day replacement");
  await setField("seoTitle", "E2E Test Console");
  await setField("metaDescription", "A console made for the test.");
  await setField("imageAlt", "The test console");
  await sleep(300);

  const slug = await cdp.evaluate("document.querySelector('[name=slug]')?.value ?? ''");
  check(
    "the address follows the name",
    slug === "e2e-test-console",
    slug
  );

  const discount = await cdp.evaluate("document.body.innerText");
  check(
    "the discount is worked out as the prices are typed",
    discount.includes("4,500") && discount.includes("% off"),
    "the discount line"
  );

  await cdp.evaluate(clickByText("Publish product", "button"));
  await sleep(3000);
  check(
    "the product is created and opened",
    (await cdp.evaluate("location.pathname")) === "/admin/products/e2e-test-console",
    await cdp.evaluate("location.pathname")
  );

  const created = await cdp.evaluate(
    `fetch('/api/admin/products/e2e-test-console').then(r => r.json()).then(d => JSON.stringify(d))`
  );
  const product = JSON.parse(created);
  check("the product is published", product.status === "published", product.status);
  check("the sale price is saved", product.sale_price === 4500, String(product.sale_price));
  check(
    "the specifications are saved",
    product.specs.Storage === "512GB",
    JSON.stringify(product.specs)
  );
  check("the weight is saved", product.weight_grams === 2500, String(product.weight_grams));
  check(
    "the SEO title is saved",
    product.seo_title === "E2E Test Console",
    product.seo_title
  );
  check(
    "the condition is saved",
    product.condition === "open-box",
    product.condition
  );

  // The shop shows it.
  await cdp.goto(`${BASE}/product/e2e-test-console`);
  await sleep(900);
  const newProductText = await cdp.evaluate("document.body.innerText");
  check("the new product is on sale", newProductText.includes("E2E Test Console"));
  check("the shop shows the sale price", newProductText.includes("4,500"), "₹4,500");
  check(
    "the shop shows the specification",
    newProductText.includes("512GB"),
    "512GB"
  );
  check("the shop shows the warranty", newProductText.includes("1 year warranty"));

  // A photograph, uploaded through the real file input.
  const uploadPath = join(SHOTS, "e2e-upload.png");
  writeFileSync(
    uploadPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  await cdp.goto(`${BASE}/admin/products/e2e-test-console`);
  await sleep(900);
  await cdp.send("DOM.enable");
  const doc = await cdp.send("DOM.getDocument");
  const input = await cdp.send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: "#product-images",
  });
  await cdp.send("DOM.setFileInputFiles", {
    files: [uploadPath],
    nodeId: input.nodeId,
  });
  await sleep(3000);
  const gallery = await cdp.evaluate(
    `fetch('/api/admin/products/e2e-test-console/images').then(r => r.json()).then(d => JSON.stringify(d.images))`
  );
  check(
    "the photograph is uploaded through the form",
    JSON.parse(gallery).length === 1,
    `${JSON.parse(gallery).length} photographs`
  );
  check(
    "the photograph is ours, in the uploads folder",
    JSON.parse(gallery)[0]?.path?.startsWith("/uploads/"),
    JSON.parse(gallery)[0]?.path
  );

  // The product goes again, so the catalogue is as it was found.
  await cdp.goto(`${BASE}/admin/products?q=e2e-test-console`);
  await sleep(900);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Delete E2E Test Console"]')?.click()`
  );
  await sleep(600);
  await cdp.evaluate(clickByText("Delete", "button"));
  await sleep(2500);
  const leftOver = await cdp.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  check("the test product is removed again", leftOver === 0, `${leftOver} rows`);

  // The subcategory and the brand the form made for the test product go
  // with it, so the catalogue is as it was found.
  await cdp.evaluate(`
    (async () => {
      const categories = await fetch('/api/admin/categories')
        .then(r => r.json());
      for (const category of categories.categories) {
        for (const sub of category.subcategories) {
          if (sub.name === 'Test') {
            await fetch(
              '/api/admin/categories/' + category.slug + '/subcategories/' + sub.slug,
              { method: 'DELETE' }
            );
          }
        }
      }
      const brands = await fetch('/api/admin/brands').then(r => r.json());
      for (const brand of brands.brands) {
        if (brand.name === 'E2E') {
          await fetch('/api/admin/brands/' + brand.slug, { method: 'DELETE' });
        }
      }
      return 'OK';
    })()
  `);
  const subsLeft = await cdp.evaluate(`
    fetch('/api/admin/categories').then(r => r.json()).then(d =>
      d.categories.flatMap(c => c.subcategories).map(s => s.name).join(','))
  `);
  check(
    "the subcategory the form made is removed again",
    !subsLeft.includes("Test"),
    subsLeft || "none left"
  );
  const brandsLeft = await cdp.evaluate(`
    fetch('/api/admin/brands').then(r => r.json()).then(d =>
      d.brands.map(b => b.name).join(','))
  `);
  check(
    "the brand the form made is removed again",
    !brandsLeft.includes("E2E"),
    brandsLeft || "none left"
  );

  // The editor on a product that is really in the catalogue. Saving it
  // must leave everything it did not touch exactly as it was — a price in
  // particular, which is easy to lose.
  await cdp.goto(`${BASE}/admin/products/playstation-5-slim-disc-1tb`);
  await sleep(1200);
  const live = JSON.parse(
    await cdp.evaluate(
      `fetch('/api/admin/products/playstation-5-slim-disc-1tb')
         .then(r => r.json())
         .then(d => JSON.stringify({ name: d.name, price: d.price, mrp: d.mrp, stock: d.stock, sku: d.sku }))`
    )
  );
  const loaded = await cdp.evaluate(`(() => {
    const field = (name) => document.querySelector('[name="' + name + '"]')?.value ?? '';
    return JSON.stringify({
      name: field('name'),
      price: field('price'),
      mrp: field('mrp'),
      stock: field('stock'),
      sku: field('sku'),
    });
  })()`);
  const form = JSON.parse(loaded);
  check(
    "the editor loads what is already there",
    form.name === live.name &&
      form.price === String(live.price) &&
      form.mrp === String(live.mrp) &&
      form.stock === String(live.stock) &&
      form.sku === live.sku,
    `${loaded} | live ${JSON.stringify(live)}`
  );

  await cdp.evaluate(clickByText("Save changes", "button"));
  await sleep(3000);
  const saved = await cdp.evaluate(
    `fetch('/api/admin/products/playstation-5-slim-disc-1tb')
       .then(r => r.json())
       .then(d => JSON.stringify({ price: d.price, mrp: d.mrp, sku: d.sku }))`
  );
  check(
    "saving the editor changes nothing it was not asked to change",
    saved.includes(`"price":${live.price}`) &&
      saved.includes(`"mrp":${live.mrp}`) &&
      saved.includes(`"sku":"${live.sku}"`),
    saved
  );

  // And the suite as a whole left the catalogue as it found it.
  const catalogueAfter = await cdp.evaluate(
    `fetch('/api/admin/products/playstation-5-slim-disc-1tb')
       .then(r => r.json())
       .then(d => JSON.stringify({ price: d.price, mrp: d.mrp, sku: d.sku }))`
  );
  check(
    "the suite leaves the catalogue's own products alone",
    catalogueAfter === catalogueBefore,
    `${catalogueBefore} -> ${catalogueAfter}`
  );

  await cdp.shot("19-admin-catalogue", true);

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${failed.length === 0 ? "✓ ALL PASS" : `✗ ${failed.length} FAILED`} — ${checks.length} checks\n`
  );
} catch (err) {
  console.error("\n✗ E2E ERROR:", err.message);
  exitCode = 1;
} finally {
  // The stock is put back before the browser goes, so the demo store is
  // left as it was found. The orders this run placed are cancelled first,
  // which is what puts the stock back — the same way the shop does it.
  try {
    for (const id of placedOrders) {
      await cdp.evaluate(`fetch('/api/admin/orders/${id}', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      }).then(r => r.text()).then(() => 'OK')`);
    }
  } catch (err) {
    console.error("  ! an order could not be cancelled:", err.message);
  }
  try {
    await restoreStock();
  } catch (err) {
    console.error("  ! the stock could not be put back:", err.message);
  }
  // The account this run registered goes too. It is removed through the
  // back office's own delete endpoint — the same way the products this run
  // created are removed — so the store is left as it was found rather than
  // collecting a test account on every run.
  //
  // The guard is deliberate: only an address shaped like this run's own
  // fixture is ever removed, so no real account can be deleted by mistake.
  try {
    if (!/^e2e\d+@example\.com$/.test(ACCOUNT.email)) {
      throw new Error(`refusing to remove ${ACCOUNT.email}`);
    }
    const admin = new DatabaseSync(join(ROOT, "data/store.db"))
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(ACCOUNT.email);
    if (admin) {
      await cdp.evaluate(
        `fetch('/api/admin/users/${admin.id}', { method: 'DELETE' }).then(r => r.text()).then(() => 'OK')`
      );
      console.log(`  ✓ the test account ${ACCOUNT.email} was removed`);
    }
  } catch (err) {
    console.error("  ! the test account could not be removed:", err.message);
  }
  chrome?.kill();
  await sleep(300);
  // The Chrome profile the run used is left where it is. It is scratch
  // space, it is ignored by git, and the next run reuses it.
}

process.exit(exitCode);
