/**
 * Puts the historical return rows back.
 *
 * The shop's SQLite file holds the returns that were made before the
 * move to PostgreSQL, and the rows that were made there were carried
 * over by the migration. A cleanup that removed rows whose id began
 * with the old test prefix took those historical rows with it.
 *
 * This copies them back from the SQLite file into PostgreSQL, and
 * leaves alone anything that is already there.
 *
 *   node scripts/restore-historical-returns.mjs
 */
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

registerTsResolver();

const { getDb } = await import("../src/lib/db.ts");
const { applyMigrations } = await import("../src/lib/migrations.ts");
const { shopDb } = await import("./lib/session.mjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The id prefix the old check script gave the rows it made. */
const OLD_TEST_PREFIX = "RET-TEST%";

const sqlite = new DatabaseSync(join(ROOT, "data", "store.db"), { readOnly: true });
const db = getDb();
await applyMigrations(db);
const pool = shopDb();

/**
 * The columns that are common to the SQLite file and the shop's
 * PostgreSQL tables. A column the file does not have is left at its
 * default.
 */
const COMMON = {
  return_requests: [
    "id",
    "order_id",
    "user_id",
    "type",
    "status",
    "reason",
    "customer_notes",
    "admin_notes",
    "rejection_reason",
    "pickup_courier",
    "pickup_tracking",
    "pickup_date",
    "received_at",
    "qc_status",
    "qc_notes",
    "refund_amount",
    "refund_status",
    "refund_method",
    "refund_reference",
    "refund_processed_at",
    "replacement_order_id",
    "created_at",
    "updated_at",
    "replacement_courier",
    "replacement_tracking",
    "replacement_product_slug",
    "replacement_variant_id",
    "replacement_dispatch_date",
    "replacement_delivery_status",
    "replacement_delivered_at",
  ],
  return_events: [
    "id",
    "return_id",
    "status",
    "actor_type",
    "actor_id",
    "actor_name",
    "note",
    "created_at",
  ],
  return_items: [
    "id",
    "return_id",
    "order_item_id",
    "product_slug",
    "variant_id",
    "name",
    "price",
    "quantity",
    "reason_detail",
    "qc_decision",
    "replacement_product_slug",
    "replacement_variant_id",
    "replacement_quantity",
  ],
  return_images: [
    "id",
    "return_id",
    "path",
    "caption",
    "created_at",
  ],
};

let restored = 0;

for (const [table, columns] of Object.entries(COMMON)) {
  const where =
    table === "return_requests" ? "id LIKE ?" : "return_id LIKE ?";
  const rows = sqlite
    .prepare(`SELECT * FROM ${table} WHERE ${where}`)
    .all(OLD_TEST_PREFIX);

  if (!rows.length) {
    console.log(`· ${table}: nothing to put back`);
    continue;
  }

  const list = columns.join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  let put = 0;
  for (const row of rows) {
    const values = columns.map((c) => row[c] ?? null);
    const result = await pool.query(
      `INSERT INTO ${table} (${list}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updates}`,
      values
    );
    if (result.rowCount) put++;
  }

  console.log(`✓ ${table}: ${put} row(s) put back`);
  restored += put;
}

sqlite.close();
await pool.end();

console.log(`\n${restored} row(s) restored.`);
