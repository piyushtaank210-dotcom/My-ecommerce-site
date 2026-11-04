/**
 * The taxonomy test.
 *
 * Categories, the categories inside them, and the brands — what the back
 * office can create and manage, what it may not take away, and how the
 * product form and the product page use them.
 *
 *   node scripts/check-taxonomy.mjs
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

async function page(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `pf_auth=${admin}` },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The page as it is shown, without the data the server sends to the browser.
 *
 * The back office sends every category's fields to the browser so the form
 * can change them when the category does — that data is in a script tag,
 * not on the page, so it is taken out before what is on the page is read.
 */
function visible(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, "");
}

/** The test's own products, so everything it makes can be taken away again. */
const made = { categories: [], products: [], brands: [] };

/**
 * Takes away the test's own category and everything under it.
 *
 * A run that was interrupted leaves its category behind, and the next run
 * would trip over it — so the test clears its own ground first.
 */
async function removeTestCategory(slug) {
  const category = (await api(`/api/admin/categories/${slug}`)).json;
  for (const sub of category?.subcategories ?? []) {
    await api(`/api/admin/categories/${slug}/subcategories/${sub.slug}`, {
      method: "DELETE",
    });
  }
  await api(`/api/admin/categories/${slug}`, { method: "DELETE" });
}

/* ------------------------------------------------------- the manager page */

console.log("\n→ the categories page");
{
  const p = await page("/admin/categories");
  check("the page renders", p.status === 200, `status ${p.status}`);
  check("it shows the categories", p.body.includes("Gaming Consoles"));
  check("it shows the brands", p.body.includes("Brands"));
  check("it offers the suggestions", p.body.includes("Suggested categories"));
  check(
    "a category's specification fields are shown",
    p.body.includes("Storage capacity") && p.body.includes("Battery information")
  );
}

console.log("\n→ a category that products are in");
{
  const categories = (await api("/api/admin/categories")).json.categories;
  const consoles = categories.find((c) => c.slug === "consoles");
  check("the console category is there", Boolean(consoles));
  check(
    "it knows how many products are in it",
    consoles?.productCount === 6,
    `${consoles?.productCount}`
  );
  check(
    "it asks the console questions",
    JSON.stringify(consoles?.specFields) ===
      JSON.stringify([
        "Model and edition",
        "Storage capacity",
        "Connectivity",
        "Included accessories",
        "Warranty",
      ]),
    JSON.stringify(consoles?.specFields)
  );

  const removed = await api("/api/admin/categories/consoles", {
    method: "DELETE",
  });
  check(
    "a category with products in it cannot be removed",
    removed.status === 409,
    `status ${removed.status}`
  );
  check(
    "the refusal says why",
    /product/i.test(removed.json?.error ?? ""),
    removed.json?.error
  );

  const stillThere = (await api("/api/admin/categories")).json.categories.find(
    (c) => c.slug === "consoles"
  );
  check("the category is still there", Boolean(stillThere));
}

console.log("\n→ creating and changing a category");
let testSlug = null;
{
  // Clear anything a previous, interrupted run left behind.
  await removeTestCategory("test-headsets");

  const created = await api("/api/admin/categories", {
    method: "POST",
    body: {
      name: "Test Headsets",
      blurb: "A category the test made.",
      specFields: ["Headphone type", "Connection", "Warranty"],
    },
  });
  check("a category can be created", created.status === 201, `status ${created.status}`);
  testSlug = "test-headsets";
  made.categories.push(testSlug);

  check(
    "it has the fields it was given",
    created.json?.specFields?.length === 3,
    JSON.stringify(created.json?.specFields)
  );

  const renamed = await api(`/api/admin/categories/${testSlug}`, {
    method: "PATCH",
    body: { name: "Test Audio" },
  });
  check(
    "a category can be renamed",
    renamed.json?.name === "Test Audio",
    renamed.json?.name
  );

  const fields = await api(`/api/admin/categories/${testSlug}`, {
    method: "PATCH",
    body: { specFields: ["Headphone type", "Connection", "Warranty", "Impedance"] },
  });
  check(
    "a field can be added",
    fields.json?.specFields?.length === 4,
    `${fields.json?.specFields?.length}`
  );

  const dropped = await api(`/api/admin/categories/${testSlug}`, {
    method: "PATCH",
    body: { specFields: ["Headphone type", "Connection", "Warranty"] },
  });
  check(
    "a field can be taken away",
    dropped.json?.specFields?.length === 3,
    `${dropped.json?.specFields?.length}`
  );
}

