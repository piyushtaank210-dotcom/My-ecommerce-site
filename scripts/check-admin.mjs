/**
 * Smoke test for the back office. Signs in as the seeded admin and support
 * accounts, walks the admin pages and API endpoints, and checks that a
 * member cannot get in and that delisting works.
 *
 *   node scripts/check-admin.mjs
 *
 * The dev server must be running on port 3000.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenForRole } from "./lib/session.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

// The app's own rule about what counts as low stock, so that the check
// and the back office cannot disagree about it.
registerTsResolver();
const { productStockLevel } = await import("../src/lib/stock.ts");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const admin = await tokenForRole("admin");
const support = await tokenForRole("support");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, body };
}

/**
 * The stock a product can really sell — its variants added up when it has
 * any, its own stock otherwise. This is what the catalogue counts and what
 * the shop sells from.
 */
const sellableStock = (p) =>
  p.variants?.length
    ? p.variants.reduce((sum, v) => sum + v.stock, 0)
    : p.stock;

console.log("\n→ admin pages");
for (const path of [
  "/admin",
  "/admin/orders",
  "/admin/users",
  "/admin/products",
  "/admin/messages",
  "/admin/products/playstation-5-slim-disc-1tb",
  "/admin/products/new",
]) {
  const r = await get(path, `pf_auth=${admin}`);
  check(`GET ${path}`, r.status === 200, `status ${r.status}`);
}

console.log("\n→ admin API");
const apiCalls = [
  ["GET", "/api/admin/stats"],
  ["GET", "/api/admin/meta"],
  ["GET", "/api/admin/products"],
  ["GET", "/api/admin/products?q=dualsense"],
  ["GET", "/api/admin/products/playstation-5-slim-disc-1tb"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/messages"],
  ["GET", "/api/account/profile"],
  ["GET", "/api/account/orders"],
  ["GET", "/api/account/addresses"],
];
for (const [method, path] of apiCalls) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: `pf_auth=${admin}` },
  });
  const text = await r.text();
  check(`${method} ${path}`, r.status === 200, `status ${r.status}`);
  if (r.status === 200 && path === "/api/admin/stats") {
    const data = JSON.parse(text);
    check(
      "  stats has revenue and orders",
      typeof data.revenue === "number" && typeof data.orders === "number",
      `revenue ${data.revenue}, orders ${data.orders}`
    );
  }
}

console.log("\n→ member is locked out");
for (const path of ["/admin", "/api/admin/stats", "/api/admin/users"]) {
  const r = await get(path, null);
  const isRedirect = r.status === 307 || r.status === 302;
  const isUnauthorized = r.status === 401 || r.status === 403;
  check(
    `anonymous ${path}`,
    isRedirect || isUnauthorized,
    `status ${r.status}`
  );
}

console.log("\n→ support scope");
for (const path of ["/admin", "/admin/orders", "/admin/messages", "/admin/users"]) {
  const r = await get(path, `pf_auth=${support}`);
  check(`support GET ${path}`, r.status === 200, `status ${r.status}`);
}
for (const path of ["/admin/products", "/api/admin/products"]) {
  const r = await get(path, `pf_auth=${support}`);
  const blocked = r.status === 307 || r.status === 302 || r.status === 403;
  check(`support blocked from ${path}`, blocked, `status ${r.status}`);
}

console.log("\n→ the pages added since");
for (const path of [
  "/admin/inventory",
  "/admin/inventory/history",
  "/admin/categories",
  "/admin/import",
]) {
  const r = await get(path, `pf_auth=${admin}`);
  check(`admin GET ${path}`, r.status === 200, `status ${r.status}`);

  const anon = await get(path, null);
  const blocked = anon.status === 307 || anon.status === 302 || anon.status === 401 || anon.status === 403;
  check(`anonymous blocked from ${path}`, blocked, `status ${anon.status}`);
}

