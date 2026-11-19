/**
 * The checkout's error handling.
 *
 *   node scripts/check-checkout-errors.mjs
 *
 * The dev server must be running on port 3000.
 *
 * It drives a real browser through the mistakes a customer can make at
 * the checkout, and checks that each one is answered the same way: the
 * page moves to the field that is wrong, the field is marked, a pop-up
 * says what is wrong with it, and the caret is put in it so it can be
 * put right at once.
 *
 * The same is checked on a phone, where the form is taller than the
 * screen and the keyboard covers the foot of it — the case where
 * "scroll to the field" has to be got right.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput, clickByText, clickAway, focusField, pressTab, typeText, waitFor, waitForLive } from "./lib/browser.mjs";
import { shopDb, tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9231;
const STAMP = Date.now();

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

/** Where the browser is. */
const where = () => cdp.evaluate("location.pathname");

/** What the page says. */
const text = () => cdp.evaluate("document.body.innerText");

/** The account this run uses. */
const ACCOUNT = {
  name: "Priya Raman",
  email: `checkout-errors-${STAMP}@example.com`,
  password: "playstation1",
};

/**
 * What is wrong with a field, as the page shows it.
 *
 * The message under the field, and the pop-up that stands away from
 * it.
 */
const fieldState = (name) => `(() => {
  const el = document.querySelector('[name="${name}"]');
  if (!el) return { found: false };
  const described = el.getAttribute('aria-describedby');
  const msg = described ? document.getElementById(described) : null;
  const cs = getComputedStyle(el);
  return {
    found: true,
    message: msg ? msg.textContent.trim() : null,
    invalid: el.getAttribute('aria-invalid') === 'true',
    border: cs.borderTopColor,
    focused: document.activeElement === el,
    inView: (() => {
      const r = el.getBoundingClientRect();
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      return r.top >= 0 && r.bottom <= h;
    })(),
  };
})()`;

/** The pop-up, if there is one. */
const popups = `(() => {
  const all = [...document.querySelectorAll('[role="alert"], [role="status"]')]
    .filter(el => el.textContent.trim().length > 0);
  return all.map(el => ({
    text: el.textContent.trim(),
    visible: (() => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })(),
  }));
})()`;

/**
 * Signs up a customer, the way a customer would.
 *
 * The account is made through the shop's own sign-up page rather than
 * written into the database, so that what is checked is the way the
 * shop really makes an account.
 */
async function register() {
  await cdp.goto(`${BASE}/register`);
  // The page is waited for until React has taken it over, or what is
  // typed into it is lost.
  await waitForLive(cdp, "#email");
  await cdp.evaluate(setInput("name", ACCOUNT.name));
  await cdp.evaluate(setInput("email", ACCOUNT.email));
  await cdp.evaluate(setInput("password", ACCOUNT.password));
  await cdp.evaluate(setInput("confirm", ACCOUNT.password));
  const terms = await cdp.evaluate(
    `(() => {
       const el = document.querySelector('[name="terms"]');
       if (!el) return 'NO_TERMS';
       if (!el.checked) el.click();
       return el.checked ? 'CHECKED' : 'FAILED';
     })()`
  );
  if (terms !== "CHECKED") {
    console.log(`  ✗ the sign-up form has no terms box — ${terms}`);
    failures++;
    return false;
  }
  await cdp.evaluate(clickByText("Create account"));
  const away = await waitFor(cdp, "!location.pathname.startsWith('/register')");
  return Boolean(away);
}

/**
 * Puts something in the basket, so that the checkout has a basket.
 *
 * The product is found from the shop's own page, so that the check does
 * not depend on a particular product being there.
 */