console.log("\n→ subcategories");
{
  const added = await api("/api/admin/categories/test-headsets/subcategories", {
    method: "POST",
    body: { name: "Wireless" },
  });
  check(
    "a subcategory can be added",
    added.status === 201,
    `status ${added.status}`
  );

  const category = added.json;
  const sub = category?.subcategories?.[0];
  check("it belongs to the category", sub?.name === "Wireless", sub?.name);

  const again = await api("/api/admin/categories/test-headsets/subcategories", {
    method: "POST",
    body: { name: "wireless" },
  });
  check(
    "the same subcategory twice is refused",
    again.status === 409,
    `status ${again.status}`
  );

  const renamed = await api(
    "/api/admin/categories/test-headsets/subcategories/" + sub.slug,
    { method: "PATCH", body: { name: "Cordless" } }
  );
  check(
    "a subcategory can be renamed",
    renamed.json?.subcategories?.[0]?.name === "Cordless",
    renamed.json?.subcategories?.[0]?.name
  );

  // A product in the subcategory keeps it alive.
  const product = await api("/api/admin/products", {
    method: "POST",
    body: {
      name: "Test Headset",
      slug: "zz-taxonomy-headset",
      category: "test-headsets",
      price: 4999,
      mrp: 5999,
      stock: 3,
      brand: "Testmaker",
      subcategory: "Cordless",
      status: "published",
    },
  });
  check("a product can be made in it", product.status === 201, `status ${product.status}`);
  made.products.push("zz-taxonomy-headset");

  const inUse = await api(
    "/api/admin/categories/test-headsets/subcategories/" + sub.slug,
    { method: "DELETE" }
  );
  check(
    "a subcategory with a product in it cannot be removed",
    inUse.status === 409,
    `status ${inUse.status}`
  );

  const categoryInUse = await api("/api/admin/categories/test-headsets", {
    method: "DELETE",
  });
  check(
    "a category with a product in it cannot be removed",
    categoryInUse.status === 409,
    `status ${categoryInUse.status}`
  );
}

console.log("\n→ brands");
{
  const created = await api("/api/admin/brands", {
    method: "POST",
    body: { name: "Testmaker", blurb: "A brand the test made." },
  });
  check("a brand can be created", created.status === 201, `status ${created.status}`);
  const brand = created.json;
  made.brands.push(brand?.slug);

  const again = await api("/api/admin/brands", {
    method: "POST",
    body: { name: "testmaker" },
  });
  check(
    "the same brand twice is refused",
    again.status === 409,
    `status ${again.status}`
  );

  const renamed = await api(`/api/admin/brands/${brand.slug}`, {
    method: "PATCH",
    body: { name: "Renamed Testmaker" },
  });
  check(
    "a brand can be renamed",
    renamed.json?.name === "Renamed Testmaker",
    renamed.json?.name
  );

  // The product that carried it follows the new name.
  const product = await api("/api/admin/products/zz-taxonomy-headset");
  check(
    "the product that carried it follows the new name",
    product.json?.brand === "Renamed Testmaker",
    product.json?.brand
  );

  const inUse = await api(`/api/admin/brands/${brand.slug}`, { method: "DELETE" });
  check(
    "a brand with a product in it cannot be removed",
    inUse.status === 409,
    `status ${inUse.status}`
  );

  // And the brand the store already has.
  const sony = (await api("/api/admin/brands")).json.brands.find(
    (b) => b.name === "Sony"
  );
  check("the brand the catalogue already had is listed", Boolean(sony));
  const sonyRemoved = await api(`/api/admin/brands/${sony.slug}`, {
    method: "DELETE",
  });
  check(
    "a brand with products in it cannot be removed",
    sonyRemoved.status === 409,
    `status ${sonyRemoved.status}`
  );
}

