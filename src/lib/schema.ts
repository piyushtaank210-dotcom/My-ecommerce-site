/**
 * Single source of truth for the database schema.
 * Imported by both the Next.js app (src/lib/db.ts) and the seed script (scripts/seed.mjs).
 *
 * The shop's timestamps are kept as text rather than as dates. They are
 * written in one format — UTC, ISO 8601, to the millisecond — so they
 * sort as they are, they read the same way on every page, and the code
 * that compares them keeps working the way it always has.
 *
 * The schema is written once and built for whichever database the shop
 * is on. PostgreSQL is where the shop's data belongs — one database that
 * every instance shares — and the SQLite file is what the shop kept its
 * data in before, and is still what a machine with no PostgreSQL to point
 * at uses. Only three things differ between them, and they are all
 * spelled out here.
 */

/** The database the shop is running on. */
export type Dialect = "postgres" | "sqlite";

/**
 * The tables the returns system added after the first version.
 *
 * They are kept apart from the main schema so that a migration can
 * create them on a database written before they existed, without
 * running the whole schema over again. Every statement in here is
 * written so that running it twice changes nothing.
 */
export function returnsSchemaSql(identity: string, now: string): string {
  return `-- A refund, on its own row.
--
-- The request keeps a summary of the refund so a list can be drawn
-- without a join, but the refund itself is a record: what was owed, to
-- whom, which method it went back by, which transaction carried it, who
-- approved it and when. A refund is not a refund until the payment is
-- confirmed, so the row carries the dates of both the decision and the
-- money moving.
CREATE TABLE IF NOT EXISTS return_refunds (
  id                    TEXT PRIMARY KEY,
  return_id             TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_id              TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- How much is going back, in paise.
  amount                INTEGER NOT NULL,
  -- The method the money went back by.
  payment_method        TEXT,
  -- The gateway's own reference for the payment.
  gateway_transaction_id TEXT,
  -- 'approved', 'processing', 'completed' or 'failed'.
  status                TEXT NOT NULL DEFAULT 'approved',
  -- Who decided to refund it.
  approved_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name      TEXT,
  approved_at           TEXT NOT NULL,
  -- When the refund was put in front of the payment provider.
  initiated_at          TEXT,
  -- When the money actually reached the customer.
  completed_at          TEXT,
  -- Why a refund failed, when it did.
  failed_reason         TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL ${now},
  updated_at            TEXT NOT NULL ${now}
);

-- A replacement, on its own row.
--
-- The serial number of the unit that came back, the serial number of the
-- unit that goes out, the courier, the tracking number and where the
-- parcel has got to. A replacement is a delivery, so it is tracked like
-- one.
CREATE TABLE IF NOT EXISTS return_replacements (
  id                    TEXT PRIMARY KEY,
  return_id             TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_id              TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- 'replacement' for a new unit, 'accessories' for the parts that
  -- were missing from the box.
  kind                  TEXT NOT NULL DEFAULT 'replacement',
  -- The serial of the unit that came back.
  original_serial       TEXT,
  -- The serial of the unit that goes out, when it is known.
  replacement_serial    TEXT,
  product_slug          TEXT,
  variant_id            TEXT,
  quantity              INTEGER NOT NULL DEFAULT 1,
  -- The shipment reference the shop gave the parcel.
  shipment_ref          TEXT,
  courier_name          TEXT,
  tracking_number       TEXT,
  dispatch_date         TEXT,
  delivery_status       TEXT NOT NULL DEFAULT 'dispatched',
  delivered_at          TEXT,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name       TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL ${now},
  updated_at            TEXT NOT NULL ${now}
);

-- An inspection of a unit that came back.
--
-- The inspection is its own record because the physical check is a fact
-- of its own: when it happened, who did it, what they found, and which
-- serial number was on the unit in front of them.
CREATE TABLE IF NOT EXISTS return_inspections (
  id                TEXT PRIMARY KEY,
  return_id         TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  inspected_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  inspected_by_name TEXT,
  -- 'passed' or 'failed'.
  result            TEXT NOT NULL,
  -- The serial number read off the unit that was inspected.
  serial_seen       TEXT,
  -- The condition the unit was found in.
  condition_notes   TEXT,
  notes             TEXT,
  inspected_at      TEXT NOT NULL,
  created_at        TEXT NOT NULL ${now}
);

-- The audit log of the back office.
--
-- Every decision, every note, every button a member of staff pressed on
-- a request. It is separate from the request's own history because it
-- answers a different question: not "where is this case" but "who did
-- what, and when".
CREATE TABLE IF NOT EXISTS admin_actions (
  id           ${identity},
  return_id    TEXT REFERENCES return_requests(id) ON DELETE CASCADE,
  -- What was done: 'approve', 'reject', 'request_evidence',
  -- 'schedule_pickup', 'mark_received', 'inspect', 'approve_refund',
  -- 'process_refund', 'complete_refund', 'dispatch_replacement',
  -- 'add_note' and so on.
  action       TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name   TEXT,
  actor_role   TEXT,
  from_status  TEXT,
  to_status    TEXT,
  note         TEXT,
  -- Anything else worth keeping, written as JSON.
  metadata     TEXT,
  created_at   TEXT NOT NULL ${now}
);

-- What the shop told the customer, and what the customer was told.
--
-- A row is a message. It is the customer's record of every change to
-- their case, and it is where an email that could not be sent is kept,
-- so that nothing is silently lost.
CREATE TABLE IF NOT EXISTS notifications (
  id          ${identity},
  -- 'customer' or 'admin'.
  audience    TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- The customer's address, for a guest order or an email.
  email       TEXT,
  return_id   TEXT REFERENCES return_requests(id) ON DELETE CASCADE,
  -- 'in_app' or 'email'.
  channel     TEXT NOT NULL DEFAULT 'in_app',
  -- What the message is about: 'submitted', 'under_review',
  -- 'evidence_required', 'approved', 'rejected', 'pickup_scheduled',
  -- 'received', 'inspected', 'replacement_dispatched', 'refund_approved',
  -- 'refund_completed', 'resolved'.
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  -- 'unread', 'read', 'sent', 'not_configured' or 'failed'.
  status      TEXT NOT NULL DEFAULT 'unread',
  -- What makes this message unique. The same change never sends the
  -- same message twice.
  dedupe_key  TEXT UNIQUE,
  read_at     TEXT,
  sent_at     TEXT,
  created_at  TEXT NOT NULL ${now}
);

-- A file that has been sent but not yet attached to a request.
--
-- The customer picks their evidence and it is sent straight away, so
-- that they can be shown how each file is getting on. The file waits
-- here until the request is submitted, and is then moved onto the
-- request it belongs to.
CREATE TABLE IF NOT EXISTS return_uploads (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  stored_name  TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'photo',
  evidence_kind TEXT NOT NULL DEFAULT 'other',
  mime_type    TEXT,
  size_bytes   INTEGER,
  original_name TEXT,
  sha256       TEXT,
  -- The request the file was eventually attached to.
  return_id    TEXT REFERENCES return_requests(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL ${now}
);

CREATE INDEX IF NOT EXISTS idx_return_uploads_user ON return_uploads(user_id);
`;
}

