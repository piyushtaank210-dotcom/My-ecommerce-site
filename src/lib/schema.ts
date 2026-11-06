/**
 * Single source of truth for the database schema.
 * Imported by both the Next.js app (src/lib/db.ts) and the seed script (scripts/seed.mjs).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  blurb       TEXT,
  spec_fields TEXT DEFAULT '[]',
  position    INTEGER DEFAULT 0
);

/**
 * The categories inside a category.
 *
 * A console might be "PS5" or "PS4"; a controller might be "DualSense" or
 * "Edge". Each one belongs to exactly one category, so the same name may
 * be used twice in the catalogue without the two colliding.
 */
CREATE TABLE IF NOT EXISTS subcategories (
  slug          TEXT PRIMARY KEY,
  category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  position      INTEGER DEFAULT 0
);

/**
 * The brands the store sells.
 *
 * A product names its brand, and the brand list is kept here so the back
 * office can manage it — rename a brand and the products that carry it
 * follow.
 */
CREATE TABLE IF NOT EXISTS brands (
  slug     TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  blurb    TEXT,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  slug             TEXT PRIMARY KEY,
  sku              TEXT,
  name             TEXT NOT NULL,
  brand            TEXT,
  category_slug    TEXT,
  subcategory      TEXT,
  model_number     TEXT,
  price            INTEGER NOT NULL,
  mrp              INTEGER NOT NULL,
  sale_price       INTEGER,
  purchase_cost    INTEGER,
  rating           REAL DEFAULT 0,
  reviews          INTEGER DEFAULT 0,
  stock            INTEGER DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  condition        TEXT NOT NULL DEFAULT 'new',
  badge            TEXT,
  short_desc       TEXT,
  description      TEXT,
  specs            TEXT DEFAULT '{}',
  image            TEXT,
  image_alt        TEXT,
  attributes       TEXT DEFAULT '{}',
  seo_title        TEXT,
  meta_description TEXT,
  weight_grams     INTEGER,
  package_length   INTEGER,
  package_width    INTEGER,
  package_height   INTEGER,
  warranty         TEXT,
  returns          TEXT,
  listed           INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'published',
  position         INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_images (
  id           TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  alt          TEXT,
  position     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variants (
  id           TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sku          TEXT,
  price        INTEGER NOT NULL,
  mrp          INTEGER NOT NULL,
  stock        INTEGER DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image        TEXT,
  barcode      TEXT,
  attributes   TEXT DEFAULT '{}',
  position     INTEGER DEFAULT 0
);

/**
 * The store's own settings, one row each.
 *
 * The backorder policy lives here: whether a shopper may buy something the
 * shelf does not have.
 */
CREATE TABLE IF NOT EXISTS store_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id              TEXT PRIMARY KEY,
  image           TEXT NOT NULL,
  alt             TEXT NOT NULL,
  image_position  TEXT DEFAULT '50% 50%',
  eyebrow         TEXT,
  title           TEXT NOT NULL,
  body            TEXT,
  primary_label   TEXT,
  primary_href    TEXT,
  secondary_label TEXT,
  secondary_href  TEXT,
  note            TEXT,
  side            TEXT NOT NULL DEFAULT 'left',
  position        INTEGER DEFAULT 0,
  video           TEXT,
  video_poster    TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  variant_id   TEXT REFERENCES variants(id) ON DELETE SET NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  address1       TEXT NOT NULL,
  address2       TEXT,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  pincode        TEXT NOT NULL,
  notes          TEXT,
  subtotal       INTEGER NOT NULL,
  shipping       INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmed',
  delivered_at   TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  variant_id   TEXT,
  variant_name TEXT,
  name         TEXT NOT NULL,
  price        INTEGER NOT NULL,
  quantity     INTEGER NOT NULL,
  stock_state  TEXT NOT NULL DEFAULT 'settled',
  stock_state_note TEXT,
  backordered  INTEGER NOT NULL DEFAULT 0
);

/**
 * Every change to a stock level, and why it was made.
 *
 * One row is one movement: what the stock was, what it became, and the
 * reason it moved. The row a sale writes is what makes the history
 * auditable — and the index below is what makes a sale impossible to
 * deduct twice for the same order.
 */
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_key         TEXT NOT NULL,
  product_slug      TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  variant_id        TEXT REFERENCES variants(id) ON DELETE SET NULL,
  previous_stock    INTEGER NOT NULL,
  quantity_changed  INTEGER NOT NULL,
  new_stock         INTEGER NOT NULL,
  movement_type     TEXT NOT NULL,
  reason            TEXT NOT NULL,
  note              TEXT,
  order_id          TEXT REFERENCES orders(id) ON DELETE SET NULL,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  order_id   TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'Home',
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address1   TEXT NOT NULL,
  address2   TEXT,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  pincode    TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS return_requests (
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
);

CREATE TABLE IF NOT EXISTS return_items (
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
);

CREATE TABLE IF NOT EXISTS return_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  caption    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS return_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_listed      ON products(listed);
CREATE INDEX IF NOT EXISTS idx_products_status      ON products(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku   ON products(sku);
CREATE INDEX IF NOT EXISTS idx_product_images       ON product_images(product_slug);
CREATE INDEX IF NOT EXISTS idx_cart_session         ON cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_variants_product     ON variants(product_slug);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user         ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user       ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_status      ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_variants_sku         ON variants(sku);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode) WHERE barcode IS NOT NULL AND barcode != '';
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_slug);
CREATE INDEX IF NOT EXISTS idx_brands_name          ON brands(name);
CREATE INDEX IF NOT EXISTS idx_inventory_product    ON inventory_movements(product_slug);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_key  ON inventory_movements(stock_key);
CREATE INDEX IF NOT EXISTS idx_inventory_created     ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_order      ON inventory_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_state    ON order_items(stock_state);
CREATE INDEX IF NOT EXISTS idx_returns_order        ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user         ON return_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_status       ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_items_return  ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_images_return ON return_images(return_id);
CREATE INDEX IF NOT EXISTS idx_return_events_return ON return_events(return_id);

/**
 * One sale per order per stock bucket.
 *
 * This is the last line of defence against a stock level being taken twice
 * for the same order: even if the code that writes the movement were run
 * again, the second write has nowhere to go. A restock is not covered —
 * an order can be cancelled, reopened and cancelled again, and each of
 * those is a real event that belongs in the history.
 */
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_one_sale
  ON inventory_movements(order_id, stock_key)
  WHERE movement_type = 'sale' AND order_id IS NOT NULL;
`;
