/**
 * Moves the shop's data from the SQLite file into PostgreSQL.
 *
 * The shop kept its data in a SQLite file in the repository until it was
 * moved to PostgreSQL, which is the only way a shop can be run at more
 * than one place: a SQLite file is one file, and every instance that
 * serves the shop needs to be looking at the same one.
 *
 * This reads the SQLite file and writes the same rows into PostgreSQL.
 * It is safe to run again: the tables are emptied first, so running it
 * twice leaves the same data rather than two copies of it.
 *
 *   node scripts/migrate-to-postgres.mjs
 *
 * DATABASE_URL must point at the PostgreSQL database. The SQLite file is
 * read from data/store.db unless SQLITE_PATH says otherwise.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { SCHEMA_SQL } from "../src/lib/schema.ts";
import "./lib/env.mjs";
import { databaseUrl, sslOption } from "../src/lib/database-url.ts";
import { toPostgres } from "../src/lib/db.ts";
import { applyMigrations } from "../src/lib/migrations.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const sqlitePath = process.env.SQLITE_PATH ?? join(ROOT, "data", "store.db");
const url = databaseUrl();

/**
 * The tables, in the order they have to be written.
 *
 * A row may point at a row in another table — an order points at a
 * customer, a line points at an order — so the ones that are pointed at
 * are written first.
 */
const TABLES = [
  "categories",
  "subcategories",
  "brands",
  "products",
  "product_images",
  "variants",
  "store_settings",
  "hero_slides",
  "users",
  "sessions",
  "cart_items",
  "addresses",
  "orders",
  "order_items",
  "inventory_movements",
  "contact_messages",
  "return_requests",
  "return_items",
  "return_images",
  "return_events",
  "order_cancellations",
];

/**
 * The tables whose rows are written with their own id.
 *
 * The rest are given their id by the database, in the order the rows
 * arrive, which is the order they arrive in.
 *
 * A table is on this list when its id is part of how the shop refers to
 * a row. Four of them carry a text id — the id of a picture, of an
 * option, of a claim, of a cancellation — and that id is the primary key,
 * so it has to travel with the row. Two of them carry a number that other
 * tables point at: a person, and a line on an order. Those numbers have
 * to travel too, or the rows pointing at them end up pointing at the
 * wrong thing.
 */
const KEEPING_ID = new Set([
  "categories",
  "subcategories",
  "brands",
  "products",
  "product_images",
  "variants",
  "store_settings",
  "hero_slides",
  "users",
  "sessions",
  "cart_items",
  "addresses",
  "orders",
  "order_items",
  "inventory_movements",
  "contact_messages",
  "return_requests",
  "return_items",
  "return_images",
  "return_events",
  "order_cancellations",
]);

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const pool = new Pool({ connectionString: url, ssl: sslOption(url) });

/** The tables that are in the file being read. */
const tables = new Set(
  sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name)
);

console.log(`→ reading ${sqlitePath}`);
console.log(`→ writing ${url.replace(/:[^:@/]*@/, ":***@")}\n`);

/**
 * The shop's handle on the database, bound to this one connection.
 *
 * The migrations are written against the same handle the shop itself
 * uses, so they run over PostgreSQL exactly as they run over SQLite.
 */
function dbOn(client) {
  return {
    dialect: "postgres",
    isTransaction: false,
    prepare(sql) {
      const text = toPostgres(sql);
      return {
        all: async (...params) => (await client.query(text, params)).rows,
        get: async (...params) => (await client.query(text, params)).rows[0],
        run: async (...params) => {
          const result = await client.query(text, params);
          return { changes: result.rowCount ?? 0, lastInsertRowid: undefined };
        },
      };
    },
    exec: async (sql) => {
      await client.query(toPostgres(sql));
    },
  };
}

const client = await pool.connect();
try {
  // The schema first, so the tables the data goes into are there.
  await client.query(SCHEMA_SQL);

  for (const table of TABLES) {
    if (!tables.has(table)) {
      console.log(`   – ${table}: not in the file, skipped`);
      continue;
    }

    const columns = sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name);
    if (!columns.length) continue;

    const rows = sqlite
      .prepare(`SELECT * FROM ${table}`)
      .all();

    if (!rows.length) {
      console.log(`   – ${table}: empty`);
      continue;
    }

    // The table is emptied first, so running the script again replaces the
    // data rather than doubling it.
    await client.query(`TRUNCATE TABLE ${table} CASCADE`);

    const keepId = KEEPING_ID.has(table);
    const names = keepId ? columns : columns.filter((c) => c !== "id");
    const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
    const statement = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = names.map((name) => {
        const value = row[name];
        return value === undefined ? null : value;
      });
      await client.query(statement, values);
    }

    console.log(`   ✓ ${table}: ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }

  // The sequences the identity columns use are left behind by a truncate
  // on some versions of PostgreSQL, so they are put back in step with
  // the rows that are there.
  console.log("\n→ putting the id sequences back in step");
  for (const table of TABLES) {
    if (!tables.has(table)) continue;
    const columns = sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .filter((c) => c.pk === 1 && c.name === "id");
    if (!columns.length) continue;

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1)
      )
    `).catch(() => {
      // A table whose id is not a sequence — a text id, say — has
      // nothing to put back in step.
    });
  }

  // The migrations run behind the copy, the same way they run when the
  // shop opens the SQLite file. They add the columns that came after the
  // schema was first written and fill in what the shop would otherwise
  // fill in itself: a code for every product and every option, a brand
  // list, a subcategory list, and a picture for every product.
  console.log("\n→ bringing the PostgreSQL database up to date");
  await applyMigrations(dbOn(client));
} finally {
  client.release();
  await pool.end();
  sqlite.close();
}

console.log("\n✓ the shop's data is in PostgreSQL");
console.log("  the SQLite file has not been touched — delete it when you are happy");
