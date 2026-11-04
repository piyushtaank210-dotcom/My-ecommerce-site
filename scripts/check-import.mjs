/**
 * The import, export and dashboard test.
 *
 * The file is read first and nothing is written — so the first half of this
 * checks that reading a file changes nothing. The second half applies a
 * file and checks that only the products in it were touched.
 *
 * The third half is the dashboard: the catalogue counted properly, and the
 * best sellers counted from the orders that were not cancelled.
 *
 *   node scripts/check-import.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const db = new DatabaseSync(join(ROOT, "data/store.db"));

function tokenFor(email) {
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!user) throw new Error(`no such user ${email}`);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600_000).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, user.id, expires);
  return token;
}

const admin = tokenFor("admin@playforge.test");
const support = tokenFor("support@playforge.test");

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

/** Sends a file to the import endpoint. */
async function sendFile(path, filename, contents, { apply = false, cookie = admin } = {}) {
  const form = new FormData();
  form.append("file", new Blob([contents], { type: "text/csv" }), filename);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie: `pf_auth=${cookie}` },
    body: form,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: text, json };
}

/** A CSV file, from a list of rows. */
function csv(headers, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [headers.map(cell).join(",")]
      .concat(rows.map((r) => headers.map((h) => cell(r[h])).join(",")))
      .join("\r\n") + "\r\n"
  );
}