/**
 * The schema, built for one database or the other.
 */
export function schemaSql(dialect: Dialect = "postgres"): string {
  // A row that numbers itself. SQLite does it with a rowid; PostgreSQL
  // needs to be told.
  //
  // The number is the row's primary key, so the row can be pointed at:
  // an order points at a customer, a line points at an order. PostgreSQL
  // will not accept a foreign key to a column that is not unique, and an
  // identity column on its own is only guaranteed by the sequence that
  // hands out the numbers — so the key is stated.
  const identity =
    dialect === "postgres"
      ? "INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY"
      : "INTEGER PRIMARY KEY AUTOINCREMENT";

  // The shop's clock. PostgreSQL's own timestamp format does not read the
  // same way on every machine, so the shop writes its own: UTC, ISO 8601,
  // to the millisecond.
  const clock =
    dialect === "postgres"
      ? `CREATE OR REPLACE FUNCTION shop_now() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;`
      : "";

  const now =
    dialect === "postgres" ? "DEFAULT shop_now()" : "DEFAULT (datetime('now'))";

  return `
${clock}
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
  video_poster    TEXT,
  mobile_image    TEXT,
  mobile_alt      TEXT,
  mobile_position TEXT DEFAULT '50% 50%',
  mobile_video    TEXT,
  mobile_video_poster TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            ${identity},
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    TEXT NOT NULL ${now}
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id           ${identity},
  session_id   TEXT NOT NULL,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  variant_id   TEXT REFERENCES variants(id) ON DELETE SET NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL ${now}
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL ${now},
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
  id           ${identity},
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  variant_id   TEXT,
  variant_name TEXT,
  name         TEXT NOT NULL,
  price        INTEGER NOT NULL,
  quantity     INTEGER NOT NULL,
  stock_state  TEXT NOT NULL DEFAULT 'settled',
  stock_state_note TEXT,
  backordered  INTEGER NOT NULL DEFAULT 0,
  -- The serial number of the unit that was sent, read off it before it
  -- was packed. It is what a claim is matched against, so it is worth
  -- having before the customer has anything to complain about.
  serial_number TEXT,
  -- The condition of the unit and its packaging before it went out,
  -- written as JSON: an array of paths.
  pre_dispatch_photos TEXT
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
  id                ${identity},
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
  created_at        TEXT NOT NULL ${now}
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         ${identity},
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  order_id   TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at TEXT,
  created_at TEXT NOT NULL ${now}
);

CREATE TABLE IF NOT EXISTS addresses (
  id         ${identity},
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
  created_at TEXT NOT NULL ${now}
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
  replacement_product_slug TEXT,
  replacement_variant_id TEXT,
  replacement_dispatch_date TEXT,
  replacement_delivery_status TEXT,
  replacement_delivered_at TEXT,
  -- The serial number of the unit that came back, as the customer reads it
  -- off the product. It is what a replacement is matched against.
  serial_number      TEXT,
  -- Whether the customer says the unit is still sealed: 'sealed',
  -- 'opened', or NULL where the claim does not depend on it.
  sealed_state       TEXT,
  -- What the customer says is missing from the box.
  missing_accessories TEXT,
  -- Where the missing accessories went, when we sent them.
  accessories_courier TEXT,
  accessories_tracking TEXT,
  accessories_dispatched_at TEXT,
  -- The day the parcel arrived. The claim is judged against this, and it
  -- is kept on the request so the record does not change if the order is
  -- edited later.
  delivery_date TEXT,
  -- Who the claim was made by. It is copied onto the request at the
  -- moment of submission, so the back office always sees the customer
  -- the claim was actually made by.
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  -- The customer's explanation for evidence they could not send. A claim
  -- is never refused for the want of a photograph, so this is recorded
  -- rather than treated as a condition.
  evidence_excused TEXT,
  -- When the case was closed out.
  resolved_at TEXT,
  created_at           TEXT NOT NULL ${now},
  updated_at           TEXT NOT NULL ${now}
);

CREATE TABLE IF NOT EXISTS return_items (
  id            ${identity},
  return_id     TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  product_slug  TEXT NOT NULL,
  variant_id    TEXT,
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,
  quantity      INTEGER NOT NULL,
  reason_detail TEXT,
  qc_decision   TEXT NOT NULL DEFAULT 'pending',
  replacement_product_slug TEXT,
  replacement_variant_id TEXT,
  replacement_quantity INTEGER
);

CREATE TABLE IF NOT EXISTS return_images (
  id         ${identity},
  return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  caption    TEXT,
  -- Whether this file is a photograph or a video: 'photo' or 'video'.
  -- A photograph is a still of something; an unboxing video is a
  -- continuous take of the box being opened.
  kind       TEXT NOT NULL DEFAULT 'photo',
  -- What the file is evidence of: 'product', 'package', 'serial',
  -- 'unboxing' or 'other'. It is what the customer chose when they sent
  -- it, and it is what the back office sorts by.
  evidence_kind TEXT NOT NULL DEFAULT 'other',
  -- The name of the file in the private evidence store. Evidence is not
  -- served from the public folder, so it is fetched through a route that
  -- checks who is asking.
  stored_name TEXT,
  -- What the file really is, as far as the shop can tell: its own
  -- reading of the bytes, not the name the browser sent.
  mime_type TEXT,
  -- How big the file is, in bytes.
  size_bytes INTEGER,
  -- The name the file arrived with, so the customer recognises it.
  original_name TEXT,
  -- Which round of evidence this is. The first round is 1; evidence
  -- sent after the back office asked for more is 2, and so on. Earlier
  -- rounds are kept, never replaced.
  version INTEGER NOT NULL DEFAULT 1,
  -- Whether a later round of evidence has replaced this one. The row is
  -- kept either way — the record of what was sent and when is the point.
  superseded INTEGER NOT NULL DEFAULT 0,
  -- Who sent it: 'customer' or 'staff'.
  uploaded_by_type TEXT NOT NULL DEFAULT 'customer',
  uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- A fingerprint of the bytes, so the same file cannot be filed twice.
  sha256 TEXT,
  -- The customer's note about this file, and the reason they gave for
  -- any evidence they could not send.
  note TEXT,
  created_at TEXT NOT NULL ${now}
);

-- A request to cancel an order.
--
-- Cancellation is its own thing and not a return: an order that has not
-- left the warehouse is cancelled, and an order that has been delivered
-- is dealt with under the return rules. The request is kept so that the
-- decision, the reason and the money are all on the record.
CREATE TABLE IF NOT EXISTS order_cancellations (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Whether the order had left the warehouse when the request was made.
  dispatch_state   TEXT NOT NULL DEFAULT 'before_dispatch',
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'requested',
  admin_notes      TEXT,
  rejection_reason TEXT,
  refund_amount    INTEGER NOT NULL DEFAULT 0,
  refund_status    TEXT NOT NULL DEFAULT 'none',
  refund_reference TEXT,
  decided_at       TEXT,
  created_at       TEXT NOT NULL ${now},
  updated_at       TEXT NOT NULL ${now}
);

CREATE INDEX IF NOT EXISTS idx_cancellations_order ON order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_status ON order_cancellations(status);

CREATE TABLE IF NOT EXISTS return_events (
  id         ${identity},
  return_id  TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  -- The status the request was in before this change, and the one it is
  -- in now. It is what makes a timeline readable and what lets the back
  -- office be asked "who moved this, and from where".
  from_status TEXT,
  to_status   TEXT,
  actor_type TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  note       TEXT,
  created_at TEXT NOT NULL ${now}
);

${returnsSchemaSql(identity, now)}
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
CREATE INDEX IF NOT EXISTS idx_refunds_return       ON return_refunds(return_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order        ON return_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status       ON return_refunds(status);
CREATE INDEX IF NOT EXISTS idx_replacements_return  ON return_replacements(return_id);
CREATE INDEX IF NOT EXISTS idx_replacements_order   ON return_replacements(order_id);
CREATE INDEX IF NOT EXISTS idx_inspections_return   ON return_inspections(return_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_return ON admin_actions(return_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON admin_actions(action);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_return ON notifications(return_id);



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
}

/**
 * The schema for PostgreSQL, which is where the shop's data belongs.
 */
export const SCHEMA_SQL = schemaSql("postgres");

/**
 * The schema for the SQLite file, which is what a machine with no
 * PostgreSQL to point at uses.
 */
export const SCHEMA_SQL_SQLITE = schemaSql("sqlite");
