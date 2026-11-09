// The extension matters: this file is imported by the seed script, which runs
// on plain Node rather than through Next's bundler, and Node will not guess
// that "./sku" means "./sku.ts".
import { skuFromSlug, uniqueSku } from "./sku.ts";
import { PRODUCT_GALLERY } from "./product-gallery.ts";
import {
  RETURN_WINDOW_DAYS,
  RETURN_WINDOW_POLICY_MARKER,
  RETURN_WINDOW_SETTING,
} from "./return-policy.ts";
import type { Db } from "./db.ts";

/** A number out of a row. */
const num = (v: unknown): number => Number(v ?? 0);

/**
 * Whether a table is there.
 *
 * PostgreSQL keeps its tables in `information_schema`, where SQLite kept
 * them in `sqlite_master`.
 */
async function tableExists(db: Db, table: string): Promise<boolean> {
  const row =
    db.dialect === "postgres"
      ? await db
          .prepare(
            "SELECT 1 AS n FROM information_schema.tables WHERE table_name = ? LIMIT 1"
          )
          .get(table)
      : await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
          )
          .get(table);
  return Boolean(row);
}

/**
 * Whether a table has a column.
 */
async function hasColumn(
  db: Db,
  table: string,
  column: string
): Promise<boolean> {
  const row =
    db.dialect === "postgres"
      ? await db
          .prepare(
            "SELECT 1 AS n FROM information_schema.columns WHERE table_name = ? AND column_name = ? LIMIT 1"
          )
          .get(table, column)
      : (
          (await db.prepare(`PRAGMA table_info(${table})`).all()) as {
            name: string;
          }[]
        ).some((c) => c.name === column);
  return Boolean(row);
}

/**
 * Columns added since the schema was first written.
 *
 * PostgreSQL's `CREATE TABLE IF NOT EXISTS` leaves an existing table
 * exactly as it was, so a fresh column has to be added with `ALTER
 * TABLE`. PostgreSQL can add one without being told whether it is there,
 * so each one is safe to run on every connection — it runs once, when the
 * database is first opened.
 */
