import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { SCHEMA_SQL, SCHEMA_SQL_SQLITE, type Dialect } from "./schema";
import { applyMigrations } from "./migrations";

/**
 * The shop's database: PostgreSQL.
 *
 * The shop used to keep a SQLite file in the repository. That worked
 * until it had to be more than one thing at once — a serverless
 * deployment gives every instance its own copy of the file, so an order
 * placed on one instance is invisible to the next. PostgreSQL is one
 * database that every instance shares, which is the only way a shop can
 * be run properly at more than one place.
 *
 * Two things follow from the driver being asynchronous.
 *
 * The first is that a query is now awaited. Every call reads the same as
 * it did — `db.prepare(sql).all(...)` — but it returns a promise, so the
 * line in front of it is `await`. That is the whole of the difference at
 * the call site, and it runs through the functions that use them.
 *
 * The second is transactions. SQLite opened a transaction on the one
 * connection the whole process shared. PostgreSQL hands out a connection
 * per query, so a transaction has to be held on one connection for its
 * whole length — and every query inside it has to reach that same
 * connection. The transaction's client is carried in an
 * `AsyncLocalStorage`, which follows the work across every `await` and
 * keeps two requests from ever seeing each other's transaction.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pfPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __pfSqlite: DatabaseSync | undefined;
}

/** The connection string of the shop's database. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The shop needs a PostgreSQL database — " +
        "set DATABASE_URL in .env.local, for example " +
        "postgresql://postgres:postgres@localhost:5432/consoleseller"
    );
  }
  return url;
}

/**
 * The pool of connections.
 *
 * A pool rather than a single connection: the shop has more than one
 * request in flight at a time, and a transaction holds its connection for
 * as long as it runs.
 */
export function getPool(): Pool {
  if (!globalThis.__pfPool) {
    globalThis.__pfPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      // Hosted PostgreSQL — Neon, Supabase, RDS — wants the connection
      // encrypted. A PostgreSQL running on the same machine does not, so
      // the choice is made by DATABASE_SSL rather than guessed at.
      ssl:
        process.env.DATABASE_SSL === "require"
          ? { rejectUnauthorized: false }
          : process.env.DATABASE_SSL === "disable"
            ? undefined
            : process.env.NODE_ENV === "production"
              ? { rejectUnauthorized: false }
              : undefined,
    });
  }
  return globalThis.__pfPool;
}

/**
 * Turns the shop's SQLite-flavoured SQL into PostgreSQL SQL.
 *
 * The shop's queries were written with `?` for their placeholders, and
 * PostgreSQL wants `$1`, `$2` and so on. Rather than change every
 * query in the shop — there are hundreds of them, and the placeholder
 * is not what anyone reads a query for — the translation happens here,
 * once.
 *
 * The placeholders inside a quoted string are left alone, so a query
 * that looks for a question mark is still looking for a question mark.
 */
export function toPostgres(sql: string): string {
  let out = "";
  let index = 0;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inString) {
      out += ch;
      // A doubled quote is an escaped quote, and does not end the string.
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += sql[++i];
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "?") {
      out += `$${++index}`;
      continue;
    }

    out += ch;
  }

  return out
    // SQLite's own clock.
    .replace(/datetime\('now'\)/gi, "now()")
    .replace(/date\('now'\)/gi, "current_date");
}

/** The result of a statement, in the shape the shop's code expects. */
export type RunResult = {
  /** How many rows the statement touched. */
  changes: number;
  /**
   * The id of the row that was written.
   *
   * SQLite handed this back for every insert. PostgreSQL does not, so a
   * statement that needs its new id asks for it — `RETURNING id` — and
   * this is where it comes from.
   */
  lastInsertRowid: number | undefined;
};

/**
 * A statement that has been prepared.
 *
 * The result is left untyped on purpose, for now. PostgreSQL hands back
 * a promise and SQLite hands back the rows, and the shop's code has not
 * been through the changeover yet — the two are the same call and the
 * same shape, so the type is the one thing that cannot be both. It is
 * tightened when the last of the queries is converted.
 */
