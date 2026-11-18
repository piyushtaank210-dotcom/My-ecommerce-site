/**
 * Checks that the options of a product are still managed from the editor.
 *
 *   node scripts/check-editor-variants.mjs
 *
 * The dev server must be running on port 3000.
 *
 * The options of a product are managed through their own actions rather
 * than through the product's own save, so the editor carries the panel
 * that does it. This checks that the panel is there, that it shows the
 * options the product has, and that an option may be changed from it and
 * that the change is kept.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, waitForLive } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9234;

const FIXTURE = "zz-variants-fixture";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const admin = await tokenForRole("admin");

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

/** Fills a form control the way a person would, so React notices. */
const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'NOT_FOUND';
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'SET';
})()`;

/** What the variations panel is showing right now. */
const READ = `(() => {
  const panel = [...document.querySelectorAll('section')].find(s =>
    s.textContent.includes('Variations') && s.querySelector('table'));
  if (!panel) return { missing: true };
  const rows = [...panel.querySelectorAll('tbody tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => td.textContent.replace(/\\s+/g, ' ').trim()));
  const attributes = [...panel.querySelectorAll('input[aria-label="Attribute name"]')]
    .map(el => el.value);
  return {
    rows,
    attributes,
    hasAddOption: [...panel.querySelectorAll('button')]
      .some(b => b.textContent.trim() === 'Add an option'),
  };
})()`;

let chrome;
let cdp;

try {
  const launched = await launchChrome({
    port: PORT,
    profile: join(tmpdir(), "consoleseller-editor-variants-chrome-" + Date.now().toString(36)),
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

  // The ground is cleared first, through the back office's own API.
  const leftovers = await api("/api/admin/products?limit=100");
  for (const p of leftovers.json?.rows ?? []) {
    if (!p.slug.startsWith(FIXTURE)) continue;
    await api(`/api/admin/products/${p.slug}`, { method: "DELETE" });
  }

  const created = await api("/api/admin/products", {
    method: "POST",
    body: JSON.stringify({
      slug: FIXTURE,
      name: "Zephyr Variants Fixture",
      brand: "Zephyr",
      category: "consoles",
      price: 10000,
      mrp: 12000,
      stock: 0,
    }),
  });
  check("the fixture product was made", created.status === 201, `status ${created.status}`);

  // What the product varies by.
  const attributed = await api(`/api/admin/products/${FIXTURE}/attributes`, {
    method: "PATCH",
    body: JSON.stringify({ attributes: { Colour: ["White", "Black"] } }),
  });
  check(
    "the attributes were saved",
    attributed.status === 200,
    JSON.stringify(attributed.json?.attributes)
  );

  // Two options.
  for (const colour of ["White", "Black"]) {
    await api(`/api/admin/products/${FIXTURE}/variants`, {
      method: "POST",
      body: JSON.stringify({
        name: colour,
        attributes: { Colour: colour },
        price: colour === "White" ? 10000 : 11000,
        mrp: 12000,
        stock: colour === "White" ? 5 : 2,
      }),
    });
  }

  console.log("\n→ the variations panel in the editor");
  await cdp.goto(`${BASE}/admin/products/${FIXTURE}`);
  await waitForLive(cdp, ".admin-editor-sheet");
  await sleep(1200);

  const shown = await cdp.evaluate(READ);
  check("the panel is there", !shown.missing, shown.missing ? "no panel" : "");
  check("it shows what the product varies by", shown.attributes?.includes("Colour"), shown.attributes?.join(", "));
  check("it shows both options", shown.rows?.length === 2, String(shown.rows?.length));
  check(
    "the options carry their own prices",
    shown.rows?.some((r) => r.join(" ").includes("10,000")) &&
      shown.rows?.some((r) => r.join(" ").includes("11,000")),
    JSON.stringify(shown.rows)
  );
  check(
    "the options carry their own stock",
    shown.rows?.some((r) => r[4]?.trim().startsWith("5")) &&
      shown.rows?.some((r) => r[4]?.trim().startsWith("2")),
    JSON.stringify(shown.rows?.map((r) => r[4]))
  );

  console.log("\n→ changing an option from the editor");
  const openEditor = `(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const edit = [...rows[0].querySelectorAll('button')].find(b =>
      b.textContent.trim() === 'Edit');
    if (!edit) return 'NOT_FOUND';
    edit.click();
    return 'CLICKED';
  })()`;
  await cdp.evaluate(openEditor);
  await sleep(800);

  await cdp.evaluate(setInput("#variant-price", "10500"));
  const save = `(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      x.textContent.trim() === 'Save the option');
    if (!b) return 'NOT_FOUND';
    b.click();
    return 'CLICKED';
  })()`;
  await cdp.evaluate(save);
  await sleep(3000);

  const after = await api(`/api/admin/products/${FIXTURE}/variants`);
  const white = (after.json?.variants ?? []).find(
    (v) => v.attributes?.Colour === "White"
  );
  check("the new price was saved", white?.price === 10500, String(white?.price));
  check("the stock was not touched", white?.stock === 5, String(white?.stock));

  console.log("\n→ and the product still knows about them");
  const product = await api(`/api/admin/products/${FIXTURE}`);
  check("the product has both options", product.json?.variants?.length === 2, String(product.json?.variants?.length));
  check(
    "the product is stocked by them",
    product.json?.sellable_stock === 7,
    String(product.json?.sellable_stock)
  );

  const removed = await api(`/api/admin/products/${FIXTURE}`, {
    method: "DELETE",
  });
  check("the fixture was removed", removed.status === 200, `status ${removed.status}`);
} finally {
  chrome?.kill();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — the editor's variations"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
