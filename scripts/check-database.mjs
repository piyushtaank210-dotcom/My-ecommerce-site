/**
 * Checks that the shop's database is there and holds together.
 *
 * The shop's data lives in PostgreSQL, and every instance reads and writes
 * the same one. This asks the database whether it is reachable, whether
 * the rows that point at other rows still point at something, and what is
 * on it.
 *
 *   node scripts/check-database.mjs
 */
import "./lib/env.mjs";
import { databaseUrl, sslOption } from "../src/lib/database-url.ts";
import { Pool } from "pg";

const url = databaseUrl();
const pool = new Pool({ connectionString: url, ssl: sslOption(url) });
const client = await pool.connect();

/**
 * The checks that must hold. A number other than zero is a fault.
 */
const checks = [
  [
    "orders pointing at a customer that is not there",
    "SELECT COUNT(*) n FROM orders o WHERE o.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id)",
  ],
  [
    "order lines pointing at an order that is not there",
    "SELECT COUNT(*) n FROM order_items oi WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id)",
  ],
  [
    "cart lines pointing at an option that is not there",
    "SELECT COUNT(*) n FROM cart_items c WHERE c.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = c.variant_id)",
  ],
  [
    "stock movements pointing at an option that is not there",
    "SELECT COUNT(*) n FROM inventory_movements m WHERE m.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = m.variant_id)",
  ],
  [
    "stock movements pointing at a person that is not there",
    "SELECT COUNT(*) n FROM inventory_movements m WHERE m.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)",
  ],
  [
    "claims pointing at an order that is not there",
    "SELECT COUNT(*) n FROM return_requests r WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id)",
  ],
  [
    "claim lines pointing at a claim that is not there",
    "SELECT COUNT(*) n FROM return_items ri WHERE NOT EXISTS (SELECT 1 FROM return_requests r WHERE r.id = ri.return_id)",
  ],
  [
    "claim lines pointing at an order line that is not there",
    "SELECT COUNT(*) n FROM return_items ri WHERE ri.order_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = ri.order_item_id)",
  ],
  [
    "claim events pointing at a person that is not there",
    "SELECT COUNT(*) n FROM return_events e WHERE e.actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.actor_id)",
  ],
  [
    "sessions pointing at a person that is not there",
    "SELECT COUNT(*) n FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)",
  ],
  [
    "products with no code",
    "SELECT COUNT(*) n FROM products WHERE sku IS NULL OR sku = ''",
  ],
  [
    "options with no code",
    "SELECT COUNT(*) n FROM variants WHERE sku IS NULL OR sku = ''",
  ],
  [
    "products with no picture",
    "SELECT COUNT(*) n FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_slug = p.slug)",
  ],
];

/**
 * The counts worth knowing, which are not faults.
 */
const notes = [
  [
    "order lines pointing at an option that is no longer sold",
    "SELECT COUNT(*) n FROM order_items oi WHERE oi.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.id = oi.variant_id)",
  ],
];

console.log("\n=======================================================");
console.log("CONSOLESELLER DATABASE CHECK");
console.log("=======================================================\n");
console.log(`  database: ${url.replace(/:[^:@/]*@/, ":***@")}\n`);

let failures = 0;

console.log("1. Checking that the rows that point at other rows still do:");
for (const [label, sql] of checks) {
  const { rows } = await client.query(sql);
  const n = Number(rows[0].n);
  if (n !== 0) failures += 1;
  console.log(`  ${n === 0 ? "✓" : "✗"} ${label}: ${n}`);
}

console.log("\n2. What is on the database:");
for (const [label, sql] of [
  ["products", "SELECT COUNT(*) n FROM products"],
  ["brands", "SELECT COUNT(*) n FROM brands"],
  ["categories", "SELECT COUNT(*) n FROM categories"],
  ["hero slides", "SELECT COUNT(*) n FROM hero_slides"],
  ["hero slides with a film", "SELECT COUNT(*) n FROM hero_slides WHERE video IS NOT NULL"],
  ["users", "SELECT COUNT(*) n FROM users"],
  ["orders", "SELECT COUNT(*) n FROM orders"],
  ["stock movements", "SELECT COUNT(*) n FROM inventory_movements"],
  ["claims", "SELECT COUNT(*) n FROM return_requests"],
]) {
  const { rows } = await client.query(sql);
  console.log(`  – ${label}: ${rows[0].n}`);
}

console.log("\n3. Worth knowing:");
for (const [label, sql] of notes) {
  const { rows } = await client.query(sql);
  console.log(`  – ${label}: ${rows[0].n}`);
}

const { rows: settings } = await client.query(
  "SELECT key, value FROM store_settings ORDER BY key"
);
console.log("\n4. Settings:");
for (const s of settings) console.log(`  – ${s.key} = ${s.value}`);

client.release();
await pool.end();

console.log(
  failures === 0
    ? "\n✓ the shop's database is there and holds together"
    : `\n✗ ${failures} check(s) failed`
);
process.exit(failures === 0 ? 0 : 1);