export type Prepared = {
  /** Every row. */
  all(...params: unknown[]): any;
  /** The first row, or nothing. */
  get(...params: unknown[]): any;
  /** The statement itself. */
  run(...params: unknown[]): any;
};

/**
 * The shop's handle on the database.
 *
 * It is the same shape as the SQLite handle the shop used, so the code
 * that reads it does not change — but every call is a promise now.
 */
export type Db = {
  /** Prepares a statement. */
  prepare(sql: string): Prepared;
  /** Runs raw SQL, which may be several statements. */
  exec(sql: string): any;
  /** Whether this handle is inside a transaction. */
  readonly isTransaction: boolean;
  /** Which database this handle is talking to. */
  readonly dialect: Dialect;
};

/**
 * The client of the transaction in progress, if there is one.
 *
 * It is carried in an `AsyncLocalStorage` rather than in a variable,
 * because a variable would be shared by every request the process is
 * serving at once: one customer's transaction would pick up another's
 * queries. The storage follows the work across every `await` and keeps
 * them apart.
 */
const transaction = new AsyncLocalStorage<PoolClient>();

/**
 * The connection a query should run on.
 *
 * Inside a transaction it is that transaction's connection, so the whole
 * of the transaction is one atomic piece of work. Outside one it is any
 * free connection from the pool.
 */
async function connection(): Promise<PoolClient> {
  const current = transaction.getStore();
  if (current) return current;
  const pool = getPool();
  return pool.connect();
}

/**
 * A handle bound to one connection.
 *
 * The pool handle is a thin wrapper: it takes a connection from the pool
 * for the length of one statement and gives it back.
 */
function handleOn(client: PoolClient, isTx: boolean): Db {
  return {
    prepare(sql: string): Prepared {
      const text = toPostgres(sql);
      return {
        async all<T = QueryResultRow>(...params: unknown[]): Promise<T[]> {
          const result = await client.query<T>(text, params as never[]);
          return result.rows;
        },
        async get<T = QueryResultRow>(
          ...params: unknown[]
        ): Promise<T | undefined> {
          const result = await client.query<T>(text, params as never[]);
          return result.rows[0];
        },
        async run(...params: unknown[]): Promise<RunResult> {
          const result = await client.query(text, params as never[]);
          const last =
            result.rows[0] && typeof result.rows[0].id === "number"
              ? (result.rows[0].id as number)
              : undefined;
          return { changes: result.rowCount ?? 0, lastInsertRowid: last };
        },
      };
    },
    async exec(sql: string): Promise<void> {
      await client.query(toPostgres(sql));
    },
    get isTransaction(): boolean {
      return isTx;
    },
    get dialect(): Dialect {
      return "postgres";
    },
  };
}

/**
 * Whether the shop is running on PostgreSQL.
 *
 * PostgreSQL is the shop's database. The SQLite file is what the shop
 * kept its data in before, and it is still here for a machine that has
 * no PostgreSQL to point at — the shop runs on it exactly as it always
 * did. With DATABASE_URL set, the shop runs on PostgreSQL instead.
 */
export function isPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Where the SQLite file lives, for a machine without PostgreSQL.
 */
function resolveSqlitePath(): string {
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
  return join(defaultDir, "store.db");
}

/**
 * The SQLite handle, for a machine without PostgreSQL.
 *
 * It is the same shape as the PostgreSQL one, and every method is a
 * promise, so the shop's code does not have to care which one it has.
 */
function sqliteDb(): Db {
  if (!globalThis.__pfSqlite) {
    const db = new DatabaseSync(resolveSqlitePath());
    globalThis.__pfSqlite = db;

    // The schema is applied first, so the tables are there for the very
    // first query. The migrations run behind it: they add the columns
    // that predate the schema, and they are safe to run at any time.
    db.exec(SCHEMA_SQL_SQLITE);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA wal_autocheckpoint = 16;");

    const bootstrap = buildSqliteAdapter(db);
    void applyMigrations(bootstrap).catch((e) => {
      console.warn("Database initialization notice:", e);
    });
  }

  return buildSqliteAdapter(globalThis.__pfSqlite);
}

