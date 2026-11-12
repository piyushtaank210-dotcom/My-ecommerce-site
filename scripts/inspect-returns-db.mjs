/**
 * A quick look at what the returns tables hold right now.
 *
 *   node scripts/inspect-returns-db.mjs
 */
import "./lib/env.mjs";
import { databaseUrl, sslOption } from "../src/lib/database-url.ts";
import { Pool } from "pg";

const url = databaseUrl();
const pool = new Pool({ connectionString: url, ssl: sslOption(url) });
const client = await pool.connect();

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'return%'
    ORDER BY table_name`
);
console.log("return tables:", tables.rows.map((r) => r.table_name).join(", "));

for (const t of tables.rows.map((r) => r.table_name)) {
  const n = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  console.log(`  ${t}: ${n.rows[0].n} rows`);
}

const statuses = await client.query(
  `SELECT status, COUNT(*)::int AS n FROM return_requests GROUP BY status ORDER BY n DESC`
);
console.log("\nreturn_requests by status:", statuses.rows);

const images = await client.query(
  `SELECT id, return_id, path, kind FROM return_images ORDER BY id DESC LIMIT 10`
);
console.log("\nreturn_images sample:", images.rows);

const cols = await client.query(
  `SELECT table_name, column_name, data_type
     FROM information_schema.columns
    WHERE table_name IN ('return_requests','return_images','return_events')
    ORDER BY table_name, ordinal_position`
);
console.log("\ncolumns:");
for (const c of cols.rows) console.log(`  ${c.table_name}.${c.column_name} ${c.data_type}`);

const orders = await client.query(
  `SELECT COUNT(*)::int AS n, COUNT(delivered_at)::int AS delivered FROM orders`
);
console.log("\norders:", orders.rows);

await client.release();
await pool.end();
