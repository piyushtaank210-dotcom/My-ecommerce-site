/**
 * Drives the product editor the way an administrator would, and checks
 * that what was typed is what was saved.
 *
 *   node scripts/check-editor-form.mjs
 *
 * The dev server must be running on port 3000.
 *
 * The API is checked by `check-product-form.mjs`. This one checks the
 * other half: that the editor itself — its fields, its buttons and its
 * rich-text box — is wired to the save, that what is typed is what
 * reaches the database, and that the product comes back with everything
 * it was given.
 *
 * Everything it creates is removed through the back office's own API, so
 * that the test never writes to the catalogue directly.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, setInput, waitFor, waitForLive } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9230;

const FIXTURE = "zz-editor-fixture";
const NAME = "Zephyr Editor Fixture";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const admin = await tokenForRole("admin");

/** The back office's own API, used to look at what was saved. */
async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      cookie: `pf_auth=${admin}`,
      ...(options.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
    },
  });
  const body = await res.text();
  try {
    return { status: res.status, json: JSON.parse(body) };
  } catch {
    return { status: res.status, json: null, body };
  }
}

/** Fills the rich-text box and says so, the way typing into it does. */
const setRichText = (html) => `(() => {
  const el = document.querySelector('[contenteditable="true"]');
  if (!el) return 'NOT_FOUND';
  el.innerHTML = ${JSON.stringify(html)};
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  return 'SET';
})()`;

/** Fills a control by its id, for the boxes that carry no name. */
const setById = (id, value) => `(() => {
  const el = document.querySelector('#${id}');
  if (!el) return 'NOT_FOUND';
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'SET';
})()`;

/** Ticks the box that shows the sale badge, which brings the mark into view. */
const tickSaleBadge = `(() => {
  const box = [...document.querySelectorAll('input[type="checkbox"]')].find(el =>
    el.closest('label') && el.closest('label').textContent.includes('sale badge'));
  if (!box) return 'NOT_FOUND';
  if (!box.checked) box.click();
  return box.checked ? 'CHECKED' : 'FAILED';
})()`;
/** Presses Enter in the tag box, which is what makes a tag. */
const addTag = (tag) => `(() => {
  const el = document.querySelector('#tags');
  if (!el) return 'NOT_FOUND';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(tag)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'SET';
})()`;

/** Clicks the button that says what is written on it. */
const clickText = (text) => `(() => {
  const el = [...document.querySelectorAll('button, a')].find(x =>
    x.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())});
  if (!el) return 'NOT_FOUND';
  el.click();
  return 'CLICKED';
})()`;

/** What the editor is showing right now. */
const READ = `(() => {
  const value = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : null;
  };
  const rich = document.querySelector('[contenteditable="true"]');
  return {
    name: value('#name'),
    slug: value('#slug'),
    price: value('#price'),
    mrp: value('#mrp'),
    stock: value('#stock'),
    sku: value('#sku'),
    shortDesc: value('#shortDesc'),
    description: rich ? rich.innerHTML : null,
    tags: [...document.querySelectorAll('.admin-tag')].map(t =>
      t.textContent.replace(/\\s+/g, ' ').trim()),
    badge: value('#badge'),
    seoTitle: value('#seoTitle'),
    metaDescription: value('#metaDescription'),
    path: location.pathname,
  };
})()`;

let chrome;
let cdp;