/* ---------------------------------------------- the product form and the page */

console.log("\n→ the product form shows the category's fields");
{
  const console_ = visible((await page("/admin/products/playstation-5-slim-disc-1tb")).body);
  check("a console asks the console questions", console_.includes("Storage capacity"));
  check(
    "and not the controller questions",
    !console_.includes("Battery information")
  );
  check(
    "the controller's own field list is not shown",
    !console_.includes("Model and colour")
  );

  const controller = visible((await page("/admin/products/dualsense-white")).body);
  check(
    "a controller asks the controller questions",
    controller.includes("Battery information") &&
      controller.includes("Model and colour")
  );
  check(
    "and not the console questions",
    !controller.includes("Storage capacity")
  );

  // The other specifications the owner added are still there.
  check(
    "the specifications the owner added are still offered",
    controller.includes("Haptics, adaptive triggers"),
    "the controller's own specification"
  );
}

console.log("\n→ the product page shows the specifications");
{
  // A product whose specifications use the category's own field names.
  const created = await api("/api/admin/products", {
    method: "POST",
    body: {
      name: "Test Field Console",
      slug: "zz-taxonomy-console",
      category: "consoles",
      price: 54990,
      mrp: 64990,
      stock: 2,
      brand: "Sony",
      specs: {
        Storage: "1TB NVMe SSD",
        "Storage capacity": "1TB",
        Warranty: "3 years",
        "Whatever else": "Something of our own",
      },
      status: "published",
    },
  });
  check("a console with specifications can be made", created.status === 201);
  made.products.push("zz-taxonomy-console");

  // A new product is a draft until somebody publishes it.
  await api("/api/admin/products/zz-taxonomy-console", {
    method: "PATCH",
    body: { status: "published" },
  });

  const product = await fetch(`${BASE}/product/zz-taxonomy-console`).then((r) =>
    r.text()
  );
  check("the page shows the specifications", product.includes("1TB NVMe SSD"));
  check(
    "the category's own field is shown",
    product.includes("Storage capacity") && product.includes("1TB")
  );
  check(
    "a specification the owner added is shown too",
    product.includes("Whatever else")
  );

  // The category's fields come first.
  const first = product.indexOf("Storage capacity");
  const second = product.indexOf("Whatever else");
  check(
    "the category's own fields come first",
    first > -1 && second > first,
    `${first} then ${second}`
  );
}

/* ------------------------------------------------------------------ cleanup */

console.log("\n→ putting the store back as it was found");
{
  for (const slug of made.products) {
    await api(`/api/admin/products/${slug}`, { method: "DELETE" });
  }
  for (const slug of made.brands) {
    if (slug) await api(`/api/admin/brands/${slug}`, { method: "DELETE" });
  }
  for (const slug of made.categories) {
    await removeTestCategory(slug);
  }

  const categories = (await api("/api/admin/categories")).json.categories;
  check(
    "the test's category is gone",
    !categories.some((c) => c.slug === "test-headsets")
  );
  const products = await api("/api/admin/products?limit=100");
  check(
    "the test's products are gone",
    !products.json.rows.some((p) => p.slug.startsWith("zz-taxonomy-")),
    `${products.json.total} products`
  );
  const brands = (await api("/api/admin/brands")).json.brands;
  check(
    "the test's brand is gone",
    !brands.some((b) => b.name.toLowerCase().includes("testmaker")),
    brands.map((b) => b.name).join(", ")
  );
  check(
    "the catalogue still has its nine products",
    products.json.total === 9,
    `${products.json.total}`
  );
  check(
    "the store's own categories are still there",
    categories.filter((c) => ["consoles", "controllers"].includes(c.slug))
      .length === 2
  );

  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — taxonomy test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