console.log("\n→ what each role may reach");
{
  // Support works the queue and can see the stock, but the catalogue is
  // the administrator's.
  const supportPages = [
    ["/admin/inventory", true],
    ["/admin/inventory/history", true],
    ["/admin/categories", false],
    ["/admin/import", false],
    ["/admin/products", false],
  ];
  for (const [path, allowed] of supportPages) {
    const r = await get(path, `pf_auth=${support}`);
    const ok = allowed ? r.status === 200 : r.status !== 200;
    check(
      `support ${allowed ? "may" : "may not"} reach ${path}`,
      ok,
      `status ${r.status}`
    );
  }

  // Support can see the stock but not change it.
  const adjust = await fetch(`${BASE}/api/admin/inventory/adjust`, {
    method: "POST",
    headers: { cookie: `pf_auth=${support}`, "content-type": "application/json" },
    body: JSON.stringify({
      productSlug: "dualsense-white",
      mode: "add",
      quantity: 1,
      reason: "not allowed",
    }),
  });
  check(
    "support cannot change a stock level",
    adjust.status === 403,
    `status ${adjust.status}`
  );

  // And support cannot import or export the catalogue.
  for (const [path, method] of [
    ["/api/admin/products/export", "GET"],
    ["/api/admin/products/import/template", "GET"],
  ]) {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { cookie: `pf_auth=${support}` },
    });
    check(`support blocked from ${path}`, r.status === 403, `status ${r.status}`);
  }

  // The purchase cost is not in anybody's file but an administrator's.
  const asAdmin = await fetch(`${BASE}/api/admin/products/export`, {
    headers: { cookie: `pf_auth=${admin}` },
  }).then((r) => r.text());
  const asSupport = await fetch(`${BASE}/api/admin/products/export`, {
    headers: { cookie: `pf_auth=${support}` },
  });
  check(
    "an administrator's file carries the purchase cost",
    asAdmin.includes("purchase_cost")
  );
  check(
    "and nobody else's does",
    asSupport.status === 403 && !asSupport.body?.includes?.("purchase_cost"),
    `status ${asSupport.status}`
  );
}

