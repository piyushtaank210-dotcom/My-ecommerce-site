import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema";
import { applyMigrations } from "./migrations";

const DB_PATH = join(process.cwd(), "data", "store.db");

declare global {
  // eslint-disable-next-line no-var
  var __pfDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__pfDb) {
    const db = new DatabaseSync(DB_PATH);
    // Columns added since the schema was first written. This runs before
    // SCHEMA_SQL, because the schema's indexes reference the new columns and
    // an existing table does not have them yet.
    applyMigrations(db);
    db.exec(SCHEMA_SQL);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    globalThis.__pfDb = db;
  }
  return globalThis.__pfDb;
}

/** Rows are plain objects; JSON columns need parsing. */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
