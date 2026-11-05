import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { SCHEMA_SQL } from "./schema";
import { applyMigrations } from "./migrations";

declare global {
  // eslint-disable-next-line no-var
  var __pfDb: DatabaseSync | undefined;
}

/**
 * Whether the app is running somewhere each instance gets its own copy of
 * the database — a serverless host, where the scratch directory belongs to
 * one instance alone.
 */
export function isServerless(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith("/var/task")
  );
}

/**
 * Whether the database this instance is using is one only this instance can
 * see. True on a serverless host with no configured path; false everywhere
 * else, and false when DATABASE_PATH points at a file the instances share.
 */
export function usesPrivateDatabaseCopy(): boolean {
  return isServerless() && !process.env.DATABASE_PATH;
}

function resolveDbPath(): string {
  // A database path can be set outright. This is the way to give a
  // serverless deployment somewhere shared to keep its data: every instance
  // then reads and writes the same file, and nothing is lost when a request
  // lands on another instance.
  const configured = process.env.DATABASE_PATH;
  if (configured) return configured;

  const defaultDir = join(process.cwd(), "data");
  if (!existsSync(defaultDir)) {
    try {
      mkdirSync(defaultDir, { recursive: true });
    } catch {
      // directory creation handled by OS or exists
    }
  }
  const localDb = join(defaultDir, "store.db");

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

    // Each instance has its own scratch directory, so each one works on its
    // own private copy of the database. Sign-ins and baskets survive the
    // switch because the cookie carries its own proof, but anything the
    // shop writes while it is running — an order, a customer's message, a
    // change to the catalogue — exists on that one instance and is gone
    // when it recycles.
    console.warn(
      "\n" +
        "  This deployment is running serverless, so the store's database is\n" +
        "  a private copy in the scratch directory. Anything written while it\n" +
        "  runs — orders, enquiries, catalogue edits — is lost when the\n" +
        "  instance is recycled.\n" +
        "  Set DATABASE_PATH to a file every instance shares to keep it.\n"
    );

    return existsSync(tmpDb) ? tmpDb : (existsSync(bundledDb) ? bundledDb : tmpDb);
  }

  return localDb;
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
      // Fold the write-ahead log into the database file itself, and often.
      //
      // The store's database is tracked in git, so a change that is still
      // sitting in the log is a change that never reaches the repository —
      // and a deployment built from the repository never sees it either.
      // Checkpointing after every page keeps the file itself current, which
      // is what makes "I pushed it and nothing changed" impossible.
      db.exec("PRAGMA wal_autocheckpoint = 16;");
    } catch (e) {
      console.warn("Database initialization notice:", e);
    }
    globalThis.__pfDb = db;
  }
  return globalThis.__pfDb;
}

/**
 * Folds the write-ahead log into the database file and empties it.
 *
 * Worth calling before committing, so the file in the repository is the
 * database as it stands rather than the database as it stood before the last
 * few edits.
 */
export function checkpointDb(): void {
  try {
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (e) {
    console.warn("Could not checkpoint the database:", e);
  }
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