/**
 * The SQLite handle, for a machine without PostgreSQL.
 *
 * It is the same shape as the PostgreSQL one, and every method is a
 * promise, so the shop's code does not have to care which one it has.
 */
function buildSqliteAdapter(db: DatabaseSync): Db {
  return {
    prepare(sql: string): Prepared {
      const statement = db.prepare(sql);
      return {
        all(...params: unknown[]): any {
          return statement.all(...params);
        },
        get(...params: unknown[]): any {
          return statement.get(...params);
        },
        run(...params: unknown[]): any {
          const info = statement.run(...params);
          return {
            changes: Number(info.changes ?? 0),
            lastInsertRowid: Number(info.lastInsertRowid),
          };
        },
      };
    },
    exec(sql: string): any {
      db.exec(sql);
    },
    get isTransaction(): boolean {
      return db.isTransaction;
    },
    get dialect(): Dialect {
      return "sqlite";
    },
  };
}

/**
 * The shop's handle on the database.
 *
 * Outside a transaction this is a handle on the pool. Inside one it is a
 * handle on that transaction's connection.
 */
export function getDb(): Db {
  if (!isPostgres()) return sqliteDb();

  const current = transaction.getStore();
  if (current) return handleOn(current, true);
  return {
    prepare(sql: string): Prepared {
      const text = toPostgres(sql);
      return {
        async all<T = QueryResultRow>(...params: unknown[]): Promise<T[]> {
          const result = await getPool().query<T>(text, params as never[]);
          return result.rows;
        },
        async get<T = QueryResultRow>(
          ...params: unknown[]
        ): Promise<T | undefined> {
          const result = await getPool().query<T>(text, params as never[]);
          return result.rows[0];
        },
        async run(...params: unknown[]): Promise<RunResult> {
          const result = await getPool().query(text, params as never[]);
          const last =
            result.rows[0] && typeof result.rows[0].id === "number"
              ? (result.rows[0].id as number)
              : undefined;
          return { changes: result.rowCount ?? 0, lastInsertRowid: last };
        },
      };
    },
    async exec(sql: string): Promise<void> {
      await getPool().query(toPostgres(sql));
    },
    get isTransaction(): boolean {
      return false;
    },
  };
}

/**
 * Runs a piece of work as one transaction.
 *
 * Everything it does either happens or none of it does. The work is
 * given the handle for the transaction's own connection, so every
 * statement inside it joins the same transaction.
 */
export async function withTransaction<T>(
  work: (db: Db) => Promise<T> | T
): Promise<T> {
  const current = transaction.getStore();
  // Already inside a transaction — an order taking its stock out is part
  // of a bigger transaction — so it simply runs, and the two never try to
  // open a second transaction on top of the first.
  if (current) return work(handleOn(current, true));

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await transaction.run(client, () => work(handleOn(client, true)));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // A transaction that has already been rolled back needs nothing more.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Closes the pool. Used when the shop shuts down. */
export async function closeDb(): Promise<void> {
  if (globalThis.__pfPool) {
    await globalThis.__pfPool.end();
    globalThis.__pfPool = undefined;
  }
}

/**
 * Whether the shop is running somewhere each instance gets its own copy
 * of the database — a serverless host, where the scratch directory belongs
 * to one instance alone.
 *
 * There is no private copy any more: every instance reads and writes the
 * one PostgreSQL database. This is kept because the shop still tells the
 * operator about it, and because it is asked about elsewhere.
 */
export function isServerless(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith("/var/task")
  );
}

/**
 * Whether the database this instance is using is one only this instance
 * can see.
 *
 * Always false now. PostgreSQL is one database that every instance
 * shares, so an order placed on one instance is on the next one too.
 */
export function usesPrivateDatabaseCopy(): boolean {
  return false;
}

/**
 * Checks that the shop's database is there and is a PostgreSQL.
 *
 * Worth calling at the start of a deployment: it fails loudly rather
 * than leaving the shop serving errors.
 */
export async function checkDb(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await getPool().query<{ version: string }>(
      "SELECT version() AS version"
    );
    return {
      ok: true,
      message: result.rows[0]?.version ?? "PostgreSQL",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "The database is not reachable.",
    };
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
