import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
// The extension matters: this file is imported by the migration script,
// which runs on plain Node rather than through Next's bundler, and Node
// will not guess that "./schema" means "./schema.ts".
import { type Dialect } from "./schema.ts";
import { databaseUrl, sslOption } from "./database-url.ts";

// The connection string lives in its own file, so that it is one place to
// find and one place to change.
export { databaseUrl };

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
    const url = databaseUrl();
    globalThis.__pfPool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      // Whether the connection is encrypted is decided by the connection
      // string itself, and by DATABASE_SSL when it is set.
      ssl: sslOption(url),
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
    //
    // The shop keeps its timestamps as text, in one format, so that they
    // sort as they are — so the time a query asks for has to be text in
    // that same format too, or the comparison has nothing to compare.
    // `shop_now()` is the shop's own clock, and it is the same format.
    .replace(
      /datetime\('now'\s*,\s*'([^']+)'\)/gi,
      (_m, mod) =>
        `to_char(now() AT TIME ZONE 'UTC' + interval '${mod}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
    )
    .replace(/datetime\('now'\)/gi, "shop_now()")
    .replace(/date\('now'\)/gi, "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
    // SQLite's `LIKE` ignores the case of the letters; PostgreSQL's does
    // not, so the search has to ask for the same thing by name.
    .replace(/\bLIKE\s+\$(\d+)/gi, (_, n) => `ILIKE $${n}`)
    // SQLite's `COLLATE NOCASE` is a comparison that ignores the case of
    // the letters. PostgreSQL spells that by folding both sides.
    .replace(
      /(\w+)\s*=\s*\$(\d+)\s+COLLATE\s+NOCASE/gi,
      (_, col, n) => `lower(${col}) = lower($${n})`
    )
    // SQLite's `IS` is a comparison that treats two nulls as equal.
    // PostgreSQL spells that `IS NOT DISTINCT FROM`. The placeholder has
    // already become a number by this point, so it is matched here.
    .replace(/\bIS\s+\$(\d+)/gi, (_, n) => `IS NOT DISTINCT FROM $${n}`);
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
        async all<T extends QueryResultRow = QueryResultRow>(
          ...params: unknown[]
        ): Promise<T[]> {
          const result = await client.query<T>(text, params as never[]);
          return result.rows;
        },
        async get<T extends QueryResultRow = QueryResultRow>(
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
 * The shop's handle on the database.
 *
 * Outside a transaction this is a handle on the pool. Inside one it is a
 * handle on that transaction's connection.
 */
export function getDb(): Db {
  // The connection string is asked for first, so that a shop that has not
  // been told where its database is says so at once rather than at the
  // first query.
  databaseUrl();

  const current = transaction.getStore();
  if (current) return handleOn(current, true);
  return {
    prepare(sql: string): Prepared {
      const text = toPostgres(sql);
      return {
        async all<T extends QueryResultRow = QueryResultRow>(
          ...params: unknown[]
        ): Promise<T[]> {
          const result = await getPool().query<T>(text, params as never[]);
          return result.rows;
        },
        async get<T extends QueryResultRow = QueryResultRow>(
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
    get dialect(): Dialect {
      return "postgres";
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
