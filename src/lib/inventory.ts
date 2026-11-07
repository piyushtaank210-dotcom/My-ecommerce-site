import type { Db } from "./db";
import { getDb } from "./db";
import {
  stockLevel,
  type AdjustMode,
  type MovementType,
  type StockLevel,
} from "./stock";
import { backordersAllowed } from "./variations";
import { getBackorderPolicy } from "./settings";

/**
 * Stock that is moved around and accounted for.
 *
 * Two ideas hold the whole thing together:
 *
 * **A stock bucket.** A product with no options is stocked as one bucket —
 * the product itself. A product with options is stocked as one bucket per
 * option, each counted separately, because a 1TB console and a 2TB console
 * are not the same thing and run out at different times. The product's own
 * stock column is not touched while it has options.
 *
 * **A movement.** Every change to a bucket writes a row saying what the
 * stock was, what it became, and why. That is the history, and it is also
 * what makes a duplicate deduction impossible: the sale movement for an
 * order is written once and once only.
 *
 * This module is the server's business. A client component that needs the
 * vocabulary — the levels, the reasons, the movement types — imports
 * `src/lib/stock.ts` instead, which holds no data.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Something the caller can be told about, rather than a crash. */
export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * Runs a piece of work inside a transaction.
 *
 * If the work is already inside one — an order taking its stock out is
 * part of a bigger transaction — it simply runs, so the two never try to
 * open a second transaction on top of the first.
 */
export function withTransaction<T>(
  db: Db,
  work: () => T
): T {
  if (db.isTransaction) return work();
  db.exec("BEGIN");
  try {
    const out = work();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // A transaction that has already been rolled back needs nothing more.
    }
    throw err;
  }
}

/** The name a stock bucket is known by. */
export function stockKey(productSlug: string, variantId: string | null): string {
  return variantId ? `v:${variantId}` : `p:${productSlug}`;
}

/* ---------------------------------------------------------------- buckets */

/** What is in a bucket, and where it stands. */
export type StockBucket = {
  /** The bucket's name — `p:<product>` or `v:<variant>`. */
  key: string;
  product_slug: string;
  product_name: string;
  product_sku: string | null;
  variant_id: string | null;
  variant_name: string | null;
  /** How many are on hand. */
  stock: number;
  /** The number at or below which this counts as low. */
  threshold: number;
  level: StockLevel;
  listed: boolean;
  status: string;
};

/** Whether a product is stocked by its options rather than by itself. */
function productHasVariants(db: DatabaseSync, productSlug: string): boolean {
  const row = db
    .prepare("SELECT 1 AS x FROM variants WHERE product_slug = ? LIMIT 1")
    .get(productSlug);
  return !!row;
}

/**
 * The stock in a bucket.
 *
 * Throws when the bucket does not exist, because a movement that points at
 * nothing would be worse than a loud failure.
 */
function readBucket(
  db: DatabaseSync,
  productSlug: string,
  variantId: string | null
): number {
  if (variantId) {
    const row = db
      .prepare("SELECT stock FROM variants WHERE id = ? AND product_slug = ?")
      .get(variantId, productSlug) as { stock?: number } | undefined;
    if (!row) throw new InventoryError("That option no longer exists.");
    return num(row.stock);
  }
  if (productHasVariants(db, productSlug)) {
    throw new InventoryError(
      "This product is stocked by its options — the stock to change is the option's own."
    );
  }
  const row = db.prepare("SELECT stock FROM products WHERE slug = ?").get(
    productSlug
  ) as { stock?: number } | undefined;
  if (!row) throw new InventoryError("That product no longer exists.");
  return num(row.stock);
}

/**
 * What is on the shelf for one product or option.
 *
 * The back office needs to answer "is there one of these to send?" before
 * it offers one, so the reader is public. A product stocked by its options
 * has no shelf of its own — the option does.
 */
export function stockOnHand(
  db: DatabaseSync,
  productSlug: string,
  variantId: string | null
): number {
  return readBucket(db, productSlug, variantId);
}