export async function applyMigrations(db: Db): Promise<void> {
  const statements: string[] = [];

  const add = (table: string, column: string, ddl: string): void => {
    // PostgreSQL can add a column without being told whether it is
    // there; SQLite cannot, and the column is checked before its
    // statement runs.
    statements.push(
      db.dialect === "postgres"
        ? `ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS ${ddl}`
        : `ALTER TABLE IF EXISTS ${table} ADD COLUMN ${ddl}`
    );
  };

  // Three account types, and a phone number on the account.
  add("users", "role", "role TEXT NOT NULL DEFAULT 'member'");
  add("users", "phone", "phone TEXT");

  // Delisting: a product can be pulled out of the shop without being deleted.
  add("products", "listed", "listed INTEGER NOT NULL DEFAULT 1");

  // The catalogue's own codes, and where a product sits in the workflow.
  add("products", "sku", "sku TEXT");
  // Every product already in the catalogue was on sale when this column
  // arrived, so they all start as published. The older `listed` flag is left
  // exactly as it was, which keeps every product's visibility unchanged:
  // a product that was delisted before the status field existed is still hidden.
  add("products", "status", "status TEXT NOT NULL DEFAULT 'published'");

  // Enquiries get triaged rather than sitting in one list forever.
  add("contact_messages", "status", "status TEXT NOT NULL DEFAULT 'new'");
  add(
    "contact_messages",
    "handled_by",
    "handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL"
  );
  add("contact_messages", "handled_at", "handled_at TEXT");

  // The product editor's fuller details. Everything here is optional, so a
  // product that was added before the editor grew keeps working exactly as
  // it did — there is nothing to fill in and nothing is lost.
  add("products", "subcategory", "subcategory TEXT");
  add("products", "model_number", "model_number TEXT");
  add("products", "sale_price", "sale_price INTEGER");
  add("products", "purchase_cost", "purchase_cost INTEGER");
  add("products", "condition", "condition TEXT NOT NULL DEFAULT 'new'");
  add("products", "description", "description TEXT");
  add("products", "image_alt", "image_alt TEXT");
  add("products", "seo_title", "seo_title TEXT");
  add("products", "meta_description", "meta_description TEXT");
  add("products", "weight_grams", "weight_grams INTEGER");
  add("products", "package_length", "package_length INTEGER");
  add("products", "package_width", "package_width INTEGER");
  add("products", "package_height", "package_height INTEGER");
  add("products", "warranty", "warranty TEXT");
  add("products", "returns", "returns TEXT");

  // The hero slides carry the side their copy stands on.
  add("hero_slides", "side", "side TEXT NOT NULL DEFAULT 'left'");

  // A hero slide may show a film instead of a photograph. The picture
  // stays as its poster frame and as what a phone shows, so the slide
  // still looks right where the film is not played.
  add("hero_slides", "video", "video TEXT");
  // The film's own first frame, held as a still. The browser shows it
  // while the film is still downloading, which is what keeps the hero
  // from showing the photograph and then jumping to the film.
  add("hero_slides", "video_poster", "video_poster TEXT");

  // A phone gets its own picture. A wide screen is a landscape frame and
  // a phone is not, so a photograph cut for one is cropped badly in the
  // other; the slide keeps both and the screen takes the one that fits
  // it.
  add("hero_slides", "mobile_image", "mobile_image TEXT");
  // And its own description, because it is a different photograph.
  add("hero_slides", "mobile_alt", "mobile_alt TEXT");
  // And where that photograph is cropped to, which is its own frame.
  add("hero_slides", "mobile_position", "mobile_position TEXT DEFAULT '50% 50%'");

  // And a phone gets its own film, cut to a phone's portrait shape. A
  // film cut for a wide screen is mostly black when it is cut to a
  // phone's, so it is a separate file rather than the same one cut
  // differently in the browser.
  add("hero_slides", "mobile_video", "mobile_video TEXT");
  // The phone's film's own first frame, held as a still.
  add("hero_slides", "mobile_video_poster", "mobile_video_poster TEXT");

  // A replacement is a shipment of its own. These are what is going out
  // (which may not be the unit that came back), when it went, and where
  // it has got to — so the customer can be told the truth about it.
  add("return_requests", "replacement_product_slug", "replacement_product_slug TEXT");
  add("return_requests", "replacement_variant_id", "replacement_variant_id TEXT");
  add("return_requests", "replacement_dispatch_date", "replacement_dispatch_date TEXT");
  add("return_requests", "replacement_delivery_status", "replacement_delivery_status TEXT");
  add("return_requests", "replacement_delivered_at", "replacement_delivered_at TEXT");

  // What is going out in place of the unit that came back. It is not
  // always the same unit — sometimes the option the customer wants is
  // the one that is in stock.
  add("return_items", "replacement_product_slug", "replacement_product_slug TEXT");
  add("return_items", "replacement_variant_id", "replacement_variant_id TEXT");
  add("return_items", "replacement_quantity", "replacement_quantity INTEGER");

  // Stock, and how low it has to get before anybody is told.
  //
  // Every product and every option carries its own threshold, because a
  // console and a controller do not run out at the same point. The default
  // is five, which is what the store counted on before.
  add("products", "low_stock_threshold", "low_stock_threshold INTEGER NOT NULL DEFAULT 5");
  add("variants", "low_stock_threshold", "low_stock_threshold INTEGER NOT NULL DEFAULT 5");

  // An order line remembers which option it was for, and where its stock
  // stands.
  //
  // The stock state is what makes a cancellation safe: a line that has had
  // its stock taken says so, and only those lines can have it given back.
  add("order_items", "variant_id", "variant_id TEXT");
  add("order_items", "stock_state", "stock_state TEXT NOT NULL DEFAULT 'settled'");
  add("order_items", "stock_state_note", "stock_state_note TEXT");

  // The evidence a claim carries: a serial number says which unit came
  // back, a sealed state says whether a voluntary return is even
  // possible, the missing list says what an incomplete box is short of,
  // and the last three record where the missing accessories went.
  add("return_requests", "serial_number", "serial_number TEXT");
  add("return_requests", "sealed_state", "sealed_state TEXT");
  add("return_requests", "missing_accessories", "missing_accessories TEXT");
  add("return_requests", "accessories_courier", "accessories_courier TEXT");
  add("return_requests", "accessories_tracking", "accessories_tracking TEXT");
  add("return_requests", "accessories_dispatched_at", "accessories_dispatched_at TEXT");

  // An unboxing video is evidence too, and it is not a photograph.
  add("return_images", "kind", "kind TEXT NOT NULL DEFAULT 'photo'");

  // The statements are run together, one after the other.
  for (const statement of statements) {
    if (db.dialect === "postgres") {
      await db.exec(statement);
      continue;
    }
    // SQLite has no IF NOT EXISTS on ADD COLUMN, so the column is
    // checked before the statement runs.
    const match = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(statement);
    if (match && (await hasColumn(db, match[1], match[2]))) continue;
    await db.exec(statement);
  }

  await applyReturnWindowPolicy(db);
  await backfillOrderVariantIds(db);
  await backfillVariantSkus(db);
  await backfillProductSkus(db);
  await backfillBrands(db);
  await backfillSubcategories(db);
  await seedProductImages(db);
}

