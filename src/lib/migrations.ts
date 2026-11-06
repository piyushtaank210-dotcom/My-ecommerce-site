import type { DatabaseSync } from "node:sqlite";
// The extension matters: this file is imported by the seed script, which runs
// on plain Node rather than through Next's bundler, and Node will not guess
// that "./sku" means "./sku.ts".
import { skuFromSlug, uniqueSku } from "./sku.ts";
import { PRODUCT_GALLERY } from "./product-gallery.ts";

/** A number out of a row. */
const num = (v: unknown): number => Number(v ?? 0);

/**
 * Columns added since the schema was first written.
 *
 * SQLite's `CREATE TABLE IF NOT EXISTS` leaves an existing table exactly as
 * it was, so a fresh column has to be added with `ALTER TABLE`. Each one is
 * checked first, which makes this safe to run on every connection — it runs
 * once, when the database is first opened.
 */
export function applyMigrations(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  const has = (table: string, column: string): boolean =>
    tableExists(table) &&
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
      (c) => c.name === column
    );

  const add = (table: string, column: string, ddl: string): void => {
    if (has(table, column)) return;
    if (!tableExists(table)) return; // a fresh database gets it from SCHEMA_SQL
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
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
  // How many of the units the shopper ordered are not on the shelf. This is
  // only ever above zero when the store takes backorders.
  add("order_items", "backordered", "backordered INTEGER NOT NULL DEFAULT 0");

  // A product's variations are described by its attributes — "Colour",
  // "Storage", "Edition" — and each option carries its own code, photograph
  // and barcode.
  add("products", "attributes", "attributes TEXT DEFAULT '{}'");
  add("variants", "sku", "sku TEXT");
  add("variants", "image", "image TEXT");
  add("variants", "barcode", "barcode TEXT");
  add("variants", "attributes", "attributes TEXT DEFAULT '{}'");

  // What a category asks its products about.
  add("categories", "spec_fields", "spec_fields TEXT DEFAULT '[]'");
  add("orders", "delivered_at", "delivered_at TEXT");
  add("return_requests", "replacement_courier", "replacement_courier TEXT");
  add("return_requests", "replacement_tracking", "replacement_tracking TEXT");

  // The tables the backfills below need. They are also in the schema, for a
  // database built from scratch — but the migration runs before it, so an
  // existing database needs them here.
  db.exec(`CREATE TABLE IF NOT EXISTS subcategories (
    slug          TEXT PRIMARY KEY,
    category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    position      INTEGER DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS brands (
    slug     TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    blurb    TEXT,
    position INTEGER DEFAULT 0
  )`);

  // Returns, replacements and refunds
  db.exec(`CREATE TABLE IF NOT EXISTS return_requests (
    id                   TEXT PRIMARY KEY,
    order_id             TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type                 TEXT NOT NULL DEFAULT 'return',
    status               TEXT NOT NULL DEFAULT 'requested',
    reason               TEXT NOT NULL,
    customer_notes       TEXT,
    admin_notes          TEXT,
    rejection_reason     TEXT,
    pickup_courier       TEXT,
    pickup_tracking      TEXT,
    pickup_date          TEXT,
    received_at          TEXT,
    qc_status            TEXT NOT NULL DEFAULT 'pending',
    qc_notes             TEXT,
    refund_amount        INTEGER NOT NULL DEFAULT 0,
    refund_status        TEXT NOT NULL DEFAULT 'none',
    refund_method        TEXT,
    refund_reference     TEXT,
    refund_processed_at  TEXT,
    replacement_order_id TEXT,
    replacement_courier  TEXT,
    replacement_tracking TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS return_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id     TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
    product_slug  TEXT NOT NULL,
    variant_id    TEXT,
    name          TEXT NOT NULL,
    price         INTEGER NOT NULL,
    quantity      INTEGER NOT NULL,
    reason_detail TEXT,
    qc_decision   TEXT NOT NULL DEFAULT 'pending'
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS return_images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    caption    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS return_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_order ON return_requests(order_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_user ON return_requests(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_returns_status ON return_requests(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_return_images_return ON return_images(return_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_return_events_return ON return_events(return_id)`);

  backfillOrderVariantIds(db);
  backfillVariantSkus(db);
  backfillProductSkus(db);
  backfillBrands(db);
  backfillSubcategories(db);
  seedProductImages(db);
}

/**
 * The brands the store sells.
 *
 * The catalogue already names a brand on every product; this gathers those
 * names into a list the back office can manage. It records what is there —
 * it does not make a brand up.
 */
