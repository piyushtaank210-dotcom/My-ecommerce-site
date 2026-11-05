/**
 * Catalogue test for the back office.
 *
 *   node scripts/check-catalogue.mjs
 *
 * The dev server must be running on port 3000.
 *
 * It drives the catalogue page the way an admin does — searching, filtering,
 * sorting, reading the counts — and then checks the actions through the same
 * JSON API the page's buttons call. Everything it creates is removed again
 * at the end, and the products and orders that were already there are
 * checked to be exactly as they were found.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const admin = tokenForRole(db, "admin");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const text = (html) =>
  html
    .replace(/<!--.*?-->/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

async function page(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `pf_auth=${admin}` },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

/** The product rows of the catalogue table. */
function rows(html) {
  const tbody = html.slice(
    html.indexOf("<tbody"),
    html.indexOf("</tbody>") < 0 ? html.length : html.indexOf("</tbody>")
  );
  return tbody
    .split("<tr")
    .slice(1)
    .map((r) => text(r))
    .filter(Boolean);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
    ...options,
  });
  const body = await res.text();
  try {
    return { status: res.status, json: JSON.parse(body) };
  } catch {
    return { status: res.status, json: null };
  }
}

/* ------------------------------------------------------------- fixtures */

const FIXTURES = [
  {
    slug: "zz-cat-console",
    name: "Zephyr Test Console",
    brand: "Zephyr",
    category: "consoles",
    price: 10000,
    mrp: 20000,
    stock: 4,
    status: "published",
    listed: 1,
    position: 9001,
  },
  {
    slug: "zz-cat-draft",
    name: "Zephyr Test Draft",
    brand: "Zephyr",
    category: "controllers",
    price: 5000,
    mrp: 5000,
    stock: 0,
    status: "draft",
    listed: 1,
    position: 9002,
  },
  {
    slug: "zz-cat-delisted",
    name: "Zephyr Test Delisted",
    brand: "Zephyr",
    category: "controllers",
    price: 7000,
    mrp: 7000,
    stock: 9,
    status: "published",
    listed: 0,
    position: 9003,
  },
  {
    slug: "zz-cat-empty",
    name: "Zephyr Test Empty",
    brand: "Zephyr",
    category: "consoles",
    price: 9000,
    mrp: 9000,
    stock: 0,
    status: "published",
    listed: 1,
    position: 9004,
  },
];

/** Enough extra products to push the catalogue onto a second page. */
const PADDERS = Array.from({ length: 15 }, (_, i) => ({
  slug: `zz-page-${String(i + 1).padStart(2, "0")}`,
  name: `Pager Test Product ${i + 1}`,
  brand: "Pager",
  category: "consoles",
  price: 1000 + i,
  mrp: 1000 + i,
  stock: 3,
  status: "published",
  listed: 1,
  position: 9100 + i,
}));

const ALL = [...FIXTURES, ...PADDERS];

function insertFixtures() {
  const ins = db.prepare(
    `INSERT INTO products
       (slug, sku, name, brand, category_slug, price, mrp, rating, reviews, stock,
        badge, short_desc, specs, image, listed, status, position)
     VALUES (?,?,?,?,?,?,?,0,0,?,NULL,NULL,'{}',NULL,?,?,?)`
  );
  for (const f of ALL) {
    ins.run(
      f.slug,
      f.slug.toUpperCase(),
      f.name,
      f.brand,
      f.category,
      f.price,
      f.mrp,
      f.stock,
      f.listed,
      f.status,
      f.position
    );
  }
}

/**
 * The fixtures are removed again through the back office's own delete
 * endpoint, which is admin-only and refuses to remove a product that has
 * order lines. Only the slugs this script created are ever passed to it.
 */
async function removeFixtures() {
  for (const f of ALL) {
    await api(`/api/admin/products/${f.slug}`, { method: "DELETE" });
  }
}

/* ------------------------------------------------------------- the run */