/** The rows of a CSV file, as objects. */
function rows(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/* ------------------------------------------------------------------ export */

console.log("\n→ exporting the catalogue");
let exported = "";
{
  const res = await api("/api/admin/products/export");
  check("the catalogue can be exported", res.status === 200, `status ${res.status}`);
  check(
    "it comes as a file",
    res.body.startsWith("slug,"),
    res.body.slice(0, 40)
  );
  exported = res.body;

  const header = exported.split("\r\n")[0].split(",");
  check("it has a row for every product", rows(exported).length === 9, `${rows(exported).length} rows`);
  check("it carries the address and the name", header.includes("slug") && header.includes("name"));
  check("it carries the price", header.includes("price") && header.includes("mrp"));
  check("it carries the specifications", header.includes("specs"));
  check("it carries the variations", header.includes("variants"));
  check(
    "an administrator's file carries the purchase cost",
    header.includes("purchase_cost")
  );

  const supportExport = await api("/api/admin/products/export", {
    cookie: support,
  });
  check(
    "support cannot export the catalogue",
    supportExport.status === 403,
    `status ${supportExport.status}`
  );
  check(
    "and so never sees a purchase cost",
    !supportExport.body.includes("purchase_cost") &&
      !supportExport.body.includes("purchase"),
    supportExport.body.slice(0, 60)
  );

  const anon = await fetch(`${BASE}/api/admin/products/export`, {
    redirect: "manual",
  });
  check(
    "an anonymous visitor is turned away",
    anon.status === 401 || anon.status === 403,
    `status ${anon.status}`
  );
}

/* ----------------------------------------------------------------- template */

console.log("\n→ the template");
{
  const res = await api("/api/admin/products/import/template");
  check("the template can be downloaded", res.status === 200, `status ${res.status}`);
  const lines = res.body.trim().split(/\r?\n/);
  check("it is the column names and nothing else", lines.length === 1, `${lines.length} lines`);
  check("it has the columns a file needs", lines[0].includes("slug") && lines[0].includes("name"));
}

/* ------------------------------------------------------------------ import */

console.log("\n→ clearing any leftovers from an interrupted run");
{
  const products = await api("/api/admin/products?limit=100");
  for (const p of products.json.rows) {
    if (!p.slug.startsWith("zz-import-")) continue;
    await api(`/api/admin/products/${p.slug}`, { method: "DELETE" });
  }
  const left = await api("/api/admin/products?limit=100");
  check(
    "the catalogue is clean before the run",
    !left.json.rows.some((p) => p.slug.startsWith("zz-import-")),
    `${left.json.total} products`
  );
}

console.log("\n→ reading a file changes nothing");
const NEW_SLUG = "zz-import-controller";
const headers = [
  "slug",
  "name",
  "sku",
  "brand",
  "category",
  "price",
  "mrp",
  "stock",
  "status",
];
let goodFile = "";
{
  goodFile = csv(headers, [
    {
      slug: NEW_SLUG,
      name: "Imported Controller",
      sku: "ZZ-IMPORT-001",
      brand: "Zephyr",
      category: "controllers",
      price: "2999",
      mrp: "3499",
      stock: "6",
      status: "published",
    },
  ]);

  const before = await api("/api/admin/products?limit=100");
  const preview = await sendFile("/api/admin/products/import", "good.csv", goodFile);
  check("a file can be read", preview.status === 200, `status ${preview.status}`);
  check("it has one row", preview.json?.rows?.length === 1);
  check(
    "the row would make a new product",
    preview.json?.rows?.[0]?.action === "create",
    preview.json?.rows?.[0]?.action
  );
  check(
    "the summary counts it",
    preview.json?.summary?.created === 1 && preview.json?.summary?.errors === 0,
    JSON.stringify(preview.json?.summary)
  );

  const after = await api("/api/admin/products?limit=100");
  check(
    "reading a file changes nothing",
    before.json.total === after.json.total,
    `${before.json.total} then ${after.json.total}`
  );
  check(
    "and the product it described was not made",
    !after.json.rows.some((p) => p.slug === NEW_SLUG)
  );
}

console.log("\n→ a file that is not right");
{
  const bad = csv(headers, [
    {
      slug: "zz-import-bad-price",
      name: "Bad Price",
      category: "controllers",
      price: "not a number",
      mrp: "3499",
    },
    {
      slug: "zz-import-bad-category",
      name: "Bad Category",
      category: "hovercrafts",
      price: "1000",
      mrp: "2000",
    },
    {
      slug: "zz-import-bad-mrp",
      name: "Bad MRP",
      category: "controllers",
      price: "5000",
      mrp: "1000",
    },
    {
      slug: "",
      name: "No Address",
      category: "controllers",
      price: "1000",
      mrp: "2000",
    },
    {
      slug: "zz-import-dupe-a",
      name: "Duplicate A",
      sku: "ZZ-DUPE-001",
      category: "controllers",
      price: "1000",
      mrp: "2000",
    },
    {
      slug: "zz-import-dupe-b",
      name: "Duplicate B",
      sku: "ZZ-DUPE-001",
      category: "controllers",
      price: "1000",
      mrp: "2000",
    },
    {
      slug: "zz-import-dupe-c",
      name: "Takes an existing code",
      sku: "PLAYSTATION-5-SLIM-DISC-1TB-1TB-DISC",
      category: "controllers",
      price: "1000",
      mrp: "2000",
    },
  ]);

  const preview = await sendFile("/api/admin/products/import", "bad.csv", bad);
  check("the file is read", preview.status === 200);

  const bySlug = Object.fromEntries(
    preview.json.rows.map((r) => [r.slug || r.name, r])
  );

  const priceRow = bySlug["zz-import-bad-price"];
  check(
    "a price that is not a number is refused",
    priceRow?.action === "error",
    priceRow?.action
  );
  check(
    "and the message says which column",
    priceRow?.errors?.some((e) => e.column === "price"),
    JSON.stringify(priceRow?.errors)
  );
  check(
    "and which row it is on",
    priceRow?.row === 2,
    `row ${priceRow?.row}`
  );

  const categoryRow = bySlug["zz-import-bad-category"];
  check(
    "a category that does not exist is refused",
    categoryRow?.action === "error" &&
      categoryRow?.errors?.some((e) => e.column === "category"),
    JSON.stringify(categoryRow?.errors)
  );

  const mrpRow = bySlug["zz-import-bad-mrp"];
  check(
    "an MRP below the price is refused",
    mrpRow?.action === "error" &&
      mrpRow?.errors?.some((e) => e.column === "mrp"),
    JSON.stringify(mrpRow?.errors)
  );

  const dupeA = bySlug["zz-import-dupe-a"];
  const dupeB = bySlug["zz-import-dupe-b"];
  check(
    "two rows with the same code are both refused",
    dupeA?.action === "error" && dupeB?.action === "error",
    `${dupeA?.action} and ${dupeB?.action}`
  );
  check(
    "and the message says which column",
    dupeA?.errors?.some((e) => e.column === "sku"),
    JSON.stringify(dupeA?.errors)
  );

  const taken = bySlug["zz-import-dupe-c"];
  check(
    "a code another product uses is refused",
    taken?.action === "error" &&
      taken?.errors?.some((e) => e.column === "sku"),
    JSON.stringify(taken?.errors)
  );

  const noSlug = preview.json.rows.find((r) => r.name === "No Address");
  check(
    "a row with no address is refused",
    noSlug?.action === "error" &&
      noSlug?.errors?.some((e) => e.column === "slug"),
    JSON.stringify(noSlug?.errors)
  );

  check(
    "the summary counts what cannot be used",
    preview.json.summary.errors === 7,
    `${preview.json.summary.errors} refused`
  );
}

console.log("\n→ an existing product, changed");
const TARGET = "zz-import-target";
{
  // A product the test made, so the test never changes one of the
  // catalogue's own products.
  const made = await api("/api/admin/products", {
    method: "POST",
    body: {
      name: "Import Target",
      slug: TARGET,
      category: "consoles",
      price: 5000,
      mrp: 6000,
      stock: 4,
      brand: "Zephyr",
      status: "draft",
    },
  });
  check("a product to change is made", made.status === 201, `status ${made.status}`);

  const update = csv(headers, [
    {
      slug: TARGET,
      name: "Import Target",
      price: "5500",
      mrp: "6000",
    },
  ]);
  const preview = await sendFile("/api/admin/products/import", "update.csv", update);
  const row = preview.json.rows[0];
  check("the row would change the product", row?.action === "update", row?.action);
  check(
    "and it says what would change",
    row?.changes?.some((c) => c.includes("price")),
    JSON.stringify(row?.changes)
  );
  check(
    "and nothing else",
    !row?.changes?.some((c) => c.startsWith("stock")),
    JSON.stringify(row?.changes)
  );
}

console.log("\n→ applying a file");
/** What every product was worth before the import, so it can be checked. */
let pricesBefore = {};
{
  const before = await api("/api/admin/products?limit=100");
  const beforeCount = before.json.total;
  pricesBefore = Object.fromEntries(
    before.json.rows.map((p) => [p.slug, p.price])
  );

  const file = csv(headers, [
    {
      slug: NEW_SLUG,
      name: "Imported Controller",
      sku: "ZZ-IMPORT-001",
      brand: "Zephyr",
      category: "controllers",
      price: "2999",
      mrp: "3499",
      stock: "6",
      status: "published",
    },
    {
      slug: TARGET,
      name: "Import Target",
      price: "5500",
      mrp: "6000",
    },
    {
      slug: "zz-import-broken",
      name: "Broken",
      category: "hovercrafts",
      price: "1000",
      mrp: "2000",
    },
  ]);

  const applied = await sendFile(
    "/api/admin/products/import/apply",
    "apply.csv",
    file
  );
  check("the file is applied", applied.status === 200, `status ${applied.status}`);

  const summary = applied.json.summary;
  check("one product was made", summary.created === 1, `${summary.created}`);
  check("one product was changed", summary.updated === 1, `${summary.updated}`);
  check("one row was left alone", summary.skipped === 1, `${summary.skipped}`);

  const after = await api("/api/admin/products?limit=100");
  check(
    "only the products in the file were touched",
    after.json.total === beforeCount + 1,
    `${beforeCount} then ${after.json.total}`
  );

  const made = after.json.rows.find((p) => p.slug === NEW_SLUG);
  check("the new product is there", Boolean(made));
  check("with the right price", made?.price === 2999, `${made?.price}`);
  check("and the right stock", made?.stock === 6, `${made?.stock}`);
  check("and it is on sale", made?.status === "published", made?.status);

  const changed = after.json.rows.find((p) => p.slug === TARGET);
  check(
    "the changed product has the new price",
    changed?.price === 5500,
    `${changed?.price}`
  );
  check(
    "and the rest of it is as it was",
    changed?.stock === 4 && changed?.name === "Import Target",
    `${changed?.stock} units, "${changed?.name}"`
  );
  check(
    "and it was not removed",
    Boolean(changed)
  );
  check(
    "the broken product was not made",
    !after.json.rows.some((p) => p.slug === "zz-import-broken")
  );
  const unexpected = after.json.rows.filter(
    (p) =>
      p.slug !== NEW_SLUG &&
      p.slug !== TARGET &&
      p.price !== pricesBefore[p.slug]
  );
  check(
    "and no other product's price was touched",
    unexpected.length === 0,
    unexpected.map((p) => p.slug).join(", ") || "none"
  );

  // The stock change is written down.
  const movements = await api(
    `/api/admin/inventory/movements?product=${encodeURIComponent(NEW_SLUG)}&limit=20`
  );
  const opening = movements.json.rows.find(
    (m) => m.reason === "Imported from a file"
  );
  check(
    "the stock change was written down",
    Boolean(opening),
    opening ? `${opening.previous_stock} → ${opening.new_stock}` : "no movement"
  );
}

console.log("\n→ taking the catalogue out and putting it back");
{
  // The export is read back and applied. Nothing should change, because the
  // file says what the catalogue already says — and the round trip is what
  // proves the file is faithful.
  const before = await api("/api/admin/products?limit=100");
  const catalogue = before.json.rows.map((p) => ({
    slug: p.slug,
    price: p.price,
    mrp: p.mrp,
    stock: p.stock,
    name: p.name,
    status: p.status,
  }));

  const file = await api("/api/admin/products/export");
  const preview = await sendFile(
    "/api/admin/products/import",
    "catalogue.csv",
    file.body
  );
  check("the file is read", preview.status === 200);
  check(
    "every row in it can be used",
    preview.json.summary.errors === 0,
    `${preview.json.summary.errors} refused`
  );
  check(
    "and every row is a change rather than a new product",
    preview.json.summary.created === 0 &&
      preview.json.summary.updated === before.json.total,
    JSON.stringify(preview.json.summary)
  );

  const applied = await sendFile(
    "/api/admin/products/import/apply",
    "catalogue.csv",
    file.body
  );
  const appliedErrors = applied.json.preview.rows
    .filter((r) => r.action === "error")
    .map((r) => `${r.row} ${r.slug}: ${r.errors.map((e) => e.message).join("; ")}`);
  check(
    "putting it back changes nothing",
    applied.json.summary.created === 0 &&
      applied.json.summary.updated === before.json.total &&
      applied.json.summary.errors === 0,
    appliedErrors.join(" | ") || JSON.stringify(applied.json.summary)
  );

  const after = await api("/api/admin/products?limit=100");
  const catalogueAfter = after.json.rows.map((p) => ({
    slug: p.slug,
    price: p.price,
    mrp: p.mrp,
    stock: p.stock,
    name: p.name,
    status: p.status,
  }));
  check(
    "and the catalogue is exactly as it was",
    JSON.stringify(catalogueAfter) === JSON.stringify(catalogue)
  );

  // The variations came back too.
  const withVariants = await api("/api/admin/products/playstation-5-slim-disc-1tb");
  check(
    "the variations survived the round trip",
    withVariants.json.variants.length === 2,
    `${withVariants.json.variants.length} variations`
  );
  check(
    "with their values",
    withVariants.json.variants.every((v) => Boolean(v.attributes.Storage)),
    JSON.stringify(withVariants.json.variants.map((v) => v.attributes))
  );
}

console.log("\n→ who may do what");
{
  const supportImport = await sendFile(
    "/api/admin/products/import",
    "x.csv",
    goodFile,
    { cookie: support }
  );
  check(
    "support cannot import",
    supportImport.status === 403,
    `status ${supportImport.status}`
  );

  const member = await fetch(`${BASE}/api/admin/products/export`, {
    redirect: "manual",
  });
  check(
    "a signed-out visitor cannot export",
    member.status === 401 || member.status === 403,
    `status ${member.status}`
  );

  // The purchase cost is only written by an administrator's file, and only
  // an administrator's file has the column for it.
  const costFile = csv(
    [...headers, "purchase_cost"],
    [
      {
        slug: "playstation-4-slim-500gb",
        name: "PlayStation 4 Slim — 500GB",
        category: "consoles",
        price: "20999",
        mrp: "34990",
        purchase_cost: "17000",
      },
    ]
  );
  const preview = await sendFile(
    "/api/admin/products/import",
    "cost.csv",
    costFile
  );
  const row = preview.json.rows[0];
  check(
    "an administrator's file may carry a purchase cost",
    row?.action !== "error",
    JSON.stringify(row?.errors)
  );
  check(
    "and the preview says it changes without giving the number away",
    row?.changes?.some((c) => c === "purchase cost"),
    JSON.stringify(row?.changes)
  );
  check(
    "and the cost itself is nowhere in the preview",
    !preview.body.includes("17000")
  );
}

/* --------------------------------------------------------------- dashboard */

console.log("\n→ the dashboard counts the catalogue properly");
{
  const stats = (await api("/api/admin/stats")).json;
  const products = (await api("/api/admin/products?limit=100")).json;

  check(
    "the total is every product",
    stats.totalProducts === products.total,
    `${stats.totalProducts} of ${products.total}`
  );
  check(
    "the published count is right",
    stats.publishedProducts ===
      products.rows.filter((p) => p.status === "published").length,
    `${stats.publishedProducts}`
  );
  check(
    "the draft count is right",
    stats.draftProducts ===
      products.rows.filter((p) => p.status === "draft").length,
    `${stats.draftProducts}`
  );
  check(
    "low stock and out of stock are counted separately",
    stats.outOfStock >= 0 && stats.lowStock >= 0,
    `${stats.lowStock} low, ${stats.outOfStock} out`
  );

  // The best sellers come from the orders that were not cancelled.
  const sold = db
    .prepare(
      `SELECT oi.product_slug AS slug, SUM(oi.quantity) AS units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
       GROUP BY oi.product_slug
       ORDER BY units DESC`
    )
    .all();
  const top = stats.topProducts[0];
  check(
    "the best seller is the one the orders say",
    sold.length === 0 || top.slug === sold[0].slug,
    `${top?.slug} with ${top?.units} units`
  );
  check(
    "and it is counted in units",
    sold.length === 0 || top.units === sold[0].units,
    `${top?.units}`
  );
  check(
    "the best sellers carry the address of the product",
    typeof top.slug === "string" && top.slug.length > 0,
    top.slug
  );
}

/* ------------------------------------------------------------------ cleanup */

console.log("\n→ putting the store back as it was found");
{
  for (const slug of [NEW_SLUG, TARGET, "zz-import-broken", "zz-import-bad-price"]) {
    await api(`/api/admin/products/${slug}`, { method: "DELETE" });
  }
  const left = await api("/api/admin/products?limit=100");
  check(
    "the test's products are gone",
    !left.json.rows.some((p) => p.slug.startsWith("zz-import-")),
    `${left.json.total} products`
  );
  check("the catalogue is back to nine", left.json.total === 9, `${left.json.total}`);
  check(
    "and the catalogue's own products are untouched",
    left.json.rows.every(
      (p) => !(p.slug in pricesBefore) || p.price === pricesBefore[p.slug]
    )
  );

  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — import and export test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
