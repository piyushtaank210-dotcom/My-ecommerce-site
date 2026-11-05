/**
 * Test for the product editor.
 *
 *   node scripts/check-product-form.mjs
 *
 * The dev server must be running on port 3000.
 *
 * It checks that the back office can edit a product's details, that the
 * photographs can be uploaded, reordered, made the main one and removed, and
 * that a sale price is what the customer actually pays. Everything it
 * changes is put back at the end.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const db = new DatabaseSync(join(ROOT, "data/store.db"));

const admin = tokenForRole(db, "admin");
const support = tokenForRole(db, "support");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

async function api(path, options = {}) {
  // A form body carries its own content type, so the header is only set
  // for the JSON ones.
  const isForm = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      cookie: `pf_auth=${admin}`,
      ...(isForm ? {} : { "content-type": "application/json" }),
    },
  });
  const body = await res.text();
  try {
    return { status: res.status, json: JSON.parse(body) };
  } catch {
    return { status: res.status, json: null };
  }
}

async function as(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: res.status, body: await res.text() };
}

/** A one-pixel PNG, so the upload has something real to carry. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const FIXTURE = {
  slug: "zz-form-fixture",
  name: "Zephyr Form Fixture",
  brand: "Zephyr",
  category: "consoles",
  price: 10000,
  mrp: 20000,
  stock: 7,
};

// The fixture is created and removed through the back office's own API, so
// the test never writes to the products table itself.
//
// A run that was interrupted leaves its fixture and any copies behind, so
// the ground is cleared first.
const leftovers = await api("/api/admin/products?limit=100");
for (const p of leftovers.json?.rows ?? []) {
  if (!p.slug.startsWith("zz-form-fixture")) continue;
  await api(`/api/admin/products/${p.slug}`, { method: "DELETE" });
}

const created = await api("/api/admin/products", {
  method: "POST",
  body: JSON.stringify({
    slug: FIXTURE.slug,
    name: FIXTURE.name,
    brand: FIXTURE.brand,
    category: FIXTURE.category,
    price: FIXTURE.price,
    mrp: FIXTURE.mrp,
    stock: FIXTURE.stock,
  }),
});
if (created.status !== 201) {
  console.log(`  ✗ the fixture could not be created — status ${created.status}`);
  process.exit(1);
}

try {
  console.log("\n→ creating a product");
  {
    check("a new product starts as a draft", created.json.status === "draft", created.json.status);
    check(
      "a SKU is generated from the address",
      created.json.sku === "ZZ-FORM-FIXTURE",
      created.json.sku
    );

    const published = await api(`/api/admin/products/${FIXTURE.slug}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    });
    check(
      "and can be published",
      published.json.status === "published" && published.json.listed === true,
      published.json.status
    );
  }

  console.log("\n→ editing a product");
  {
    const edited = await api(`/api/admin/products/${FIXTURE.slug}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "Zephyr Form Fixture v2",
        brand: "Zephyr",
        subcategory: "PS5",
        modelNumber: "CFI-2016A",
        condition: "open-box",
        shortDesc: "A short description.",
        description: "The whole story of the fixture.",
        price: 12000,
        mrp: 20000,
        salePrice: 10000,
        purchaseCost: 8000,
        stock: 9,
        specs: { Storage: "1TB", Colours: "White" },
        imageAlt: "A console seen from the front",
        seoTitle: "Zephyr Form Fixture — the SEO title",
        metaDescription: "The meta description of the fixture.",
        weightGrams: 4500,
        packageLength: 40,
        packageWidth: 30,
        packageHeight: 10,
        warranty: "1 year manufacturer warranty",
        returns: "7-day replacement",
      }),
    });
    check("the edit is accepted", edited.status === 200, `status ${edited.status}`);

    const row = edited.json;
    check("the name is saved", row.name === "Zephyr Form Fixture v2", row.name);
    check("the brand is saved", row.brand === "Zephyr", row.brand);
    check("the subcategory is saved", row.subcategory === "PS5", row.subcategory);
    check(
      "the model number is saved",
      row.model_number === "CFI-2016A",
      row.model_number
    );
    check("the condition is saved", row.condition === "open-box", row.condition);
    check(
      "the short description is saved",
      row.short_desc === "A short description.",
      row.short_desc
    );
    check(
      "the full description is saved",
      row.description === "The whole story of the fixture.",
      row.description
    );
    check("the selling price is saved", row.price === 12000, String(row.price));
    check("the MRP is saved", row.mrp === 20000, String(row.mrp));
    check(
      "the sale price is saved",
      row.sale_price === 10000,
      String(row.sale_price)
    );
    check(
      "the purchase cost is saved",
      row.purchase_cost === 8000,
      String(row.purchase_cost)
    );
    check("the stock is saved", row.stock === 9, String(row.stock));
    check(
      "the specifications are saved",
      row.specs.Storage === "1TB" && row.specs.Colours === "White",
      JSON.stringify(row.specs)
    );
    check(
      "the image alt text is saved",
      row.image_alt === "A console seen from the front",
      row.image_alt
    );
    check(
      "the SEO title is saved",
      row.seo_title === "Zephyr Form Fixture — the SEO title",
      row.seo_title
    );
    check(
      "the meta description is saved",
      row.meta_description === "The meta description of the fixture.",
      row.meta_description
    );
    check(
      "the weight is saved",
      row.weight_grams === 4500,
      String(row.weight_grams)
    );
    check(
      "the package dimensions are saved",
      row.package_length === 40 &&
        row.package_width === 30 &&
        row.package_height === 10,
      `${row.package_length}×${row.package_width}×${row.package_height}`
    );
    check(
      "the warranty is saved",
      row.warranty === "1 year manufacturer warranty",
      row.warranty
    );
    check("the returns are saved", row.returns === "7-day replacement", row.returns);
  }

  console.log("\n→ the shop shows what the back office set");
  {
    const page = await as(`/product/${FIXTURE.slug}`, null);
    check("the product page renders", page.status === 200, `status ${page.status}`);
    check(
      "the sale price is what the customer sees",
      page.body.includes("10,000"),
      "₹10,000"
    );
    check(
      "the price it normally sells for is struck through",
      page.body.includes("12,000"),
      "₹12,000"
    );
    check(
      "the full description is on the page",
      page.body.includes("The whole story of the fixture.")
    );
    check(
      "the specifications are on the page",
      page.body.includes("1TB") && page.body.includes("Colours")
    );
    check(
      "the warranty is on the page",
      page.body.includes("1 year manufacturer warranty")
    );
    check(
      "the returns are on the page",
      page.body.includes("7-day replacement")
    );
    check(
      "the weight is on the page",
      page.body.includes("4.5 kg"),
      "4.5 kg"
    );
    check(
      "the package size is on the page",
      page.body.includes("40 × 30 × 10"),
      "40 × 30 × 10 cm"
    );
    check(
      "the condition is on the page",
      page.body.includes("Open box"),
      "Open box"
    );
    check(
      "the SEO title is the page title",
      page.body.includes("<title>Zephyr Form Fixture — the SEO title"),
      "the SEO title"
    );
    check(
      "the meta description is in the head",
      page.body.includes('content="The meta description of the fixture."')
    );

    const search = await fetch(`${BASE}/api/search?q=Zephyr%20Form%20Fixture`).then(
      (r) => r.json()
    );
    check(
      "the search shows the sale price too",
      search.products[0]?.price === 10000,
      String(search.products[0]?.price)
    );
  }

  console.log("\n→ photographs");
  {
    const before = await api(`/api/admin/products/${FIXTURE.slug}/images`);
    check("the product starts with no photographs", before.json.images.length === 0);

    const form = new FormData();
    form.append(
      "files",
      new File([PNG], "fixture-front.png", { type: "image/png" })
    );
    const uploaded = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "POST",
      body: form,
    });
    check("a photograph can be uploaded", uploaded.status === 200, `status ${uploaded.status}`);
    check(
      "the photograph is in the gallery",
      uploaded.json.images.length === 1,
      `${uploaded.json.images.length} images`
    );
    const first = uploaded.json.images[0];
    check(
      "the photograph has a path of ours",
      typeof first.path === "string" && first.path.startsWith("/uploads/"),
      first.path
    );
    check(
      "the file is on disk",
      existsSync(join(ROOT, "public", first.path.replace(/^\//, ""))),
      first.path
    );
    check(
      "the first photograph becomes the main one",
      (await api(`/api/admin/products/${FIXTURE.slug}`)).json.image === first.path,
      first.path
    );

    // A second photograph, so the order can be changed.
    const form2 = new FormData();
    form2.append(
      "files",
      new File([PNG], "fixture-back.png", { type: "image/png" })
    );
    const second = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "POST",
      body: form2,
    });
    check("a second photograph can be uploaded", second.json.images.length === 2);

    const ids = second.json.images.map((i) => i.id);
    const reordered = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reorder", ids: [ids[1], ids[0]] }),
    });
    check(
      "the photographs can be reordered",
      reordered.json.images[0].id === ids[1],
      reordered.json.images.map((i) => i.id).join(", ")
    );

    const main = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({ action: "main", id: ids[0] }),
    });
    check(
      "a photograph can be made the main one",
      main.json.images[0].id === ids[0],
      main.json.images[0].id
    );
    check(
      "and the product follows it",
      (await api(`/api/admin/products/${FIXTURE.slug}`)).json.image ===
        main.json.images[0].path
    );

    const alt = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "alt",
        id: ids[0],
        alt: "The fixture seen from behind",
      }),
    });
    check(
      "a photograph can be described",
      alt.json.images.find((i) => i.id === ids[0]).alt ===
        "The fixture seen from behind"
    );

    const gallery = await api(`/api/admin/products/${FIXTURE.slug}/images`);
    const shopPage = await as(`/product/${FIXTURE.slug}`, null);
    check(
      "the gallery is on the product page",
      shopPage.body.includes("/uploads/" + FIXTURE.slug),
      "the uploaded photographs"
    );
    check(
      "the descriptions are on the product page",
      shopPage.body.includes("The fixture seen from behind")
    );

    const removed = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({ action: "remove", id: ids[0] }),
    });
    check(
      "a photograph can be removed",
      removed.json.images.length === 1,
      `${removed.json.images.length} images`
    );
    check(
      "and its file is taken off the disk",
      !existsSync(join(ROOT, "public", first.path.replace(/^\//, ""))),
      first.path
    );

    // The second one goes too, so the fixture is left as it was found.
    await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({ action: "remove", id: ids[1] }),
    });
    const after = await api(`/api/admin/products/${FIXTURE.slug}/images`);
    check("the gallery is empty again", after.json.images.length === 0);
  }

  console.log("\n→ a copy does not take the original's photographs with it");
  {
    // A photograph, so there is something for the copy to carry.
    const form = new FormData();
    form.append(
      "files",
      new File([PNG], "fixture-copy.png", { type: "image/png" })
    );
    const uploaded = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "POST",
      body: form,
    });
    const path = uploaded.json.images[0].path;
    check(
      "the photograph is on disk",
      existsSync(join(ROOT, "public", path.replace(/^\//, ""))),
      path
    );

    const copy = await api(`/api/admin/products/${FIXTURE.slug}/duplicate`, {
      method: "POST",
    });
    const copySlug = copy.json?.duplicated;
    check("the product can be copied", Boolean(copySlug), copySlug ?? "no copy");
    check(
      "the copy carries the photograph",
      (await api(`/api/admin/products/${copySlug}/images`)).json.images.length === 1
    );

    const deleted = await api(`/api/admin/products/${copySlug}`, {
      method: "DELETE",
    });
    check("the copy can be removed", deleted.status === 200, `status ${deleted.status}`);
    check(
      "and the original's photograph is still on disk",
      existsSync(join(ROOT, "public", path.replace(/^\//, ""))),
      path
    );
    check(
      "and the original still has it",
      (await api(`/api/admin/products/${FIXTURE.slug}/images`)).json.images.length === 1
    );

    // The photograph goes, so the fixture is left as it was found.
    await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "remove",
        id: uploaded.json.images[0].id,
      }),
    });
  }

  console.log("\n→ what is not allowed");
  {
    const anonymous = await fetch(`${BASE}/api/admin/products/${FIXTURE.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hacked" }),
    });
    check(
      "an anonymous visitor cannot edit a product",
      anonymous.status === 401,
      `status ${anonymous.status}`
    );

    const supportEdit = await fetch(`${BASE}/api/admin/products/${FIXTURE.slug}`, {
      method: "PATCH",
      headers: {
        cookie: `pf_auth=${support}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Hacked" }),
    });
    check(
      "support cannot edit a product",
      supportEdit.status === 403,
      `status ${supportEdit.status}`
    );

    const supportUpload = await fetch(
      `${BASE}/api/admin/products/${FIXTURE.slug}/images`,
      {
        method: "POST",
        headers: { cookie: `pf_auth=${support}` },
        body: (() => {
          const f = new FormData();
          f.append("files", new File([PNG], "x.png", { type: "image/png" }));
          return f;
        })(),
      }
    );
    check(
      "support cannot upload a photograph",
      supportUpload.status === 403,
      `status ${supportUpload.status}`
    );

    const badType = await api(`/api/admin/products/${FIXTURE.slug}/images`, {
      method: "POST",
      body: (() => {
        const f = new FormData();
        f.append("files", new File([Buffer.from("not an image")], "x.txt", { type: "text/plain" }));
        return f;
      })(),
    });
    check(
      "a file that is not a photograph is refused",
      badType.status === 415,
      `status ${badType.status}`
    );
    check(
      "and the refusal says why",
      /not a photograph/i.test(badType.json?.error ?? ""),
      badType.json?.error
    );

    const missing = await api(`/api/admin/products/no-such-product/images`, {
      method: "PATCH",
      body: JSON.stringify({ action: "main", id: "x" }),
    });
    check(
      "a photograph of a product that does not exist is refused",
      missing.status === 404,
      `status ${missing.status}`
    );
  }

  console.log("\n→ the catalogue was left alone");
  {
    const before = db
      .prepare(
        "SELECT slug, name, price, mrp, stock, status, listed FROM products WHERE slug != ? ORDER BY slug"
      )
      .all(FIXTURE.slug);
    const rows = await api("/api/admin/products?limit=100");
    const untouched = rows.json.rows
      .filter((p) => p.slug !== FIXTURE.slug)
      .map((p) => p.slug)
      .sort();
    check(
      "every other product is exactly as it was",
      JSON.stringify(untouched) ===
        JSON.stringify(before.map((p) => p.slug).sort()),
      `${before.length} products`
    );
    check(
      "and no picture was lost",
      db
        .prepare(
          "SELECT COUNT(*) n FROM product_images WHERE product_slug != ?"
        )
        .get(FIXTURE.slug).n > 0,
      "the gallery is still there"
    );
  }
} finally {
  // The fixture goes through the back office's own delete endpoint, which
  // refuses to remove a product with order lines — there are none.
  await api(`/api/admin/products/${FIXTURE.slug}`, { method: "DELETE" });
  db.close();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — product form test"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