/** Puts a number into a bucket. */
function writeBucket(
  db: DatabaseSync,
  productSlug: string,
  variantId: string | null,
  stock: number
): void {
  const info = variantId
    ? db
        .prepare(
          "UPDATE variants SET stock = ? WHERE id = ? AND product_slug = ?"
        )
        .run(stock, variantId, productSlug)
    : db
        .prepare("UPDATE products SET stock = ? WHERE slug = ?")
        .run(stock, productSlug);
  if (!info.changes) throw new InventoryError("That product no longer exists.");
}

/** The number at or below which a bucket counts as low. */
function readThreshold(
  db: DatabaseSync,
  productSlug: string,
  variantId: string | null
): number {
  if (variantId) {
    const row = db
      .prepare(
        "SELECT low_stock_threshold FROM variants WHERE id = ? AND product_slug = ?"
      )
      .get(variantId, productSlug) as
      | { low_stock_threshold?: number }
      | undefined;
    if (!row) throw new InventoryError("That option no longer exists.");
    return num(row.low_stock_threshold);
  }
  const row = db
    .prepare("SELECT low_stock_threshold FROM products WHERE slug = ?")
    .get(productSlug) as { low_stock_threshold?: number } | undefined;
  if (!row) throw new InventoryError("That product no longer exists.");
  return num(row.low_stock_threshold);
}

/**
 * Takes units out of a bucket.
 *
 * The `stock >= ?` guard is in the statement itself, so the number can
 * never go below zero even if something else changed it a moment ago.
 */
function takeFromBucket(
  db: DatabaseSync,
  productSlug: string,
  variantId: string | null,
  quantity: number
): number {
  const info = variantId
    ? db
        .prepare(
          `UPDATE variants SET stock = stock - ?
           WHERE id = ? AND product_slug = ? AND stock >= ?`
        )
        .run(quantity, variantId, productSlug, quantity)
    : db
        .prepare(
          "UPDATE products SET stock = stock - ? WHERE slug = ? AND stock >= ?"
        )
        .run(quantity, productSlug, quantity);

  if (!info.changes) {
    const available = readBucket(db, productSlug, variantId);
    throw new InventoryError(
      `Only ${available} left in stock — the order needs ${quantity}.`
    );
  }
  return readBucket(db, productSlug, variantId);
}

/* -------------------------------------------------------------- movements */

export type InventoryMovement = {
  id: number;
  stock_key: string;
  product_slug: string;
  product_name: string | null;
  variant_id: string | null;
  variant_name: string | null;
  previous_stock: number;
  quantity_changed: number;
  new_stock: number;
  movement_type: MovementType;
  reason: string;
  note: string | null;
  order_id: string | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
};

export type Movement = {
  stockKey: string;
  productSlug: string;
  variantId: string | null;
  previous: number;
  change: number;
  next: number;
  type: MovementType;
  reason: string;
  note: string | null;
  orderId: string | null;
  userId: number | null;
};