const before = {
  products: db.prepare("SELECT COUNT(*) n FROM products").get().n,
  orders: db.prepare("SELECT COUNT(*) n FROM orders").get().n,
  orderItems: db.prepare("SELECT COUNT(*) n FROM order_items").get().n,
  rows: db
    .prepare(
      "SELECT slug, sku, name, price, mrp, stock, listed, status FROM products ORDER BY slug"
    )
    .all(),
};

insertFixtures();

try {
  console.log("\n→ search");
  {
    const r = await page("/admin/products?q=Zephyr");
    const list = rows(r.body);
    check("searching by name finds the products", list.length === 4, `${list.length} rows`);
    check(
      "every result carries the search term",
      list.every((row) => /zephyr/i.test(row))
    );

    const bySku = await page("/admin/products?q=ZZ-CAT-EMPTY");
    check(
      "searching by SKU finds the product",
      rows(bySku.body).length === 1 &&
        rows(bySku.body)[0].includes("Zephyr Test Empty"),
      `${rows(bySku.body).length} rows`
    );

    const byBrand = await page("/admin/products?q=Zephyr&status=all");
    check(
      "searching by brand finds that brand's products",
      rows(byBrand.body).length === 4,
      `${rows(byBrand.body).length} rows`
    );

    const nothing = await page("/admin/products?q=zzz-nothing-here");
    check(
      "a search with no matches says so",
      nothing.body.includes("Nothing matches those filters"),
      `status ${nothing.status}`
    );
  }

  console.log("\n→ filters");
  {
    const byCategory = rows((await page("/admin/products?category=controllers")).body);
    check(
      "the category filter narrows the list",
      byCategory.length === 5 && byCategory.every((r) => /controllers/.test(r)),
      `${byCategory.length} rows`
    );

    const byBrand = rows((await page("/admin/products?brand=Zephyr")).body);
    check(
      "the brand filter narrows the list",
      byBrand.length === 4 && byBrand.every((r) => /Zephyr/.test(r)),
      `${byBrand.length} rows`
    );

    const drafts = rows((await page("/admin/products?status=draft")).body);
    check(
      "the status filter finds the draft",
      drafts.length === 1 && drafts[0].includes("Zephyr Test Draft"),
      `${drafts.length} rows`
    );

    const delisted = rows((await page("/admin/products?listed=false")).body);
    check(
      "the listing filter finds the delisted product",
      delisted.length === 1 && delisted[0].includes("Zephyr Test Delisted"),
      `${delisted.length} rows`
    );

    const out = await api("/api/admin/products?stock=out&limit=100");
    check(
      "the out-of-stock filter leaves only the empty products",
      out.json.rows.every((p) => p.stock === 0),
      `${out.json.rows.length} rows`
    );
    check(
      "a product that sells through its variants is not written off",
      !out.json.rows.some((p) => p.slug === "playstation-5-slim-disc-1tb"),
      "the PlayStation 5 Slim has variant stock"
    );

    const low = await api("/api/admin/products?stock=low&limit=100");
    check(
      "the low-stock filter counts the sellable stock",
      low.json.rows.every(
        (p) =>
          p.variants.length > 0
            ? p.variants.reduce((s, v) => s + v.stock, 0) > 0 &&
              p.variants.reduce((s, v) => s + v.stock, 0) <= 5
            : p.stock > 0 && p.stock <= 5
      ),
      `${low.json.rows.length} rows`
    );
  }

  console.log("\n→ sorting");
  {
    const asc = await api("/api/admin/products?sort=price-asc&limit=100");
    check(
      "sorting by price, low to high",
      asc.json.rows.every((p, i, r) => i === 0 || r[i - 1].price <= p.price),
      asc.json.rows.map((p) => p.price).join(" · ")
    );
    const desc = await api("/api/admin/products?sort=price-desc&limit=100");
    check(
      "sorting by price, high to low",
      desc.json.rows.every((p, i, r) => i === 0 || r[i - 1].price >= p.price),
      desc.json.rows.map((p) => p.price).join(" · ")
    );
    const newest = await api("/api/admin/products?sort=newest&limit=100");
    check(
      "sorting by newest puts the last product added first",
      newest.json.rows[0]?.slug === "zz-page-15",
      newest.json.rows[0]?.slug
    );
    const best = await api("/api/admin/products?sort=best-selling&limit=100");
    check(
      "sorting by best selling puts the top seller first",
      best.json.rows[0]?.slug === "playstation-5-slim-disc-1tb",
      best.json.rows[0]?.slug
    );
    check(
      "an unknown sort key falls back safely",
      (await api("/api/admin/products?sort=; DROP TABLE products")).status === 200
    );
  }

  console.log("\n→ what the table shows");
  {
    const r = await page("/admin/products?q=PlayStation%205%20Slim");
    const row = rows(r.body)[0] ?? "";
    check("the product photograph is there", r.body.includes("/products/ps5-slim.jpg"));
    check("the name is there", row.includes("PlayStation 5 Slim"));
    check("the brand is there", row.includes("Sony"));
    check("the SKU is there", row.includes("PLAYSTATION-5-SLIM-DISC-1TB"));
    check("the price is there", row.includes("54,990"));
    check("the MRP is there", row.includes("64,990"));
    check("the discount is there", row.includes("15% off"));
    check("the variants are there", row.includes("1TB Disc") && row.includes("2TB Disc"));
    // The stock shown has to be the stock that can really be sold, which
    // for a product with variants is their stock added up.
    const ps5 = await api("/api/admin/products/playstation-5-slim-disc-1tb");
    const sellable = ps5.json.variants.reduce((s, v) => s + v.stock, 0);
    check(
      "the stock is the sellable stock, not the product's own",
      row.includes(`${sellable} in 2 variants`),
      `${sellable} in 2 variants`
    );
    check(
      "the status control is there",
      r.body.includes('aria-label="Status for playstation-5-slim-disc-1tb"')
    );
    check(
      "the listing control is there",
      r.body.includes('aria-pressed="true"')
    );
  }

  console.log("\n→ counts");
  {
    const all = text((await page("/admin/products")).body);
    const total = before.products + ALL.length;
    check(
      "the header counts the whole catalogue",
      all.includes(`${total} products`),
      `${total} products`
    );

    const filtered = text((await page("/admin/products?brand=Zephyr")).body);
    check(
      "the header counts what matches as well as the whole",
      filtered.includes(`4 of ${total} products match`),
      `4 of ${total} products match`
    );

    const summary = text((await page("/admin/products")).body);
    check(
      "the table says how much of the list is showing",
      summary.includes(`Showing 1–20 of ${total} products`),
      `Showing 1–20 of ${total} products`
    );

    const listed = await api("/api/admin/products?limit=100");
    check(
      "the API count matches the rows",
      listed.json.total === listed.json.rows.length,
      `total ${listed.json.total}, rows ${listed.json.rows.length}`
    );

    const facets = (await page("/admin/products")).body;
    const facetCheck = (label, needle) =>
      check(label, facets.includes(needle), needle);
    facetCheck("the category counts are on the dropdown", "Consoles (");
    facetCheck("the brand counts are on the dropdown", "Zephyr (4)");
    facetCheck("the stock counts are on the dropdown", "Out of stock (");
    facetCheck("the status counts are on the dropdown", "Draft (1)");
    facetCheck("the listing counts are on the dropdown", "Delisted only (");
  }

  console.log("\n→ pagination");
  {
    const total = before.products + ALL.length;
    const first = await page("/admin/products");
    const firstText = text(first.body);
    check("the first page holds twenty rows", rows(first.body).length === 20, `${rows(first.body).length} rows`);
    check(
      "the first page says where it ends",
      firstText.includes(`Showing 1–20 of ${total} products`),
      `Showing 1–20 of ${total} products`
    );

    const second = await page("/admin/products?page=2");
    const secondRows = rows(second.body).length;
    check(
      "the second page holds the rest",
      secondRows === total - 20,
      `${secondRows} rows`
    );
    check(
      "the second page says where it starts",
      text(second.body).includes(`Showing ${total - secondRows + 1}–${total}`),
      `Showing ${total - secondRows + 1}–${total}`
    );

    const past = await page("/admin/products?page=9");
    check(
      "a page past the end says so instead of saying nothing matches",
      past.body.includes("past the end of the list"),
      `status ${past.status}`
    );
    check(
      "a page past the end offers the way back",
      past.body.includes("Back to the first page")
    );

    check(
      "the catalogue offers to select everything matching",
      firstText.includes(`Select all ${total} matching products`),
      `Select all ${total} matching products`
    );
  }

  console.log("\n→ product actions");
  {
    const dup = await api("/api/admin/products/dualsense-white/duplicate", {
      method: "POST",
    });
    check("duplicate returns 201", dup.status === 201, `status ${dup.status}`);
    const copySlug = dup.json.duplicated;
    const copy = await api(`/api/admin/products/${copySlug}`);
    check("the copy is a draft", copy.json.status === "draft", copy.json.status);
    check("the copy has its own SKU", copy.json.sku !== "DUALSENSE-WHITE", copy.json.sku);
    check(
      "the copy keeps the variants",
      copy.json.variants.length ===
        (
          await api("/api/admin/products/dualsense-white")
        ).json.variants.length
    );
    check(
      "the copy is out of the shop",
      !(
        await api("/api/admin/products?q=" + copySlug)
      ).json.rows.some((p) => p.slug === copySlug && p.status === "published")
    );

    const removed = await api(`/api/admin/products/${copySlug}`, { method: "DELETE" });
    check("the copy can be removed again", removed.status === 200, `status ${removed.status}`);

    const archive = await api("/api/admin/products/zz-cat-console", {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    check("archive works", archive.status === 200, `status ${archive.status}`);
    const archived = await api("/api/admin/products/zz-cat-console");
    check("the archived product keeps its data", archived.json.price === 10000);
    check(
      "the archived product is out of the shop",
      !(
        await api("/api/search?q=Zephyr%20Test%20Console")
      ).json.products.some((p) => p.slug === "zz-cat-console")
    );
    const restore = await api("/api/admin/products/zz-cat-console", {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    });
    check("restore works", restore.status === 200, `status ${restore.status}`);
    check(
      "the restored product is back in the shop",
      (
        await api("/api/search?q=Zephyr%20Test%20Console")
      ).json.products.some((p) => p.slug === "zz-cat-console")
    );

    const delist = await api("/api/admin/products/zz-cat-console", {
      method: "PATCH",
      body: JSON.stringify({ listed: false }),
    });
    check("delisting works", delist.status === 200, `status ${delist.status}`);
    await api("/api/admin/products/zz-cat-console", {
      method: "PATCH",
      body: JSON.stringify({ listed: true }),
    });

    // A variant's stock, which is what a product with variants sells from.
    const withVariants = await api("/api/admin/products/dualsense-white");
    const white = withVariants.json.variants.find((v) => v.name === "White");
    const patched = await api("/api/admin/products/dualsense-white", {
      method: "PATCH",
      body: JSON.stringify({ variants: [{ id: white.id, stock: white.stock + 5 }] }),
    });
    check(
      "a variant's stock can be set",
      patched.json.variants.find((v) => v.id === white.id).stock ===
        white.stock + 5,
      `${white.stock} → ${white.stock + 5}`
    );
    await api("/api/admin/products/dualsense-white", {
      method: "PATCH",
      body: JSON.stringify({ variants: [{ id: white.id, stock: white.stock }] }),
    });
    await api("/api/admin/products/playstation-vr2", {
      method: "PATCH",
      body: JSON.stringify({ variants: [{ id: white.id, stock: 0 }] }),
    });
    const afterWrong = await api("/api/admin/products/dualsense-white");
    check(
      "a variant cannot be reached through another product",
      afterWrong.json.variants.find((v) => v.id === white.id).stock === white.stock,
      `${white.stock}`
    );
  }

  console.log("\n→ bulk actions");
  {
    const targets = ["zz-cat-console", "zz-cat-empty"];
    const post = (body) =>
      api("/api/admin/products", { method: "POST", body: JSON.stringify(body) });

    const delist = await post({ action: "delist", slugs: targets });
    check("bulk delist works", delist.status === 200, `status ${delist.status}`);
    check("bulk delist changed both products", delist.json.changed === 2);
    const afterDelist = await api("/api/admin/products?limit=100");
    check(
      "both products are delisted",
      targets.every(
        (s) => afterDelist.json.rows.find((p) => p.slug === s)?.listed === false
      )
    );

    const archive = await post({ action: "archive", slugs: targets });
    check("bulk archive works", archive.status === 200, `status ${archive.status}`);

    const publish = await post({ action: "publish", slugs: targets });
    check("bulk publish works", publish.status === 200, `status ${publish.status}`);
    const afterPublish = await api("/api/admin/products?limit=100");
    check(
      "both products are published and listed again",
      targets.every((s) => {
        const row = afterPublish.json.rows.find((p) => p.slug === s);
        return row?.status === "published" && row?.listed === true;
      })
    );

    // "Everything matching" — the list is worked out on the server.
    const allMatching = await post({
      action: "archive",
      scope: "all",
      filters: { brand: "Zephyr" },
    });
    check("a bulk action over everything matching works", allMatching.status === 200);
    check(
      "it reached exactly the products that match",
      allMatching.json.changed === 4,
      `${allMatching.json.changed} changed`
    );
    const zephyr = await api("/api/admin/products?brand=Zephyr&limit=100");
    check(
      "every matching product was archived",
      zephyr.json.rows.every((p) => p.status === "archived"),
      `${zephyr.json.rows.length} rows`
    );
    const notZephyr = await api("/api/admin/products?brand=Pager&limit=100");
    check(
      "and nothing else was touched",
      notZephyr.json.rows.every((p) => p.status === "published"),
      `${notZephyr.json.rows.length} rows`
    );

    await post({ action: "publish", scope: "all", filters: { brand: "Zephyr" } });
    const restored = await api("/api/admin/products?brand=Zephyr&limit=100");
    check(
      "the matching products are back on sale",
      restored.json.rows.every((p) => p.status === "published" && p.listed === true)
    );

    check(
      "a bulk action for a product that does not exist is reported",
      (await post({ action: "publish", slugs: ["no-such-product"] })).status === 200
    );
  }

  console.log("\n→ nothing was broken");
  {
    const after = {
      products: db.prepare("SELECT COUNT(*) n FROM products").get().n,
      orders: db.prepare("SELECT COUNT(*) n FROM orders").get().n,
      orderItems: db.prepare("SELECT COUNT(*) n FROM order_items").get().n,
      rows: db
        .prepare(
          "SELECT slug, sku, name, price, mrp, stock, listed, status FROM products WHERE slug NOT LIKE 'zz-%' ORDER BY slug"
        )
        .all(),
    };
    check("the order count is unchanged", after.orders === before.orders, `${after.orders} orders`);
    check(
      "the order lines are unchanged",
      after.orderItems === before.orderItems,
      `${after.orderItems} lines`
    );
    check(
      "the products that were already there are unchanged",
      JSON.stringify(after.rows) === JSON.stringify(before.rows),
      `${after.rows.length} products`
    );

    const ordered = await api("/api/admin/products/playstation-5-slim-disc-1tb", {
      method: "DELETE",
    });
    check(
      "a product with order history still cannot be deleted",
      ordered.status === 409,
      `status ${ordered.status}`
    );
  }
} finally {
  await removeFixtures();
  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — catalogue test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
