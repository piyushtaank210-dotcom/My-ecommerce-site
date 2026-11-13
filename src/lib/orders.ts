import { randomBytes } from "node:crypto";
import { getDb, withTransaction } from "./db";
import { getCurrentUser } from "./auth";
import {
  InventoryError,
  putStockBack,
  takeStockForOrder,
} from "./inventory";
import type { Order, OrderItem } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

export type CheckoutInput = {
  name: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  notes?: string;
  paymentMethod: string;
  /**
   * The payment provider that took the money, and its own reference
   * for the payment.
   *
   * They are what a refund is sent against. A checkout that does not
   * talk to a provider leaves them empty, and the refund is paid by
   * hand.
   */
  paymentGateway?: string | null;
  paymentReference?: string | null;
};

/** Where an order sits in its journey — see src/lib/order-status.ts. */
export {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_TIMELINE,
  type OrderStatus,
} from "./order-status";

import { type OrderStatus } from "./order-status";

export type CheckoutLine = {
  productSlug: string;
  variantId: string | null;
  variantName: string | null;
  name: string;
  price: number;
  quantity: number;
};

export function generateOrderId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `PF${out}`;
}

/**
 * Writes an order, and takes the stock for it.
 *
 * The order and the stock move together or not at all: the whole thing is
 * one transaction, so a line that cannot be fulfilled leaves no order
 * behind and takes nothing out of the shelf. The stock is never allowed to
 * go below zero, and the sale movement for an order can only be written
 * once — so the same order cannot be charged against the stock twice.
 */
export async function createOrder(
  input: CheckoutInput,
  lines: CheckoutLine[],
  totals: { subtotal: number; shipping: number; total: number }
): Promise<string> {
  const db = getDb();
  const id = generateOrderId();
  const user = await getCurrentUser();

  (await withTransaction(async (db) => {
    (await db.prepare(
      `INSERT INTO orders
        (id, user_id, name, email, phone, address1, address2, city, state, pincode, notes,
         subtotal, shipping, total, payment_method, payment_gateway, payment_reference, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed')`
    ).run(
      id,
      user?.id ?? null,
      input.name,
      input.email,
      input.phone,
      input.address1,
      input.address2 || null,
      input.city,
      input.state,
      input.pincode,
      input.notes || null,
      totals.subtotal,
      totals.shipping,
      totals.total,
      input.paymentMethod,
      input.paymentGateway || null,
      input.paymentReference || null,
    ));

    const insItem = db.prepare(
      `INSERT INTO order_items
         (order_id, product_slug, variant_id, variant_name, name, price, quantity,
          stock_state, backordered)
       VALUES (?,?,?,?,?,?,?,'deducted',?)`
    );
    for (const l of lines) {
      const taken = (await takeStockForOrder(
        db,
        id,
        l.productSlug,
        l.variantId ?? null,
        l.quantity,
        l.name,
        user?.id ?? null
      ));
      await insItem.run(
        id,
        l.productSlug,
        l.variantId,
        l.variantName,
        l.name,
        l.price,
        l.quantity,
        taken.backordered
      );
    }
  }));

  return id;
}

/**
 * Moves an order along, and keeps the stock in step with it.
 *
 * Cancelling an order gives the stock back — but only when the goods
 * never left. An order that had already shipped or been delivered is a
 * return: the units are on their way back, but nobody has looked at them,
 * so they are not put back into sellable stock until somebody says so.
 *
 * Reopening a cancelled order takes the stock out again. It is refused
 * while the return is still waiting for a check, because the units are
 * somewhere in between.
 */
