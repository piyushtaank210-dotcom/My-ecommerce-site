/**
 * Brings a database's schema up to date, without touching the data.
 *
 * The shop's data lives in PostgreSQL, and the schema is written in
 * `src/lib/schema.ts`. This applies it: every table is created if it is
 * not already there, every column is added if it is missing, and the
 * backfills run. Nothing is dropped, emptied or rewritten.
 *
 *   node scripts/apply-schema.mjs
 *
 * It is safe to run as often as you like — running it twice changes
 * nothing the second time.
 */
import "./lib/env.mjs";
import { databaseUrl, sslOption } from "../src/lib/database-url.ts";
import { toPostgres } from "../src/lib/db.ts";
import { SCHEMA_SQL } from "../src/lib/schema.ts";
import { applyMigrations } from "../src/lib/migrations.ts";
import { Pool } from "pg";

const url = databaseUrl();
const pool = new Pool({ connectionString: url, ssl: sslOption(url) });
const client = await pool.connect();

/** The handle the migrations expect. */
function dbOn(connection) {
  return {
    dialect: "postgres",
    isTransaction: false,
    prepare(sql) {
      const text = toPostgres(sql);
      return {
        all: async (...params) => (await connection.query(text, params)).rows,
        get: async (...params) => (await connection.query(text, params)).rows[0],
        run: async (...params) => {
          const result = await connection.query(text, params);
          return { changes: result.rowCount ?? 0, lastInsertRowid: undefined };
        },
      };
    },
    exec: async (sql) => {
      await connection.query(toPostgres(sql));
    },
  };
}

try {
  // The schema first, so that anything the migrations add a column to is
  // already there.
  await client.query(SCHEMA_SQL);
  console.log("✓ schema applied");

  await applyMigrations(dbOn(client));
  console.log("✓ migrations applied");

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'return_requests','return_items','return_images','return_events',
          'return_refunds','return_replacements','return_inspections',
          'admin_actions','notifications')
      ORDER BY table_name`
  );
  console.log(
    "✓ returns tables:",
    tables.rows.map((r) => r.table_name).join(", ")
  );
} finally {
  client.release();
  await pool.end();
}