/** Writes one row of history. */
function recordMovement(db: DatabaseSync, m: Movement): void {
  db.prepare(
    `INSERT INTO inventory_movements
       (stock_key, product_slug, variant_id, previous_stock, quantity_changed,
        new_stock, movement_type, reason, note, order_id, user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    m.stockKey,
    m.productSlug,
    m.variantId,
    m.previous,
    m.change,
    m.next,
    m.type,
    m.reason,
    m.note,
    m.orderId,
    m.userId
  );
}

/* ------------------------------------------------------------ adjustments */

export type StockAdjustment = {
  productSlug: string;
  variantId?: string | null;
  /** "set" puts the stock at a number; "add" and "remove" move it by one. */
  mode: AdjustMode;
  quantity: number;
  /** Why the stock moved. Required — a change without a reason is not allowed. */
  reason: string;
  note?: string | null;
  userId?: number | null;
};

export type AdjustmentResult =
  | {
      ok: true;
      key: string;
      previous: number;
      stock: number;
      level: StockLevel;
    }
  | { ok: false; reason: string };

/**
 * Changes a stock level by hand, and writes down why.
 *
 * The change and the record of it happen together, so the history can
 * never disagree with the stock. Stock is never allowed to go below zero:
 * a change that would leave it there is refused, not clipped.
 */
export function adjustStock(input: StockAdjustment): AdjustmentResult {
  const db = getDb();
  const productSlug = input.productSlug.trim();
  const variantId = input.variantId?.trim() || null;
  const quantity = Math.round(Number(input.quantity));
  const reason = input.reason.trim();

  if (!productSlug) return { ok: false, reason: "Choose a product." };
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, reason: "Enter a whole number of units." };
  }
  if (!reason) return { ok: false, reason: "Give a reason for the change." };

  try {
    return withTransaction(db, () => {
      const previous = readBucket(db, productSlug, variantId);
      const threshold = readThreshold(db, productSlug, variantId);

      let next: number;
      if (input.mode === "set") next = quantity;
      else if (input.mode === "remove") next = previous - quantity;
      else next = previous + quantity;

      if (next < 0) {
        return {
          ok: false,
          reason: `There are only ${previous} in stock — that would leave the count negative.`,
        };
      }

      // Setting the stock to what it already is changes nothing, so it is
      // not a movement and does not go in the history.
      if (next === previous) {
        return {
          ok: true,
          key: stockKey(productSlug, variantId),
          previous,
          stock: next,
          level: stockLevel(next, threshold),
        };
      }

      writeBucket(db, productSlug, variantId, next);

      recordMovement(db, {
        stockKey: stockKey(productSlug, variantId),
        productSlug,
        variantId,
        previous,
        change: next - previous,
        next,
        type: "adjustment",
        reason,
        note: input.note?.trim() || null,
        orderId: null,
        userId: input.userId ?? null,
      });

      return {
        ok: true,
        key: stockKey(productSlug, variantId),
        previous,
        stock: next,
        level: stockLevel(next, threshold),
      };
    });
  } catch (err) {
    if (err instanceof InventoryError) return { ok: false, reason: err.message };
    throw err;
  }
}

/**
 * Records a new product's opening stock.
 *
 * A product that has just been added starts with nothing on the shelf, so
 * its first count is a movement like any other: the history starts at zero
 * rather than at a number with nothing behind it.
 */
export function recordOpeningBalance(
  productSlug: string,
  quantity: number,
  userId: number | null,
  variantId: string | null = null
): void {
  const units = Math.round(Number(quantity));
  if (!Number.isFinite(units) || units <= 0) return;

  const db = getDb();
  try {
    withTransaction(db, () => {
      const previous = readBucket(db, productSlug, variantId);
      const next = previous + units;
      writeBucket(db, productSlug, variantId, next);

      recordMovement(db, {
        stockKey: stockKey(productSlug, variantId),
        productSlug,
        variantId,
        previous,
        change: units,
        next,
        type: "adjustment",
        reason: "Opening balance",
        note: null,
        orderId: null,
        userId,
      });
    });
  } catch (err) {
    if (err instanceof InventoryError) return;
    throw err;
  }
}

/**
 * Sets the number at or below which a bucket counts as low.
 *
 * The threshold is not a movement — it changes no stock, so it writes no
 * history.
 */
export function setLowStockThreshold(
  productSlug: string,
  variantId: string | null,
  threshold: number
): boolean {
  const value = Math.max(0, Math.round(Number(threshold)));
  if (!Number.isFinite(value)) return false;
  const db = getDb();
  const info = variantId
    ? db
        .prepare(
          `UPDATE variants SET low_stock_threshold = ?
           WHERE id = ? AND product_slug = ?`
        )
        .run(value, variantId, productSlug)
    : db
        .prepare(
          "UPDATE products SET low_stock_threshold = ? WHERE slug = ?"
        )
        .run(value, productSlug);
  return info.changes > 0;
}

/* ------------------------------------------------------------ order stock */

/**
 * Takes the stock for an order line out of its bucket.
 *
 * It runs inside the order's own transaction, so the order and the stock
 * move together or not at all. The sale movement it writes is what the
 * unique index on `inventory_movements` guards: the same order cannot
 * take the same bucket out twice.
 *
 * When the shelf does not have enough, the order is refused — unless the
 * store takes backorders, in which case what is there is taken and the
 * shortfall is reported so the order line can record it.
 */
export function takeStockForOrder(
  db: DatabaseSync,
  orderId: string,
  productSlug: string,
  variantId: string | null,
  quantity: number,
  productName: string,
  userId: number | null,
  type: "sale" | "resale" | "replacement" = "sale",
  reason?: string | null
): { taken: number; backordered: number } {
  const available = readBucket(db, productSlug, variantId);
  // A replacement is a unit going out to a customer who is waiting for it.
  // It cannot be sent on backorder — there has to be something on the shelf.
  const allowBackorder =
    type === "replacement" ? false : backordersAllowed(getBackorderPolicy());

  if (available < quantity && !allowBackorder) {
    throw new InventoryError(
      `Only ${available} of ${productName} left in stock — the order needs ${quantity}.`
    );
  }

  const taken = Math.min(available, quantity);
  const backordered = quantity - taken;
  const next = taken > 0 ? takeFromBucket(db, productSlug, variantId, taken) : available;

  recordMovement(db, {
    stockKey: stockKey(productSlug, variantId),
    productSlug,
    variantId,
    previous: available,
    change: -taken,
    next,
    type,
    reason:
      reason ??
      (type === "resale"
        ? `Order ${orderId} reopened`
        : backordered
          ? `Order ${orderId} — ${backordered} on backorder`
          : `Order ${orderId}`),
    note: null,
    orderId,
    userId,
  });

  return { taken, backordered };
}

/**
 * Puts an order line's stock back into its bucket.
 *
 * `type` says why: a cancellation that never left the warehouse is a
 * restock, and a return that has been checked over is a return.
 */
export function putStockBack(
  db: DatabaseSync,
  orderId: string,
  line: { id: number; product_slug: string; variant_id: string | null; quantity: number },
  type: "restock" | "return",
  reason: string,
  note: string | null,
  userId: number | null
): void {
  const productSlug = line.product_slug;
  const variantId = line.variant_id;
  const quantity = num(line.quantity);
  const previous = readBucket(db, productSlug, variantId);
  const next = previous + quantity;

  writeBucket(db, productSlug, variantId, next);

  recordMovement(db, {
    stockKey: stockKey(productSlug, variantId),
    productSlug,
    variantId,
    previous,
    change: quantity,
    next,
    type,
    reason,
    note,
    orderId,
    userId,
  });

  db.prepare("UPDATE order_items SET stock_state = ?, stock_state_note = ? WHERE id = ?").run(
    type === "return" ? "returned" : "restocked",
    note,
    line.id
  );
}

/* ---------------------------------------------------------- pending checks */

/** An order line whose stock is waiting for somebody to look at it. */
export type PendingStockCheck = {
  order_id: string;
  order_status: string;
  created_at: string;
  customer: string;
  email: string;
  line_id: number;
  product_slug: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  price: number;
};

/**
 * The order lines whose stock has not been given back yet.
 *
 * These are the returns: an order that was cancelled after it had already
 * left, so the goods are on their way back but nobody has looked at them.
 * They are not sellable stock until somebody says so.
 */
export function pendingStockChecks(): PendingStockCheck[] {
  return (
    getDb()
      .prepare(
        `SELECT oi.id AS line_id, oi.order_id, oi.product_slug, oi.variant_id,
                oi.variant_name, oi.quantity, oi.price, oi.name AS product_name,
                o.status AS order_status, o.created_at, o.name AS customer, o.email
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.stock_state = 'awaiting_check'
         ORDER BY o.created_at DESC, oi.id`
      )
      .all() as Row[]
  ).map((r) => ({
    order_id: str(r.order_id),
    order_status: str(r.order_status),
    created_at: str(r.created_at),
    customer: str(r.customer),
    email: str(r.email),
    line_id: num(r.line_id),
    product_slug: str(r.product_slug),
    product_name: str(r.product_name),
    variant_id: strOrNull(r.variant_id),
    variant_name: strOrNull(r.variant_name),
    quantity: num(r.quantity),
    price: num(r.price),
  }));
}

/**
 * Settles a return.
 *
 * "restock" puts the units back into sellable stock — the goods came back
 * and are fit to sell. "write_off" leaves the stock where it is: the goods
 * did not come back, or came back damaged, and either way they are not
 * going on the shelf. The decision and the reason are recorded against
 * the order line.
 */
export function resolveStockCheck(
  orderId: string,
  action: "restock" | "write_off",
  reason: string,
  userId: number | null
): { ok: boolean; message: string } {
  const db = getDb();
  const why = reason.trim();
  if (!why) {
    return { ok: false, message: "Say why the stock is being settled this way." };
  }

  try {
    return withTransaction(db, () => {
      const lines = db
        .prepare(
          "SELECT id, product_slug, variant_id, quantity FROM order_items WHERE order_id = ? AND stock_state = 'awaiting_check'"
        )
        .all(orderId) as Row[];

      if (!lines.length) {
        throw new InventoryError(
          "There is nothing waiting for a stock check on that order."
        );
      }

      for (const line of lines) {
        if (action === "restock") {
          putStockBack(
            db,
            orderId,
            {
              id: num(line.id),
              product_slug: str(line.product_slug),
              variant_id: strOrNull(line.variant_id),
              quantity: num(line.quantity),
            },
            "return",
            why,
            null,
            userId
          );
        } else {
          db.prepare(
            "UPDATE order_items SET stock_state = 'written_off', stock_state_note = ? WHERE id = ?"
          ).run(why, num(line.id));
        }
      }

      return {
        ok: true,
        message:
          action === "restock"
            ? `The units for order ${orderId} are back in stock.`
            : `Order ${orderId} is settled. The units were not put back into stock.`,
      };
    });
  } catch (err) {
    if (err instanceof InventoryError) return { ok: false, message: err.message };
    throw err;
  }
}

/* ---------------------------------------------------------------- reading */

export type BucketQuery = {
  q?: string;
  level?: StockLevel | "all" | string;
};

/**
 * Every stock bucket in the catalogue.
 *
 * A product with options is listed once per option; a product without
 * them is listed once. The level of each is worked out against that
 * bucket's own threshold.
 */
export function listStockBuckets(query: BucketQuery = {}): StockBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT p.slug, p.name, p.sku, p.stock AS product_stock,
              p.low_stock_threshold AS product_threshold, p.listed, p.status,
              v.id AS v_id, v.name AS v_name, v.stock AS v_stock,
              v.low_stock_threshold AS v_threshold
       FROM products p
       LEFT JOIN variants v ON v.product_slug = p.slug
       ORDER BY p.position, p.name, v.position, v.name`
    )
    .all() as Row[];

  const buckets: StockBucket[] = [];
  for (const r of rows) {
    const productSlug = str(r.slug);
    const variantId = strOrNull(r.v_id);
    const stock = variantId ? num(r.v_stock) : num(r.product_stock);
    const threshold = variantId
      ? num(r.v_threshold)
      : num(r.product_threshold);

    buckets.push({
      key: stockKey(productSlug, variantId),
      product_slug: productSlug,
      product_name: str(r.name),
      product_sku: strOrNull(r.sku),
      variant_id: variantId,
      variant_name: strOrNull(r.v_name),
      stock,
      threshold,
      level: stockLevel(stock, threshold),
      listed: num(r.listed) !== 0,
      status: str(r.status),
    });
  }

  let out = buckets;
  if (query.q) {
    const needle = query.q.trim().toLowerCase();
    out = out.filter(
      (b) =>
        b.product_name.toLowerCase().includes(needle) ||
        (b.variant_name ?? "").toLowerCase().includes(needle) ||
        (b.product_sku ?? "").toLowerCase().includes(needle)
    );
  }
  if (query.level && query.level !== "all") {
    out = out.filter((b) => b.level === query.level);
  }
  return out;
}