/**
 * Brings the stored return window onto the published policy.
 *
 * The shop's rules say seven calendar days for every kind of claim — a
 * damaged or faulty unit, a wrong item, a missing accessory and a
 * voluntary return on a sealed unit all get the same seven days. The
 * setting was left at the old default, so it is moved once. A marker row
 * records that this has been done, so a window the back office sets
 * afterwards is left alone.
 */
async function applyReturnWindowPolicy(db: Db): Promise<void> {
  if (!(await tableExists(db, "store_settings"))) return;

  const marker = await db
    .prepare("SELECT value FROM store_settings WHERE key = ?")
    .get(RETURN_WINDOW_POLICY_MARKER);
  if (marker) return;

  await db
    .prepare(
      `INSERT INTO store_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(RETURN_WINDOW_SETTING, String(RETURN_WINDOW_DAYS));

  await db
    .prepare(
      `INSERT INTO store_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(RETURN_WINDOW_POLICY_MARKER, String(RETURN_WINDOW_DAYS));
}

/**
 * The brands the store sells.
 *
 * The catalogue already names a brand on every product; this gathers those
 * names into a list the back office can manage. It records what is there —
 * it does not make a brand up.
 */
async function backfillBrands(db: Db): Promise<void> {
  if (!(await tableExists(db, "brands"))) return;
  if (!(await tableExists(db, "products"))) return;

  // The brands are listed in order of their name, ignoring how the name
  // is capitalised. The sort key is asked for as a column of its own,
  // because PostgreSQL will not order a distinct list by something it
  // did not ask for.
  const rows = (await db
    .prepare(
      `SELECT DISTINCT brand, lower(brand) AS brand_sort FROM products
       WHERE brand IS NOT NULL AND TRIM(brand) != ''
       ORDER BY brand_sort`
    )
    .all()) as { brand: string }[];

  // The brands that are already in the list, by name. A brand that is
  // already there is left alone — this runs every time the database is
  // opened, so it has to be safe to run again and again.
  const known = new Set(
    ((await db.prepare("SELECT name FROM brands").all()) as { name: string }[]).map(
      (r) => r.name.trim().toLowerCase()
    )
  );

  const insert = db.prepare(
    "INSERT INTO brands (slug, name, position) VALUES (?, ?, ?) ON CONFLICT DO NOTHING"
  );
  const taken = new Set<string>(
    ((await db.prepare("SELECT slug FROM brands").all()) as { slug: string }[]).map(
      (r) => r.slug
    )
  );

  let position = num(
    (
      (await db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM brands")
        .get()) as { n: number }
    ).n
  );

  for (const r of rows) {
    const name = r.brand.trim();
    const key = name.toLowerCase();
    if (known.has(key)) continue;

    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) continue;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${slug}-${n}`;
      n++;
    }
    taken.add(slug);
    known.add(key);
    await insert.run(slug, name, position);
    position++;
  }
}

/**
 * The categories inside the categories.
 *
 * A product may already name one; this gathers those names into the list
 * the back office can manage. It records what is there — it does not make
 * a subcategory up.
 */
async function backfillSubcategories(db: Db): Promise<void> {
  if (!(await tableExists(db, "subcategories"))) return;
  if (!(await tableExists(db, "products"))) return;

  const rows = (await db
    .prepare(
      `SELECT DISTINCT p.subcategory AS name, p.category_slug AS category_slug
       FROM products p
       WHERE p.subcategory IS NOT NULL
         AND TRIM(p.subcategory) != ''
         AND p.category_slug IS NOT NULL`
    )
    .all()) as { name: string; category_slug: string }[];

  const insert = db.prepare(
    "INSERT INTO subcategories (slug, category_slug, name, position) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING"
  );
  const taken = new Set<string>(
    (
      (await db.prepare("SELECT slug FROM subcategories").all()) as {
        slug: string;
      }[]
    ).map((r) => r.slug)
  );

  // The subcategories that are already in the list, by category and name.
  // This runs every time the database is opened, so it has to be safe to
  // run again and again.
  const known = new Set(
    (
      (
        await db
          .prepare("SELECT category_slug, name FROM subcategories")
          .all()
      ) as { category_slug: string; name: string }[]
    ).map((r) => `${r.category_slug}::${r.name.trim().toLowerCase()}`)
  );

  let position = 0;
  for (const r of rows) {
    const name = r.name.trim();
    const key = `${r.category_slug}::${name.toLowerCase()}`;
    if (known.has(key)) continue;

    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) continue;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${slug}-${n}`;
      n++;
    }
    taken.add(slug);
    known.add(key);
    await insert.run(slug, r.category_slug, name, position);
    position++;
  }
}

