-- PlayForge store schema (SQLite).
--
-- Generated from src/lib/schema.ts by scripts/write-schema.mjs, which is the
-- single source of truth. Edit that file, then run:
--
--   npm run schema
--
CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  blurb       TEXT,
  position    INTEGER DEFAULT 0
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
  condition        TEXT NOT NULL DEFAULT 'new',
  badge            TEXT,
  short_desc       TEXT,
  description      TEXT,
  specs            TEXT DEFAULT '{}',
  image            TEXT,
  image_alt        TEXT,
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
  price        INTEGER NOT NULL,
  mrp          INTEGER NOT NULL,
  stock        INTEGER DEFAULT 0,
  position     INTEGER DEFAULT 0
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
  position        INTEGER DEFAULT 0
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
  status         TEXT NOT NULL DEFAULT 'confirmed'
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  variant_name TEXT,
  name         TEXT NOT NULL,
  price        INTEGER NOT NULL,
  quantity     INTEGER NOT NULL
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