export async function applyOrderStatus(
  orderId: string,
  status: OrderStatus,
  userId: number | null = null
): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();

  try {
    (await withTransaction(async (db) => {
      const order = (await db
        .prepare("SELECT id, status FROM orders WHERE id = ?")
        .get(orderId)) as { id?: string; status?: string } | undefined;
      if (!order) throw new InventoryError("That order no longer exists.");

      const from = String(order.status ?? "");
      if (from === status) return;

      const lines = (await db
        .prepare(
          `SELECT id, product_slug, variant_id, variant_name, name, quantity, stock_state
           FROM order_items WHERE order_id = ? ORDER BY id`
        )
        .all(orderId)) as Row[];

      if (status === "cancelled") {
        // The goods had already left the warehouse, so they are coming back
        // as a return rather than going straight back on the shelf.
        const hadLeft = from === "shipped" || from === "delivered";

        for (const line of lines) {
          if (str(line.stock_state) !== "deducted") continue;

          if (hadLeft) {
            (await db.prepare(
              "UPDATE order_items SET stock_state = 'awaiting_check' WHERE id = ?"
            ).run(num(line.id)));
            continue;
          }

          (await putStockBack(
            db,
            orderId,
            {
              id: num(line.id),
              product_slug: str(line.product_slug),
              variant_id: strOrNull(line.variant_id),
              quantity: num(line.quantity),
            },
            "restock",
            `Order ${orderId} cancelled`,
            null,
            userId
          ));
        }
      } else if (from === "cancelled") {
        // Reopening the order puts the stock back on the shelf, so it has
        // to come off the shelf again.
        for (const line of lines) {
          const state = str(line.stock_state);
          if (state === "awaiting_check") {
            throw new InventoryError(
              "This order is waiting for a stock check on its return. Settle the check before reopening it."
            );
          }
          if (state !== "restocked" && state !== "returned") continue;

          const taken = (await takeStockForOrder(
            db,
            orderId,
            str(line.product_slug),
            strOrNull(line.variant_id),
            num(line.quantity),
            str(line.name),
            userId,
            "resale"
          ));
          (await db.prepare(
            "UPDATE order_items SET stock_state = 'deducted', stock_state_note = NULL, backordered = ? WHERE id = ?"
          ).run(taken.backordered, num(line.id)));
        }
      }

      if (status === "delivered") {
        (await db.prepare(
          "UPDATE orders SET status = ?, delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?"
        ).run(status, orderId));
      } else {
        (await db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId));
      }
    }));

    return { ok: true };
  } catch (err) {
    if (err instanceof InventoryError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function getOrder(id: string): Promise<Order | null> {
  const db = getDb();
  const row = (await db.prepare("SELECT * FROM orders WHERE id = ?").get(id)) as
    | Row
    | undefined;
  if (!row) return null;

  const items = (
    (await db
      .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
      .all(id)) as Row[]
  ).map<OrderItem>((r) => ({
    id: num(r.id),
    product_slug: str(r.product_slug),
    variant_id: strOrNull(r.variant_id),
    variant_name: strOrNull(r.variant_name),
    name: str(r.name),
    price: num(r.price),
    quantity: num(r.quantity),
    stock_state: str(r.stock_state) || "settled",
    stock_state_note: strOrNull(r.stock_state_note),
    backordered: num(r.backordered),
  }));

  return {
    id: str(row.id),
    created_at: str(row.created_at),
    user_id: row.user_id === null ? null : num(row.user_id),
    name: str(row.name),
    email: str(row.email),
    phone: str(row.phone),
    address1: str(row.address1),
    address2: strOrNull(row.address2),
    city: str(row.city),
    state: str(row.state),
    pincode: str(row.pincode),
    notes: strOrNull(row.notes),
    subtotal: num(row.subtotal),
    shipping: num(row.shipping),
    total: num(row.total),
    payment_method: str(row.payment_method),
    status: str(row.status),
    delivered_at: strOrNull(row.delivered_at),
    items,
  };
}

export async function getOrdersForUser(userId: number): Promise<Order[]> {
  const db = getDb();
  const rows = (await db
    .prepare("SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId)) as Row[];
  const orders = await Promise.all(
    rows.map(async (r) => (await getOrder(str(r.id))))
  );
  return orders.filter((o): o is Order => o !== null);
}