try {
  const launched = await launchChrome({
    port: PORT,
    profile: join(tmpdir(), "consoleseller-editor-form-chrome-" + Date.now().toString(36)),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: admin,
    domain: "localhost",
    path: "/",
  });

  // A run that was interrupted leaves its fixture behind, so the ground is
  // cleared first — through the back office's own API.
  const leftovers = await api("/api/admin/products?limit=100");
  for (const p of leftovers.json?.rows ?? []) {
    if (!p.slug.startsWith("zz-editor-fixture")) continue;
    await api(`/api/admin/products/${p.slug}`, { method: "DELETE" });
  }

  /* ------------------------------------------------------------- adding */
  console.log("\n→ adding a product through the editor");
  await cdp.goto(`${BASE}/admin/products/new`);
  await waitForLive(cdp, "#name");

  await cdp.evaluate(setInput("name", NAME));
  await sleep(400);

  // The address follows the name until somebody writes it by hand.
  const generated = await cdp.evaluate(READ);
  check(
    "the address follows the name",
    generated.slug === "zephyr-editor-fixture",
    generated.slug
  );

  await cdp.evaluate(setInput("slug", FIXTURE));
  await cdp.evaluate(setInput("price", "49990"));
  await cdp.evaluate(setInput("mrp", "59990"));
  await cdp.evaluate(setInput("stock", "9"));
  await cdp.evaluate(setInput("lowStockThreshold", "4"));
  await cdp.evaluate(setInput("shortDesc", "A console that plays the games."));
  await cdp.evaluate(setById("brand", "Zephyr"));
  await cdp.evaluate(
    setRichText(
      "<p>A console with <strong>two</strong> controllers.</p><ul><li>HDMI 2.1</li></ul>"
    )
  );
  await cdp.evaluate(addTag("gift"));
  await cdp.evaluate(addTag("new"));

  const before = await cdp.evaluate(READ);
  check("the name is in the title field", before.name === NAME, before.name);
  check(
    "the address was written by hand",
    before.slug === FIXTURE,
    before.slug
  );
  check("the tags are shown as chips", before.tags.length === 2, before.tags.join(", "));

  // Save.
  await cdp.evaluate(clickText("Save"));
  await sleep(3000);
  const said = await cdp.evaluate(`(() => {
    const alert = document.querySelector('[role="alert"]');
    return {
      alert: alert ? alert.textContent.trim() : null,
      path: location.pathname,
      errors: [...document.querySelectorAll(".admin-error")].map(e => e.textContent.trim()),
    };
  })()`);
  if (said.alert) console.log("    the editor said:", said.alert);
  const arrived = await waitFor(
    cdp,
    `location.pathname.startsWith('/admin/products/${FIXTURE}')`
  );
  check("the editor becomes the editor for the product it made", Boolean(arrived));

  const created = await api(`/api/admin/products/${FIXTURE}`);
  check("the product was made", created.status === 200, `status ${created.status}`);
  const p = created.json;
  check("the name was saved", p?.name === NAME, p?.name);
  check("the selling price was saved", p?.price === 49990, String(p?.price));
  check("the retail price was saved", p?.mrp === 59990, String(p?.mrp));
  check("the stock was saved", p?.stock === 9, String(p?.stock));
  check("the reorder point was saved", p?.low_stock_threshold === 4, String(p?.low_stock_threshold));
  check("the short description was saved", p?.short_desc === "A console that plays the games.", p?.short_desc);
  check("the brand was saved", p?.brand === "Zephyr", p?.brand);
  check(
    "the tags were saved",
    Array.isArray(p?.tags) && p.tags.join(",") === "gift,new",
    JSON.stringify(p?.tags)
  );
  check(
    "the description was saved as markup",
    typeof p?.description === "string" && p.description.includes("<strong>"),
    p?.description
  );
  check("a code was made for it", Boolean(p?.sku), p?.sku);
  check("it starts as a draft", p?.status === "draft", p?.status);

  /* ------------------------------------------------------------ editing */
  console.log("\n→ changing it through the editor");
  await cdp.goto(`${BASE}/admin/products/${FIXTURE}`);
  await waitForLive(cdp, "#name");
  await sleep(800);

  const loaded = await cdp.evaluate(READ);
  check("the name came back", loaded.name === NAME, loaded.name);
  check("the price came back", loaded.price === "49990", loaded.price);
  check("the stock came back", loaded.stock === "9", loaded.stock);
  check(
    "the description came back with its markup",
    typeof loaded.description === "string" && loaded.description.includes("<strong>"),
    loaded.description
  );
  check(
    "the tags came back as chips",
    loaded.tags.length === 2,
    loaded.tags.join(", ")
  );

  await cdp.evaluate(setInput("price", "44990"));
  await cdp.evaluate(setInput("shortDesc", "A console that plays the games, cheaper."));
  await cdp.evaluate(tickSaleBadge);
  await sleep(300);
  await cdp.evaluate(setInput("badge", "New"));
  await cdp.evaluate(addTag("limited"));
  await cdp.evaluate(
    setRichText("<p>Now with <em>two</em> years of warranty.</p>")
  );
  await cdp.evaluate(clickText("Save"));
  await sleep(2500);

  const changed = await api(`/api/admin/products/${FIXTURE}`);
  check("the new price was saved", changed.json?.price === 44990, String(changed.json?.price));
  check(
    "the new short description was saved",
    changed.json?.short_desc === "A console that plays the games, cheaper.",
    changed.json?.short_desc
  );
  check("the badge was saved", changed.json?.badge === "New", changed.json?.badge);
  check(
    "the new tag was added and the old ones kept",
    Array.isArray(changed.json?.tags) &&
      changed.json.tags.join(",") === "gift,new,limited",
    JSON.stringify(changed.json?.tags)
  );
  check(
    "the new description was saved",
    typeof changed.json?.description === "string" &&
      changed.json.description.includes("<em>"),
    changed.json?.description
  );

  /* ------------------------------------------------- it comes back again */
  console.log("\n→ opening it a second time");
  await cdp.goto(`${BASE}/admin/products/${FIXTURE}`);
  await waitForLive(cdp, "#name");
  await sleep(800);
  const again = await cdp.evaluate(READ);
  check("the price is still there", again.price === "44990", again.price);
  check(
    "the tags are still there",
    again.tags.join(",") === "gift,new,limited",
    again.tags.join(", ")
  );
  check("the badge is still there", again.badge === "New", again.badge);
  check(
    "the description is still there",
    typeof again.description === "string" && again.description.includes("<em>"),
    again.description
  );

  /* ------------------------------------------------------- what is safe */
  console.log("\n→ what the editor refuses");
  await cdp.goto(`${BASE}/admin/products/${FIXTURE}`);
  await waitForLive(cdp, "#name");
  await sleep(600);
  await cdp.evaluate(
    setRichText('<p>Safe</p><script>window.__pwned = true;</script><img src=x onerror="window.__pwned = true">')
  );
  await cdp.evaluate(clickText("Save"));
  await sleep(2500);

  const scrubbed = await api(`/api/admin/products/${FIXTURE}`);
  check(
    "a script in the description is not kept",
    typeof scrubbed.json?.description === "string" &&
      !scrubbed.json.description.toLowerCase().includes("<script"),
    scrubbed.json?.description
  );
  check(
    "the words around it are kept",
    typeof scrubbed.json?.description === "string" &&
      scrubbed.json.description.includes("Safe"),
    scrubbed.json?.description
  );

  const shop = await api(`/product/${FIXTURE}`);
  check("the shop still shows the product", shop.status === 200, `status ${shop.status}`);
  check(
    "the shop does not run the script",
    typeof shop.body === "string" && !shop.body.includes("__pwned"),
    ""
  );

  /* ---------------------------------------------------------- cleaning */
  const removed = await api(`/api/admin/products/${FIXTURE}`, {
    method: "DELETE",
  });
  check(
    "the fixture was removed",
    removed.status === 200,
    `status ${removed.status} ${removed.json?.error ?? ""}`
  );
} finally {
  chrome?.kill();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — the product editor's form"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