async function fillBasket() {
  await cdp.goto(`${BASE}/shop`);
  const slug = await waitFor(
    cdp,
    `(() => {
       const a = [...document.querySelectorAll('a[href^="/product/"]')][0];
       return a ? a.getAttribute('href') : '';
     })()`,
    { timeout: 20000 }
  );
  if (!slug) return false;

  await cdp.goto(`${BASE}${slug}`);
  const added = await waitFor(
    cdp,
    `(() => {
       const b = [...document.querySelectorAll('button')]
         .find(x => /add to cart/i.test(x.textContent));
       return b ? b.textContent : '';
     })()`,
    { timeout: 20000 }
  );
  if (!added) return false;

  await cdp.evaluate(clickByText("Add to cart"));

  // The basket is waited for, rather than the clock: the shop's
  // database is a long way off, and the checkout has something to show
  // only once the basket is really there.
  const inBasket = await waitFor(
    cdp,
    `(() => {
       const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/cart');
       const m = link && link.textContent.match(/(\\d+)/);
       return m && Number(m[1]) >= 1 ? m[1] : '';
     })()`,
    { timeout: 30000 }
  );
  return Boolean(inBasket);
}

/** Chooses cash on delivery, so that no gateway is needed. */
const pickCashOnDelivery = `(() => {
  const el = document.querySelector('input[name="paymentMethod"][value="cod"]');
  if (!el) return 'NOT_FOUND';
  el.click();
  return 'CLICKED';
})()`;

/**
 * Types into a field and leaves it, the way a customer would.
 *
 * The field is emptied first — the shop fills some of them in from the
 * account, and a customer who types over what is there replaces it.
 * Then the caret is put in the field, the text is typed into it, and
 * the tab key is pressed to move on, which is what makes the browser
 * say the field has been left.
 */
async function typeAndLeave(name, text) {
  await cdp.evaluate(setInput(name, ""));
  await focusField(cdp, name);
  await sleep(150);
  await typeText(cdp, text);
  await sleep(150);
  await pressTab(cdp);
  await sleep(400);
}

/** Puts the phone into a phone's shape. */
async function asPhone(width = 390, height = 844) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(400);
}

let chrome;
let cdp;