/**
 * Gives every option its own code.
 *
 * An option's code is the product's code and the option's own values, so
 * two options of the same product never look alike. A collision is
 * resolved with a numeric suffix rather than being allowed to fail.
 */
async function backfillVariantSkus(db: Db): Promise<void> {
  if (!(await tableExists(db, "variants"))) return;
  if (!(await tableExists(db, "products"))) return;
  if (!(await hasColumn(db, "variants", "sku"))) return;

  const taken = new Set<string>();
  for (const r of (await db
    .prepare("SELECT sku FROM products WHERE sku IS NOT NULL")
    .all()) as { sku: string }[]) {
    taken.add(r.sku);
  }
  for (const r of (await db
    .prepare("SELECT sku FROM variants WHERE sku IS NOT NULL")
    .all()) as { sku: string }[]) {
    taken.add(r.sku);
  }

  const rows = (await db
    .prepare("SELECT id, product_slug, name, sku FROM variants")
    .all()) as {
    id: string;
    product_slug: string;
    name: string;
    sku: string | null;
  }[];

  const update = db.prepare("UPDATE variants SET sku = ? WHERE id = ?");
  for (const r of rows) {
    if (r.sku) continue;
    const base = skuFromSlug(`${r.product_slug}-${r.name}`);
    const sku = (await uniqueSku(base, (candidate) => taken.has(candidate)));
    taken.add(sku);
    await update.run(sku, r.id);
  }
}

/**
 * Points an order line at the option it was bought in.
 *
 * The lines written before the option was recorded only carried its name,
 * so the option is found by that name. A line for a product with no
 * options has no name to match and is left alone.
 */
async function backfillOrderVariantIds(db: Db): Promise<void> {
  if (!(await tableExists(db, "order_items"))) return;
  if (!(await tableExists(db, "variants"))) return;
  if (!(await hasColumn(db, "order_items", "variant_id"))) return;

  await db.exec(`
    UPDATE order_items
    SET variant_id = (
      SELECT v.id FROM variants v
      WHERE v.product_slug = order_items.product_slug
        AND v.name = order_items.variant_name
    )
    WHERE variant_id IS NULL
      AND variant_name IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM variants v
        WHERE v.product_slug = order_items.product_slug
          AND v.name = order_items.variant_name
      )
  `);
}

/**
 * The gallery a product already had.
 *
 * The photographs used to live in the code, as a map of the two consoles
 * with a full set of angles. They are moved into the database here so the
 * back office can reorder and add to them like any other picture, and so
 * there is one place a product's pictures live rather than two.
 */
export async function seedProductImages(db: Db): Promise<void> {
  if (!(await tableExists(db, "products"))) return;

  const products = (await db
    .prepare("SELECT slug, name, image FROM products")
    .all()) as { slug: string; name: string; image: string | null }[];

  const insert = db.prepare(
    `INSERT INTO product_images (id, product_slug, path, alt, position)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`
  );

  for (const p of products) {
    const existing = (await db
      .prepare("SELECT COUNT(*) n FROM product_images WHERE product_slug = ?")
      .get(p.slug)) as { n: number };
    if (existing.n > 0) continue;

    const gallery = PRODUCT_GALLERY[p.slug];
    if (gallery?.length) {
      for (const [i, img] of gallery.entries()) {
        await insert.run(`${p.slug}::${i}`, p.slug, img.src, img.alt, i);
      }
      continue;
    }

    if (p.image) {
      await insert.run(`${p.slug}::0`, p.slug, p.image, p.name, 0);
    }
  }
}

/**
 * Give every product a SKU.
 *
 * Products that already have one keep it. The rest get one generated from
 * their slug, and because slugs can normalise to the same code — two
 * different slugs differing only in punctuation, say — a collision is
 * resolved with a numeric suffix rather than being allowed to fail.
 */
async function backfillProductSkus(db: Db): Promise<void> {
  if (!(await tableExists(db, "products"))) return;
  if (!(await hasColumn(db, "products", "sku"))) return;

  const rows = (await db
    .prepare("SELECT slug, sku FROM products")
    .all()) as { slug: string; sku: string | null }[];

  // Reserve every SKU that is already spoken for before handing out new ones.
  const taken = new Set<string>();
  for (const r of rows) {
    if (r.sku) taken.add(r.sku);
  }

  const update = db.prepare("UPDATE products SET sku = ? WHERE slug = ?");
  for (const r of rows) {
    if (r.sku) continue;
    const sku = (await uniqueSku(skuFromSlug(r.slug), (s) => taken.has(s)));
    taken.add(sku);
    await update.run(sku, r.slug);
  }
}
