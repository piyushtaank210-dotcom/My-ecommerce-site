/**
 * Seeds data/store.db from data/catalog.json + data/product-images.json,
 * plus data/hero.json + data/hero-images.json for the homepage carousel.
 *   node scripts/seed.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../src/lib/schema.ts";
import { STAFF, hashPassword } from "./staff.mjs";
import { normalizeSku, skuFromSlug, uniqueSku } from "../src/lib/sku.ts";
import { inferVariantAttributes } from "../src/lib/variations.ts";
import { seedProductImages } from "../src/lib/migrations.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_DIR = join(ROOT, "data");
const DB_PATH = join(DB_DIR, "store.db");

// A fresh database each time. Stop the dev server first — on Windows it
// holds data/store.db open and the unlink below fails with EBUSY.
mkdirSync(DB_DIR, { recursive: true });
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const f = DB_PATH + suffix;
  if (existsSync(f)) unlinkSync(f);
}

const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));
const images = JSON.parse(readFileSync(join(ROOT, "data/product-images.json"), "utf8"));

const hero = JSON.parse(readFileSync(join(ROOT, "data/hero.json"), "utf8"));
const heroImages = JSON.parse(readFileSync(join(ROOT, "data/hero-images.json"), "utf8"));

const db = new DatabaseSync(DB_PATH);
db.exec(SCHEMA_SQL);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("BEGIN");

const insCat = db.prepare(
  "INSERT INTO categories (slug, name, icon, blurb, spec_fields, position) VALUES (?, ?, ?, ?, ?, ?)"
);
catalog.categories.forEach((c, i) => {
  insCat.run(
    c.slug,
    c.name,
    c.icon ?? null,
    c.blurb ?? null,
    JSON.stringify(c.specFields ?? []),
    i
  );
});

const insProd = db.prepare(
  `INSERT INTO products
     (slug, sku, name, brand, category_slug, price, mrp, rating, reviews, stock,
      badge, short_desc, specs, image, attributes, listed, status, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', ?)`
);
const insVar = db.prepare(
  `INSERT INTO variants
     (id, product_slug, name, sku, price, mrp, stock, low_stock_threshold,
      image, barcode, attributes, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

/** The SKUs handed out during this seed, so none of them collide. */
const takenSkus = new Set();

catalog.products.forEach((p, i) => {
  const image = images[p.image] ?? null;
  if (!image) console.warn(`  ! no image for ${p.slug} (key "${p.image}")`);

  // A product may carry its own SKU in catalog.json; otherwise one is
  // generated from the slug and made unique.
  const wanted = p.sku ? normalizeSku(p.sku) : "";
  const sku = uniqueSku(wanted || skuFromSlug(p.slug), (candidate) =>
    takenSkus.has(candidate)
  );
  takenSkus.add(sku);

  // What the product varies by — "Colour", "Storage", "Edition".
  const attributes = p.attributes ?? {};

  insProd.run(
    p.slug,
    sku,
    p.name,
    p.brand ?? null,
    p.category ?? null,
    p.price,
    p.mrp,
    p.rating ?? 0,
    p.reviews ?? 0,
    p.stock ?? 0,
    p.badge ?? null,
    p.shortDesc ?? null,
    JSON.stringify(p.specs ?? {}),
    image,
    JSON.stringify(attributes),
    i
  );

  (p.variants ?? []).forEach((v, j) => {
    // The option's own values. They are worked out from its name when the
    // name is one of the attribute's values, and spelled out otherwise.
    const variantAttributes = v.attributes
      ? v.attributes
      : inferVariantAttributes(attributes, v.name);

    const variantSku = uniqueSku(
      normalizeSku(v.sku ?? "") || skuFromSlug(`${p.slug}-${v.name}`),
      (candidate) => takenSkus.has(candidate)
    );
    takenSkus.add(variantSku);

    insVar.run(
      `${p.slug}::${v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      p.slug,
      v.name,
      variantSku,
      v.price,
      v.mrp,
      v.stock ?? 0,
      v.lowStockThreshold ?? 5,
      v.image ?? null,
      v.barcode ?? null,
      JSON.stringify(variantAttributes),
      j
    );
  });
});

const insHero = db.prepare(
  `INSERT INTO hero_slides
     (id, image, alt, image_position, eyebrow, title, body,
      primary_label, primary_href, secondary_label, secondary_href, note, side, position, video)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

hero.slides.forEach((s, i) => {
  const image = heroImages[s.image] ?? null;
  if (!image) console.warn(`  ! no image for hero slide "${s.id}" (key "${s.image}")`);

  // A slide may name a film to play instead of the photograph. It has to be
  // carried into the database here as well as in sync-hero.mjs — this seed is
  // what builds the shop on a fresh deployment, so a slide that left the film
  // behind would never show it.
  const video = s.video ?? null;
  if (video && !existsSync(join(ROOT, "public", video.replace(/^\//, "")))) {
    console.warn(`  ! no file for the video on slide "${s.id}" (${video})`);
  }

  insHero.run(
    s.id,
    image,
    s.alt,
    s.position ?? "50% 50%",
    s.eyebrow ?? null,
    s.title,
    s.body ?? null,
    s.primary?.label ?? null,
    s.primary?.href ?? null,
    s.secondary?.label ?? null,
    s.secondary?.href ?? null,
    s.note ?? null,
    s.side === "right" ? "right" : "left",
    i,
    video
  );
});

db.exec("COMMIT");

/* ------------------------------------------------------------ staff accounts */
/**
 * One admin and one support desk, so the back office can be opened straight
 * after a seed.
 */
const insUser = db.prepare(
  "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
);
db.exec("BEGIN");
for (const s of STAFF) {
  insUser.run(s.name, s.email, hashPassword(s.password), s.role);
  console.log(`  ✓ ${s.role.padEnd(7)} ${s.email}`);
}
db.exec("COMMIT");

// The photographs of every product, moved out of the code and into the
// database where the back office can manage them.
seedProductImages(db);

const counts = {
  categories: db.prepare("SELECT COUNT(*) c FROM categories").get().c,
  products: db.prepare("SELECT COUNT(*) c FROM products").get().c,
  variants: db.prepare("SELECT COUNT(*) c FROM variants").get().c,
  product_images: db.prepare("SELECT COUNT(*) c FROM product_images").get().c,
  hero_slides: db.prepare("SELECT COUNT(*) c FROM hero_slides").get().c,
  users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
};
db.close();

writeFileSync(
  join(DB_DIR, "seed-summary.json"),
  JSON.stringify({ seededAt: new Date().toISOString(), ...counts }, null, 2)
);

console.log(`✓ seeded data/store.db`);
console.log(
  `  ${counts.categories} categories · ${counts.products} products · ${counts.variants} variants`
);
console.log(`  ${counts.hero_slides} hero slides`);