try {
  console.log("→ launching Chrome");
  const launched = await launchChrome({
    port: PORT,
    // The Chrome profile lives in the OS temp directory, never inside
    // the project: Turbopack watches the whole project tree, and a
    // profile Chrome holds locked there panics it during a CSS
    // rebuild.
    profile: join(tmpdir(), "consoleseller-checkout-errors-chrome"),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;

  // The profile is reused between runs, so the last run's sign-in would
  // still be here and the customer would arrive at the shop already
  // signed in.
  await cdp.send("Network.clearBrowserCookies");

  section("0. A customer with a basket");
  check("the sign-up works", await register());
  check("something goes in the basket", await fillBasket());

  await cdp.goto(`${BASE}/checkout`);
  check("the checkout is reached", (await where()) === "/checkout", await where());

  /* --------------------------------------------------------------- */
  section("1. A mistake in one field");

  // A phone number that cannot be dialled, typed and then left.
  await typeAndLeave("phone", "123");

  {
    const phone = await cdp.evaluate(fieldState("phone"));
    check(
      "the phone is marked as wrong",
      phone.invalid === true,
      `invalid=${phone.invalid}`
    );
    check(
      "and the reason is written under it",
      phone.message === "Enter a valid phone number.",
      phone.message ?? "no message"
    );
    check(
      "and its edge is red",
      phone.border === "rgb(220, 38, 38)",
      phone.border
    );
  }

  /* --------------------------------------------------------------- */
  section("2. The pop-up says which detail is wrong");
  {
    const shown = await cdp.evaluate(popups);
    const joined = shown.map((s) => s.text).join(" | ");
    check(
      "a pop-up is shown",
      shown.some((s) => s.visible),
      joined
    );
    check(
      "it names the phone number",
      /invalid phone number/i.test(joined),
      joined
    );
    check(
      "and it is still there a few seconds later",
      await (async () => {
        await sleep(2500);
        const later = await cdp.evaluate(popups);
        return later.some((s) => s.visible && /invalid phone number/i.test(s.text));
      })(),
      "checked after 2.5 seconds"
    );
  }

  /* --------------------------------------------------------------- */
  section("1b. A customer who walks away from the form is taken back");
  {
    // A customer who types a mistake and clicks away from the form
    // altogether — not on to the next field — is brought back to it, so
    // that the mistake can be put right at once.
    await cdp.evaluate(setInput("city", ""));
    await focusField(cdp, "city");
    await sleep(150);
    await typeText(cdp, "P");
    await sleep(150);
    await clickAway(cdp, "h1");
    await sleep(700);

    const city = await cdp.evaluate(fieldState("city"));
    check(
      "the city is marked as wrong",
      city.invalid === true,
      `invalid=${city.invalid}`
    );
    check(
      "with its own reason",
      city.message === "Enter your city.",
      city.message ?? "no message"
    );
    check(
      "and the caret is put back in it",
      city.focused === true,
      `focused=${city.focused}`
    );
  }

  /* --------------------------------------------------------------- */
  section("1c. A customer who moves on to the next field is not dragged back");
  {
    await cdp.evaluate(setInput("address2", ""));
    await focusField(cdp, "address2");
    await sleep(150);
    await typeText(cdp, "x");
    await sleep(150);
    // The tab key moves the caret on to the next field, which is what
    // a customer does when they have finished with one.
    await pressTab(cdp);
    await sleep(700);

    const address2 = await cdp.evaluate(fieldState("address2"));
    check(
      "the caret was not taken back from the next field",
      address2.focused === false,
      `focused=${address2.focused}`
    );
  }

  /* --------------------------------------------------------------- */
  section("3. Another field is checked on its own");
  {
    await typeAndLeave("email", "not-an-address");
    const email = await cdp.evaluate(fieldState("email"));
    check(
      "the email is marked as wrong",
      email.invalid === true,
      `invalid=${email.invalid}`
    );
    check(
      "with its own reason",
      email.message === "Enter a valid email address.",
      email.message ?? "no message"
    );

    const shown = await cdp.evaluate(popups);
    check(
      "and the pop-up names the email",
      shown.some((s) => /invalid email address/i.test(s.text)),
      shown.map((s) => s.text).join(" | ")
    );
  }

  /* --------------------------------------------------------------- */
  section("4. The reason goes when it is put right");
  {
    await cdp.evaluate(setInput("phone", "9876543210"));
    await sleep(300);
    const phone = await cdp.evaluate(fieldState("phone"));
    check(
      "the mark on the phone goes",
      phone.invalid === false,
      `invalid=${phone.invalid}`
    );
    check(
      "and the message under it goes with it",
      phone.message === null,
      phone.message ?? "no message"
    );
  }

  /* --------------------------------------------------------------- */
  section("5. Sending the form takes the customer to the field");
  {
    // Start again with a fresh mistake, so that the send is refused.
    await cdp.goto(`${BASE}/checkout`);
    await cdp.evaluate(setInput("phone", "12345"));
    await cdp.evaluate(setInput("email", "still-not-an-address"));
    await cdp.evaluate(pickCashOnDelivery);
    await sleep(200);

    // Scroll to the foot of the form, the way a customer does before
    // pressing the button.
    await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(300);

    await cdp.evaluate(clickByText("Place order"));
    await sleep(700);

    check(
      "the form is not sent",
      (await where()) === "/checkout",
      await where()
    );

    const email = await cdp.evaluate(fieldState("email"));
    check(
      "the email is marked",
      email.invalid === true,
      `invalid=${email.invalid}`
    );
    check(
      "and the reason is written under it",
      email.message === "Enter a valid email address.",
      email.message ?? "no message"
    );
    check(
      "the caret is put in it",
      email.focused === true,
      `focused=${email.focused}`
    );
    check(
      "and the page has moved to it",
      email.inView === true,
      `inView=${email.inView}`
    );

    const shown = await cdp.evaluate(popups);
    const joined = shown.map((s) => s.text).join(" | ");
    check(
      "and a pop-up says which detail is wrong",
      /invalid email address/i.test(joined),
      joined
    );
  }

  /* --------------------------------------------------------------- */
  section("6. The same on a phone");
  {
    await asPhone();
    await cdp.goto(`${BASE}/checkout`);
    await sleep(400);

    await cdp.evaluate(setInput("pincode", "41"));
    await cdp.evaluate(setInput("email", "not-an-address"));
    await cdp.evaluate(pickCashOnDelivery);
    await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(300);

    await cdp.evaluate(clickByText("Place order"));
    await sleep(800);

    const email = await cdp.evaluate(fieldState("email"));
    check(
      "the email is marked",
      email.invalid === true,
      `invalid=${email.invalid}`
    );
    check(
      "the caret is put in it",
      email.focused === true,
      `focused=${email.focused}`
    );
    check(
      "and the page has moved to it",
      email.inView === true,
      `inView=${email.inView}`
    );

    const pincode = await cdp.evaluate(fieldState("pincode"));
    check(
      "the PIN code is marked as well",
      pincode.invalid === true,
      `invalid=${pincode.invalid}`
    );
    check(
      "with its own reason",
      pincode.message === "PIN code must be 6 digits.",
      pincode.message ?? "no message"
    );

    const shown = await cdp.evaluate(popups);
    const joined = shown.map((s) => s.text).join(" | ");
    check(
      "and a pop-up says which detail is wrong",
      /invalid email address|invalid pin code/i.test(joined),
      joined
    );

    await cdp.shot("checkout-errors-phone", false);
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  }

  /* --------------------------------------------------------------- */
  section("7. The shop still refuses the same details");
  {
    // The shop checks again on its own side. It must refuse what the
    // form refused, or the two would disagree.
    await cdp.goto(`${BASE}/checkout`);
    await sleep(300);

    const refused = await cdp.evaluate(`fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Raman', email: 'not-an-address', phone: '9876543210',
        address1: '12 Palm Grove, Baner', city: 'Pune', state: 'Maharashtra',
        pincode: '411045', paymentMethod: 'cod',
      }),
    }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))`);

    check(
      "the shop refuses a bad email",
      refused.status === 400,
      `HTTP ${refused.status}`
    );
    check(
      "and names the email as the one that is wrong",
      refused.body?.errors?.email === "Enter a valid email address.",
      refused.body?.errors?.email ?? "no message"
    );
  }
} catch (err) {
  console.log(`\n✗ the check did not finish — ${err.message}`);
  failures++;
} finally {
  // The account this run registered goes too, through the back office's
  // own delete endpoint, so the store is left as it was found rather
  // than collecting a test account on every run.
  //
  // The guard is deliberate: only an address shaped like this run's own
  // fixture is ever removed, so no real account can be deleted by
  // mistake.
  try {
    if (!/^checkout-errors-\d+@example\.com$/.test(ACCOUNT.email)) {
      throw new Error(`refusing to remove ${ACCOUNT.email}`);
    }
    const pool = shopDb();
    const { rows } = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [ACCOUNT.email]
    );
    await pool.end();
    if (rows[0]) {
      const admin = await tokenForRole("admin");
      const res = await fetch(`${BASE}/api/admin/users/${rows[0].id}`, {
        method: "DELETE",
        headers: { cookie: `pf_auth=${admin}` },
      });
      if (res.ok) {
        console.log(`  ✓ the test account ${ACCOUNT.email} was removed`);
      } else {
        console.error(
          `  ! the test account could not be removed — ${res.status}`
        );
      }
    }
  } catch (err) {
    console.error("  ! the test account could not be removed:", err.message);
  }
  if (chrome) chrome.kill();
  // The browser is given a moment to let go of its handles before the
  // process goes, which is what keeps Windows from complaining on the
  // way out.
  await sleep(400);
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — checkout errors"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