function backfillBrands(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  if (!tableExists("brands") || !tableExists("products")) return;

  const rows = db
    .prepare(
      `SELECT DISTINCT brand FROM products
       WHERE brand IS NOT NULL AND TRIM(brand) != ''
       ORDER BY brand COLLATE NOCASE`
    )
    .all() as { brand: string }[];

  // The brands that are already in the list, by name. A brand that is
  // already there is left alone — this runs every time the database is
  // opened, so it has to be safe to run again and again.
  const known = new Set(
    (db.prepare("SELECT name FROM brands").all() as { name: string }[]).map(
      (r) => r.name.trim().toLowerCase()
    )
  );

  const insert = db.prepare(
    "INSERT OR IGNORE INTO brands (slug, name, position) VALUES (?, ?, ?)"
  );
  const taken = new Set<string>(
    (db.prepare("SELECT slug FROM brands").all() as { slug: string }[]).map(
      (r) => r.slug
    )
  );

  let position = num(
    (
      db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM brands").get() as {
        n: number;
      }
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
    insert.run(slug, name, position);
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
function backfillSubcategories(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  if (!tableExists("subcategories") || !tableExists("products")) return;

  const rows = db
    .prepare(
      `SELECT DISTINCT p.subcategory AS name, p.category_slug AS category_slug
       FROM products p
       WHERE p.subcategory IS NOT NULL
         AND TRIM(p.subcategory) != ''
         AND p.category_slug IS NOT NULL`
    )
    .all() as { name: string; category_slug: string }[];

  const insert = db.prepare(
    "INSERT OR IGNORE INTO subcategories (slug, category_slug, name, position) VALUES (?, ?, ?, ?)"
  );
  const taken = new Set<string>(
    (
      db.prepare("SELECT slug FROM subcategories").all() as { slug: string }[]
    ).map((r) => r.slug)
  );

  // The subcategories that are already in the list, by category and name.
  // This runs every time the database is opened, so it has to be safe to
  // run again and again.
  const known = new Set(
    (
      db
        .prepare("SELECT category_slug, name FROM subcategories")
        .all() as { category_slug: string; name: string }[]
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
    insert.run(slug, r.category_slug, name, position);
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
function backfillVariantSkus(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  if (!tableExists("variants") || !tableExists("products")) return;

  const columns = (db.prepare("PRAGMA table_info(variants)").all() as {
    name: string;
  }[]).map((c) => c.name);
  if (!columns.includes("sku")) return;

  const taken = new Set<string>();
  for (const r of db
    .prepare("SELECT sku FROM products WHERE sku IS NOT NULL")
    .all() as { sku: string }[]) {
    taken.add(r.sku);
  }
  for (const r of db
    .prepare("SELECT sku FROM variants WHERE sku IS NOT NULL")
    .all() as { sku: string }[]) {
    taken.add(r.sku);
  }

  const rows = db
    .prepare("SELECT id, product_slug, name, sku FROM variants")
    .all() as {
    id: string;
    product_slug: string;
    name: string;
    sku: string | null;
  }[];

  const update = db.prepare("UPDATE variants SET sku = ? WHERE id = ?");
  for (const r of rows) {
    if (r.sku) continue;
    const base = skuFromSlug(`${r.product_slug}-${r.name}`);
    const sku = uniqueSku(base, (candidate) => taken.has(candidate));
    taken.add(sku);
    update.run(sku, r.id);
  }
}

/**
 * Points an order line at the option it was bought in.
 *
 * The lines written before the option was recorded only carried its name,
 * so the option is found by that name. A line for a product with no
 * options has no name to match and is left alone.
 */
function backfillOrderVariantIds(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  if (!tableExists("order_items") || !tableExists("variants")) return;

  const columns = (db.prepare("PRAGMA table_info(order_items)").all() as {
    name: string;
  }[]).map((c) => c.name);
  if (!columns.includes("variant_id")) return;

  db.exec(`
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
export function seedProductImages(db: DatabaseSync): void {
  // The table is also in the schema, for a database built from scratch. It
  // is created here too because the migration runs before the schema.
  db.exec(`CREATE TABLE IF NOT EXISTS product_images (
    id           TEXT PRIMARY KEY,
    product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
    path         TEXT NOT NULL,
    alt          TEXT,
    position     INTEGER DEFAULT 0
  )`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_product_images ON product_images(product_slug)"
  );

  const hasProducts = !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("products");
  if (!hasProducts) return;

  const products = db
    .prepare("SELECT slug, name, image FROM products")
    .all() as { slug: string; name: string; image: string | null }[];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO product_images (id, product_slug, path, alt, position)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const p of products) {
    const existing = db
      .prepare("SELECT COUNT(*) n FROM product_images WHERE product_slug = ?")
      .get(p.slug) as { n: number };
    if (existing.n > 0) continue;

    const gallery = PRODUCT_GALLERY[p.slug];
    if (gallery?.length) {
      gallery.forEach((img, i) => {
        insert.run(
          `${p.slug}::${i}`,
          p.slug,
          img.src,
          img.alt,
          i
        );
      });
      continue;
    }

    if (p.image) {
      insert.run(`${p.slug}::0`, p.slug, p.image, p.name, 0);
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
function backfillProductSkus(db: DatabaseSync): void {
  const tableExists = (table: string): boolean =>
    !!db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table);

  if (!tableExists("products")) return;

  const columns = (db.prepare("PRAGMA table_info(products)").all() as {
    name: string;
  }[]).map((c) => c.name);
  if (!columns.includes("sku")) return;

  const rows = db
    .prepare("SELECT slug, sku FROM products")
    .all() as { slug: string; sku: string | null }[];

  // Reserve every SKU that is already spoken for before handing out new ones.
  const taken = new Set<string>();
  for (const r of rows) {
    if (r.sku) taken.add(r.sku);
  }

  const update = db.prepare("UPDATE products SET sku = ? WHERE slug = ?");
  for (const r of rows) {
    if (r.sku) continue;
    const sku = uniqueSku(skuFromSlug(r.slug), (s) => taken.has(s));
    taken.add(sku);
    update.run(sku, r.slug);
  }
}
