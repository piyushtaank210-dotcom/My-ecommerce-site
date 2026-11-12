import { registerTsResolver } from "./ts-loader.mjs";
import "./env.mjs";

// The app's modules import each other without their extensions, which
// plain Node cannot resolve. The hook adds them back.
registerTsResolver();

const { toPostgres } = await import("../../src/lib/db.ts");
const { shopDb } = await import("./session.mjs");

/**
 * A database handle for the scripts.
 *
 * It is the shop's own handle, with the shop's own translation from the
 * `?` placeholders the scripts write to the `$1` PostgreSQL wants. The
 * statements are promises, so they are waited for.
 */
const pool = shopDb();

export const db = {
  prepare(sql) {
    const text = toPostgres(sql);
    return {
      all: async (...params) => (await pool.query(text, params)).rows,
      get: async (...params) => (await pool.query(text, params)).rows[0],
      run: async (...params) => {
        const result = await pool.query(text, params);
        return { changes: result.rowCount ?? 0 };
      },
    };
  },
};

/** Closes the pool at the end of a run. */
export async function closeDb() {
  await pool.end();
}
