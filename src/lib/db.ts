import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { SCHEMA_SQL } from "./schema";
import { applyMigrations } from "./migrations";

declare global {
  // eslint-disable-next-line no-var
  var __pfDb: DatabaseSync | undefined;
}

function resolveDbPath(): string {
  // In serverless environments (e.g. Vercel, AWS Lambda), the deployment directory is read-only.
  // The only writable scratch path is /tmp.
  const isServerless =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith("/var/task");

  if (isServerless) {
    const tmpDb = "/tmp/store.db";
    const bundledDb = join(process.cwd(), "data", "store.db");

    if (!existsSync(tmpDb) && existsSync(bundledDb)) {
      try {
        copyFileSync(bundledDb, tmpDb);
      } catch (err) {
        console.error("Failed to copy bundled store.db to /tmp:", err);
      }
    }
    return existsSync(tmpDb) ? tmpDb : (existsSync(bundledDb) ? bundledDb : tmpDb);
  }

  const defaultDir = join(process.cwd(), "data");
  if (!existsSync(defaultDir)) {
    try {
      mkdirSync(defaultDir, { recursive: true });
    } catch {
      // directory creation handled by OS or exists
    }
  }
  return join(defaultDir, "store.db");
}

export function getDb(): DatabaseSync {
  if (!globalThis.__pfDb) {
    const dbPath = resolveDbPath();
    const db = new DatabaseSync(dbPath);
    // Columns added since the schema was first written. This runs before
    // SCHEMA_SQL, because the schema's indexes reference the new columns and
    // an existing table does not have them yet.
    try {
      applyMigrations(db);
      db.exec(SCHEMA_SQL);
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA busy_timeout = 5000;");
    } catch (e) {
      console.warn("Database initialization notice:", e);
    }
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