export type MovementQuery = {
  q?: string;
  productSlug?: string;
  type?: MovementType | "all" | string;
  limit?: number;
  offset?: number;
};

function movementWhere(query: MovementQuery) {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q) {
    where.push(
      "(p.name LIKE ? OR COALESCE(v.name, '') LIKE ? OR m.reason LIKE ? OR COALESCE(m.order_id, '') LIKE ?)"
    );
    const like = `%${query.q}%`;
    params.push(like, like, like, like);
  }
  if (query.productSlug) {
    where.push("m.product_slug = ?");
    params.push(query.productSlug);
  }
  if (query.type && query.type !== "all") {
    where.push("m.movement_type = ?");
    params.push(query.type);
  }

  return { where, params };
}

/** The inventory history, newest first. */
export function listMovements(query: MovementQuery = {}): InventoryMovement[] {
  const { where, params } = movementWhere(query);
  const bind = [...params];
  let limit = "";
  let offset = "";
  if (typeof query.limit === "number") {
    limit = "LIMIT ?";
    bind.push(query.limit);
  }
  if (typeof query.offset === "number") {
    offset = "OFFSET ?";
    bind.push(query.offset);
  }

  return (
    getDb()
      .prepare(
        `SELECT m.*, p.name AS product_name, v.name AS variant_name, u.name AS user_name
         FROM inventory_movements m
         LEFT JOIN products p ON p.slug = m.product_slug
         LEFT JOIN variants v ON v.id = m.variant_id
         LEFT JOIN users u ON u.id = m.user_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY m.created_at DESC, m.id DESC ${limit} ${offset}`
      )
      .all(...bind) as Row[]
  ).map((r) => ({
    id: num(r.id),
    stock_key: str(r.stock_key),
    product_slug: str(r.product_slug),
    product_name: strOrNull(r.product_name),
    variant_id: strOrNull(r.variant_id),
    variant_name: strOrNull(r.variant_name),
    previous_stock: num(r.previous_stock),
    quantity_changed: num(r.quantity_changed),
    new_stock: num(r.new_stock),
    movement_type: str(r.movement_type) as MovementType,
    reason: str(r.reason),
    note: strOrNull(r.note),
    order_id: strOrNull(r.order_id),
    user_id: r.user_id === null ? null : num(r.user_id),
    user_name: strOrNull(r.user_name),
    created_at: str(r.created_at),
  }));
}

export function countMovements(query: MovementQuery = {}): number {
  const { where, params } = movementWhere(query);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM inventory_movements m
       LEFT JOIN products p ON p.slug = m.product_slug
       LEFT JOIN variants v ON v.id = m.variant_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`
    )
    .get(...params) as Row | undefined;
  return num(row?.n);
}

/** The numbers the inventory page and the dashboard are built on. */
export type InventorySummary = {
  units: number;
  buckets: number;
  low: number;
  out: number;
  pendingChecks: number;
  movements: number;
};

export function inventorySummary(): InventorySummary {
  const db = getDb();
  const buckets = listStockBuckets();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM inventory_movements")
    .get() as Row | undefined;

  return {
    units: buckets.reduce((sum, b) => sum + b.stock, 0),
    buckets: buckets.length,
    low: buckets.filter((b) => b.level === "low").length,
    out: buckets.filter((b) => b.level === "out").length,
    pendingChecks: pendingStockChecks().length,
    movements: num(row?.n),
  };
}