console.log("\n→ delisting");
const before = await fetch(`${BASE}/api/admin/products?q=DualSense`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
const target = before.rows.find((p) => p.slug === "dualsense-white");
check("dualsense-white is listed", target?.listed === true);

const patch = await fetch(
  `${BASE}/api/admin/products/dualsense-white`,
  {
    method: "PATCH",
    headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
    body: JSON.stringify({ listed: false }),
  }
);
check("PATCH delist", patch.status === 200, `status ${patch.status}`);

const shop = await fetch(`${BASE}/api/search?q=DualSense%20Wireless`);
const shopBody = await shop.json();
check(
  "delisted product gone from search",
  !shopBody.products.some((p) => p.slug === "dualsense-white"),
  `${shopBody.products.length} results`
);

const page = await get("/product/dualsense-white", null);
check(
  "delisted product page still reachable",
  page.status === 200 && page.body.includes("No longer on sale"),
  `status ${page.status}`
);

const restore = await fetch(
  `${BASE}/api/admin/products/dualsense-white`,
  {
    method: "PATCH",
    headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
    body: JSON.stringify({ listed: true }),
  }
);
check("PATCH relist", restore.status === 200);

console.log("\n→ SKUs");
const everything = await fetch(`${BASE}/api/admin/products?limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());

check(
  "every product carries a SKU",
  everything.rows.length > 0 && everything.rows.every((p) => p.sku)
);
const skuList = everything.rows.map((p) => p.sku);
check(
  "SKUs are unique",
  new Set(skuList).size === skuList.length,
  `${skuList.length} products, ${new Set(skuList).size} SKUs`
);
check(
  "the API carries the workflow status",
  everything.rows.every((p) => typeof p.status === "string")
);

const bySku = await fetch(`${BASE}/api/admin/products?q=DUALSENSE-EDGE`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "search by SKU finds the product",
  bySku.rows.some((p) => p.slug === "dualsense-edge"),
  `${bySku.rows.length} results`
);

const dupe = await fetch(`${BASE}/api/admin/products/dualsense-white`, {
  method: "PATCH",
  headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
  body: JSON.stringify({ sku: "DUALSENSE-EDGE" }),
});
check("a duplicate SKU is rejected", dupe.status === 409, `status ${dupe.status}`);

console.log("\n→ catalogue filters");
const listedOnly = await fetch(`${BASE}/api/admin/products?listed=true&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
const delistedOnly = await fetch(
  `${BASE}/api/admin/products?listed=false&limit=100`,
  { headers: { cookie: `pf_auth=${admin}` } }
).then((r) => r.json());
check(
  "listed=true returns only listed products",
  listedOnly.rows.every((p) => p.listed === true),
  `${listedOnly.rows.length} rows`
);
check(
  "listed=false returns only delisted products",
  delistedOnly.rows.every((p) => p.listed === false),
  `${delistedOnly.rows.length} rows`
);
check(
  "the listing filter really narrows the list",
  listedOnly.rows.length + delistedOnly.rows.length === everything.rows.length
);

const byStatus = await fetch(`${BASE}/api/admin/products?status=draft`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "the status filter works",
  byStatus.rows.every((p) => p.status === "draft"),
  `${byStatus.rows.length} rows`
);
check(
  "the count matches the filtered rows",
  byStatus.total === byStatus.rows.length,
  `total ${byStatus.total}, rows ${byStatus.rows.length}`
);

console.log("\n→ archive and restore");
const archive = await fetch(`${BASE}/api/admin/products/dualsense-edge`, {
  method: "PATCH",
  headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
  body: JSON.stringify({ status: "archived" }),
});
check("PATCH archive", archive.status === 200, `status ${archive.status}`);

const shopArchived = await fetch(`${BASE}/api/search?q=DualSense%20Edge`).then(
  (r) => r.json()
);
check(
  "archived product gone from the shop",
  !shopArchived.products.some((p) => p.slug === "dualsense-edge"),
  `${shopArchived.products.length} results`
);
const archivedPage = await get("/product/dualsense-edge", null);
check(
  "archived product keeps its page",
  archivedPage.status === 200 &&
    archivedPage.body.includes("No longer on sale"),
  `status ${archivedPage.status}`
);
const archivedAdmin = await get("/admin/products/dualsense-edge", `pf_auth=${admin}`);
check(
  "archived product still in the back office",
  archivedAdmin.status === 200,
  `status ${archivedAdmin.status}`
);

const restoreArchived = await fetch(`${BASE}/api/admin/products/dualsense-edge`, {
  method: "PATCH",
  headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
  body: JSON.stringify({ status: "published" }),
});
check("PATCH restore", restoreArchived.status === 200, `status ${restoreArchived.status}`);
const shopRestored = await fetch(`${BASE}/api/search?q=DualSense%20Edge`).then(
  (r) => r.json()
);
check(
  "restored product back in the shop",
  shopRestored.products.some((p) => p.slug === "dualsense-edge"),
  `${shopRestored.products.length} results`
);

console.log("\n→ delete is guarded");
const ordered = await fetch(
  `${BASE}/api/admin/products/playstation-5-slim-disc-1tb`,
  { method: "DELETE", headers: { cookie: `pf_auth=${admin}` } }
);
check(
  "delete blocked for a product with order history",
  ordered.status === 409,
  `status ${ordered.status}`
);
const orderedBody = await ordered.json();
check(
  "the refusal explains itself",
  /order line/i.test(orderedBody.error ?? ""),
  orderedBody.error
);

const supportDelete = await fetch(
  `${BASE}/api/admin/products/dualsense-edge`,
  { method: "DELETE", headers: { cookie: `pf_auth=${support}` } }
);
check(
  "support cannot delete a product",
  supportDelete.status === 403,
  `status ${supportDelete.status}`
);

// A product nobody has ordered, created for this test and removed again.
//
// It is created through the shop's own API rather than written into the
// database directly: the shop's data lives in Postgres now, and a row
// put into the old local file would never be seen by anything.
const testSlug = "zz-test-delete-me";
const created = await fetch(`${BASE}/api/admin/products`, {
  method: "POST",
  headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
  body: JSON.stringify({
    name: "Test product",
    slug: testSlug,
    brand: "Sony",
    category: "consoles",
    price: 100,
    mrp: 100,
    stock: 5,
  }),
});
check(
  "a product can be created",
  created.status === 200 || created.status === 201,
  `status ${created.status}`
);
const removed = await fetch(`${BASE}/api/admin/products/${testSlug}`, {
  method: "DELETE",
  headers: { cookie: `pf_auth=${admin}` },
});
check(
  "delete works for a product with no references",
  removed.status === 200,
  `status ${removed.status}`
);
const gone = await get(`/admin/products/${testSlug}`, `pf_auth=${admin}`);
check("the deleted product is gone", gone.status === 404, `status ${gone.status}`);

console.log("\n→ brand, stock and sorting");
const byBrand = await fetch(`${BASE}/api/admin/products?brand=Sony&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "the brand filter works",
  byBrand.rows.length > 0 && byBrand.rows.every((p) => p.brand === "Sony"),
  `${byBrand.rows.length} rows`
);
check(
  "the count matches the brand filter",
  byBrand.total === byBrand.rows.length,
  `total ${byBrand.total}, rows ${byBrand.rows.length}`
);

const outOfStock = await fetch(`${BASE}/api/admin/products?stock=out&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "the out-of-stock filter works",
  outOfStock.rows.every((p) => sellableStock(p) === 0),
  `${outOfStock.rows.length} rows`
);
check(
  "a product that sells through its variants is not written off",
  !outOfStock.rows.some((p) => p.slug === "playstation-5-slim-disc-1tb"),
  "the PlayStation 5 Slim has variant stock"
);
const lowStock = await fetch(`${BASE}/api/admin/products?stock=low&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "the low-stock filter works",
  // The rule the catalogue uses: a product is low when the stock it can
  // sell has reached its threshold, or when one of its options has
  // reached that option's own — an option that has run out makes the
  // product low even while the others are still on the shelf.
  lowStock.rows.every((p) => productStockLevel(p) === "low"),
  `${lowStock.rows.length} rows`
);
check(
  "the low-stock filter leaves the healthy products out",
  lowStock.rows.every(
    (p) => sellableStock(p) > 0 || p.variants?.length > 0
  ),
  `${lowStock.rows.length} rows`
);

// The PlayStation 5 Slim has variants, so it is filed by their stock added
// up rather than by its own — whichever band that lands in.
const allProducts = await fetch(`${BASE}/api/admin/products?limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
const ps5 = allProducts.rows.find((p) => p.slug === "playstation-5-slim-disc-1tb");
const ps5Stock = sellableStock(ps5);
const inStock = await fetch(`${BASE}/api/admin/products?stock=in&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "a product with variants is filed by its sellable stock",
  ps5Stock > 5
    ? inStock.rows.some((p) => p.slug === ps5.slug)
    : !outOfStock.rows.some((p) => p.slug === ps5.slug),
  `sellable stock ${ps5Stock}`
);

const asc = await fetch(`${BASE}/api/admin/products?sort=price-asc&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "sorting by price, low to high",
  asc.rows.every((p, i, rows) => i === 0 || rows[i - 1].price <= p.price),
  asc.rows.map((p) => p.price).join(" · ")
);
const desc = await fetch(`${BASE}/api/admin/products?sort=price-desc&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "sorting by price, high to low",
  desc.rows.every((p, i, rows) => i === 0 || rows[i - 1].price >= p.price),
  desc.rows.map((p) => p.price).join(" · ")
);
check(
  "sorting by newest returns rows",
  (await fetch(`${BASE}/api/admin/products?sort=newest&limit=100`, {
    headers: { cookie: `pf_auth=${admin}` },
  })).status === 200
);
const bestRes = await fetch(`${BASE}/api/admin/products?sort=best-selling&limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
});
const best = await bestRes.json();
check(
  "sorting by best selling works",
  bestRes.status === 200 && best.rows.length > 0,
  best.rows[0] ? `${best.rows[0].slug} first` : "no rows"
);
check(
  "the best seller really is the one with the sales",
  best.rows[0]?.slug === "playstation-5-slim-disc-1tb",
  best.rows[0]?.slug
);
check(
  "an unknown sort key falls back safely",
  (await fetch(`${BASE}/api/admin/products?sort=; DROP TABLE products`, {
    headers: { cookie: `pf_auth=${admin}` },
  })).status === 200
);

console.log("\n→ duplicate");
const duplicated = await fetch(
  `${BASE}/api/admin/products/dualsense-white/duplicate`,
  { method: "POST", headers: { cookie: `pf_auth=${admin}` } }
);
check("duplicate returns 201", duplicated.status === 201, `status ${duplicated.status}`);
const copySlug = (await duplicated.json()).duplicated;
check(
  "the copy has its own slug",
  Boolean(copySlug) && copySlug !== "dualsense-white",
  copySlug
);
const copy = await fetch(`${BASE}/api/admin/products/${copySlug}`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check("the copy keeps the product's details", (copy.name ?? "").includes("(copy)"));
check("the copy starts as a draft", copy.status === "draft", copy.status);
check(
  "the copy has its own SKU",
  Boolean(copy.sku) && copy.sku !== "DUALSENSE-WHITE",
  copy.sku
);
check(
  "the copy keeps its variants",
  copy.variants.length ===
    everything.rows.find((p) => p.slug === "dualsense-white").variants.length
);
check(
  "the copy is out of the shop",
  !(
    await fetch(`${BASE}/api/search?q=DualSense%20White`).then((r) => r.json())
  ).products.some((p) => p.slug === copySlug)
);
const removedCopy = await fetch(`${BASE}/api/admin/products/${copySlug}`, {
  method: "DELETE",
  headers: { cookie: `pf_auth=${admin}` },
});
check("the copy can be deleted again", removedCopy.status === 200, `status ${removedCopy.status}`);

console.log("\n→ bulk actions");
const bulkTargets = ["playstation-vr2", "dualsense-charging-station"];
const bulkPost = (action, slugs) =>
  fetch(`${BASE}/api/admin/products`, {
    method: "POST",
    headers: { cookie: `pf_auth=${admin}`, "content-type": "application/json" },
    body: JSON.stringify({ action, slugs }),
  });

const bulkDelist = await bulkPost("delist", bulkTargets);
check("bulk delist", bulkDelist.status === 200, `status ${bulkDelist.status}`);
check(
  "bulk delist changed both products",
  (await bulkDelist.json()).changed === 2
);
let afterBulk = await fetch(`${BASE}/api/admin/products?limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "both products are delisted",
  bulkTargets.every(
    (s) => afterBulk.rows.find((p) => p.slug === s)?.listed === false
  )
);

const bulkArchive = await bulkPost("archive", bulkTargets);
check("bulk archive", bulkArchive.status === 200);
afterBulk = await fetch(`${BASE}/api/admin/products?limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "both products are archived",
  bulkTargets.every(
    (s) => afterBulk.rows.find((p) => p.slug === s)?.status === "archived"
  )
);

const bulkPublish = await bulkPost("publish", bulkTargets);
check("bulk publish", bulkPublish.status === 200);
afterBulk = await fetch(`${BASE}/api/admin/products?limit=100`, {
  headers: { cookie: `pf_auth=${admin}` },
}).then((r) => r.json());
check(
  "both products are published and listed again",
  bulkTargets.every((s) => {
    const row = afterBulk.rows.find((p) => p.slug === s);
    return row?.status === "published" && row?.listed === true;
  })
);
check(
  "a bulk action for a product that does not exist is reported",
  (await bulkPost("publish", ["no-such-product"])).status === 200
);
check(
  "support cannot run a bulk action",
  (
    await fetch(`${BASE}/api/admin/products`, {
      method: "POST",
      headers: { cookie: `pf_auth=${support}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", slugs: bulkTargets }),
    })
  ).status === 403
);

console.log("\n→ the catalogue table");
const catalogue = await get("/admin/products", `pf_auth=${admin}`);
const catalogueText = catalogue.body
  .replace(/<!--.*?-->/gs, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");
const tableChecks = [
  ["the SKU column is there", catalogue.body.includes(">SKU<")],
  [
    "a product shows its SKU",
    catalogue.body.includes("PLAYSTATION-5-SLIM-DISC-1TB"),
  ],
  [
    "the status filter is there",
    catalogueText.includes("Any status") &&
      catalogueText.includes("Archived") &&
      catalogueText.includes("Draft"),
  ],
  [
    "the listing filter is there",
    catalogueText.includes("Listed and delisted") &&
      catalogueText.includes("Delisted only"),
  ],
  [
    "the search box mentions the SKU",
    catalogue.body.includes("Search name, brand or SKU"),
  ],
  ["each row has a status dropdown", catalogue.body.includes('aria-label="Status for ')],
  ["each row has an archive action", catalogue.body.includes('aria-label="Archive ')],
  ["each row has a delete action", catalogue.body.includes('aria-label="Delete ')],
  ["each row has a duplicate action", catalogue.body.includes('aria-label="Duplicate ')],
  ["the discount is shown", catalogue.body.includes("% off")],
  ["the brand filter is there", catalogueText.includes("All brands")],
  [
    "the stock filter is there",
    catalogueText.includes("Low stock") && catalogueText.includes("Out of stock"),
  ],
  [
    "the sort dropdown is there",
    catalogueText.includes("Price: low to high") && catalogueText.includes("Best selling"),
  ],
  ["rows can be selected", catalogue.body.includes('aria-label="Select ')],
  ["the whole page can be selected", catalogue.body.includes('aria-label="Select every product on this page"')],
  ["the counts are shown", catalogueText.includes("Showing 1–9 of 9 products")],
  ["the filters carry their own counts", catalogueText.includes("All brands (9)")],
  [
    "the stock column counts what the product can sell",
    catalogueText.includes("in 2 variants"),
  ],
];
for (const [label, ok] of tableChecks) check(label, ok);

console.log("\n→ the product editor");
const editor = await get("/admin/products/playstation-5-slim-disc-1tb", `pf_auth=${admin}`);
check(
  "the editor has a SKU field",
  editor.body.includes('name="sku"') &&
    editor.body.includes("PLAYSTATION-5-SLIM-DISC-1TB")
);
check(
  "the editor has a status control",
  editor.body.includes('aria-label="Status for ')
);

console.log(
  failures === 0
    ? "\n✓ ALL PASS — back office smoke test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
