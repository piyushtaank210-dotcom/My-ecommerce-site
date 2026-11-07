# Moving the shop from SQLite to PostgreSQL

**Status: the groundwork is done; the call sites are not all converted yet. The shop still runs on SQLite.**

This is the plan for finishing it. It is written so that the remaining work
is mechanical and can be done in one sitting.

## Why

The shop kept its data in a SQLite file in the repository. That works while
there is one machine. On a serverless host every instance gets its own copy
of the file, so an order placed on one instance is invisible to the next —
the code warns about this at startup. PostgreSQL is one database that every
instance shares.

## What is done

| | |
|---|---|
| `src/lib/db.ts` | The database layer. It talks to PostgreSQL when `DATABASE_URL` is set, and to the SQLite file otherwise. The PostgreSQL half is a pool of connections, a statement handle in the same shape the shop already uses, a translation of the shop's `?` placeholders into PostgreSQL's `$1`, and transactions carried in an `AsyncLocalStorage` so that a transaction's work follows it across every `await` and two requests never see each other's transaction. |
| `src/lib/schema.ts` | The schema, written once and built for either database. Three things differ between them — the id column, the clock, and the timestamp default — and they are spelled out in `schemaSql()`. PostgreSQL gets `shop_now()`, which writes UTC ISO 8601 so the shop's timestamps keep sorting and reading the way they always have. |
| `src/lib/migrations.ts` | The migrations, for both databases. The `ALTER TABLE` statements are checked per database, because PostgreSQL can add a column without being told and SQLite cannot. |
| `scripts/migrate-to-postgres.mjs` | Copies the shop's data out of the SQLite file and into PostgreSQL. Every table, in the order the foreign keys need, and it is safe to run again. |
| `.env.example` | `DATABASE_URL`, `DATABASE_POOL_MAX` and `DATABASE_SSL`. |

## What is left

The shop's queries are written with `?` placeholders, which PostgreSQL does
not take. The layer translates them, so the queries themselves do not have
to change — but PostgreSQL is asynchronous and SQLite is not, so **every
query call has to be awaited**, and so does every function that calls one.

### The change, in one line

```ts
// before
const rows = db.prepare("SELECT * FROM products").all() as Row[];
// after
const rows = (await db.prepare("SELECT * FROM products").all()) as Row[];
```

A function that has one of these becomes `async`, and its return type
becomes `Promise<…>`. Its caller then awaits it.

### The files, in the order they should be done

Roughly three hundred call sites, in twenty files. The order below is
leaves first, so each step only breaks the file above it.

1. `src/lib/settings.ts`, `src/lib/contact.ts`, `src/lib/cart.ts`,
   `src/lib/addresses.ts`, `src/lib/auth.ts` — **done**.
2. `src/lib/queries.ts` — the catalogue.
3. `src/lib/orders.ts`, `src/lib/inventory.ts` — the basket and the shelf.
4. `src/lib/taxonomy-admin.ts`, `src/lib/product-import.ts`.
5. `src/lib/admin.ts` — the back office, the largest of them.
6. `src/lib/returns.ts` — the returns, replacements and refunds.
7. `src/lib/actions.ts`, `src/lib/admin-actions.ts`, `src/lib/account-actions.ts`.
8. `src/lib/cancellations.ts`, `src/lib/return-actions.ts`,
   `src/lib/cancellation-actions.ts`, `src/lib/admin-return-actions.ts`.
9. The pages and the API routes that call them — they are already async,
   so each one only needs an `await` in front of the call.

### The dialect, in the places it differs

Almost every query is portable. These are the ones that are not:

| SQLite | PostgreSQL | Where |
|---|---|---|
| `WHERE name = ? COLLATE NOCASE` | `WHERE lower(name) = lower($1)` | `taxonomy-admin.ts`, 11 places |
| `GROUP BY brand COLLATE NOCASE` | `GROUP BY lower(brand)` and `min(brand)` in the select list | `taxonomy-admin.ts`, `migrations.ts` |
| `INSERT OR IGNORE` | `INSERT … ON CONFLICT DO NOTHING` | `migrations.ts`, 3 places |
| `INSERT` then read the new id | `INSERT … RETURNING id` | `addresses.ts`, `auth.ts` |

`LIKE` is case-sensitive in PostgreSQL and was not in SQLite, so any search
that used it wants `ILIKE`.

### The transactions

`withTransaction` in `src/lib/inventory.ts` is synchronous, because SQLite
was. In PostgreSQL a transaction has to be held on one connection for its
whole length, so it becomes:

```ts
export async function withTransaction<T>(
  work: (db: Db) => Promise<T>
): Promise<T>
```

and the work inside it is given the transaction's own connection. The
`AsyncLocalStorage` in `db.ts` already does the carrying; the work just
has to await its queries.

### The scripts

Every script under `scripts/` opens the SQLite file directly with
`node:sqlite`. They need the same change: a `pg` pool, the same
`prepare` shape, and `await` in front of the queries. `scripts/seed.mjs`
also creates the schema, and should use `schemaSql("postgres")`.

### Turning it on

1. `npm install` — to bring in `pg`.
2. `DATABASE_URL=postgresql://… npm run db:migrate` — copies the data across.
3. Set `DATABASE_URL` in `.env.local` and restart the shop.
4. Check it: `npm run e2e`, and look at the shop.
5. Only then delete the SQLite branch from `src/lib/db.ts` and
   `data/store.db`, and tighten the types in `db.ts`, which are loose
   (`any`) until the last query is converted.

## The one thing to be careful about

`data/store.db` is the shop's data. `npm run db:migrate` reads it and does
not change it, so it is safe to run more than once — but copy it somewhere
safe before the first run, and check the counts in PostgreSQL before
deleting anything.
