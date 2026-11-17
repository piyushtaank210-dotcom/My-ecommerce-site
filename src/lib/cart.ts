import { getDb, parseJson } from "./db";
import { readSessionId } from "./session";
import { signedInUserId } from "./auth";
import { shippingFor } from "./format";
import { sellingPrice } from "./pricing";
import { mapProduct, PRODUCT_STOCK_COLUMNS_SQL } from "./queries";
import { checkSelection } from "./purchase";
import type { Cart, CartLine, Variant } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

/**
 * Whose cart this is.
 *
 * A customer's cart belongs to their account, so it is found on every
 * device they sign in on and nobody else can see it — not the next
 * person to use the same browser, and not a guest who happens to be
 * holding the same cookie.
 *
 * A visitor who is not signed in still has a cart of their own, keyed by
 * the browser session. It is empty in practice: the shop asks for a
 * sign-in before anything is put in it.
 */
export async function cartOwnerKey(): Promise<string | null> {
  const userId = await signedInUserId();
  if (userId !== null) return `u:${userId}`;
  return readSessionId();
}

/**
 * Moves a basket that was started before the shop had accounts onto the
 * account it belongs to.
 *
 * The shop used to keep the basket against the browser session, so a
 * customer who had filled one before they signed in would have found it
 * empty afterwards. It is moved across the first time their cart is
 * read, and only then — so the count in the header is not a write on
 * every page.
 */
async function adoptGuestCart(owner: string): Promise<void> {
  if (!owner.startsWith("u:")) return;
  const sessionId = await readSessionId();
  if (!sessionId) return;

  const db = getDb();
  const rows = (await db
    .prepare("SELECT id FROM cart_items WHERE session_id = ? LIMIT 1")
    .all(sessionId)) as Row[];
  if (!rows.length) return;

  await db
    .prepare("UPDATE cart_items SET session_id = ? WHERE session_id = ?")
    .run(owner, sessionId);
}

export async function getCart(): Promise<Cart> {
  const owner = await cartOwnerKey();
  const empty: Cart = {
    lines: [],
    itemCount: 0,
    subtotal: 0,
    savings: 0,
    shipping: 0,
    total: 0,
  };
  if (!owner) return empty;

  await adoptGuestCart(owner);

  const db = getDb();
  const rows = (await db
    .prepare(
      `SELECT ci.id AS line_id, ci.quantity AS line_qty,
              p.*, ${PRODUCT_STOCK_COLUMNS_SQL},
              v.id AS v_id, v.product_slug AS v_product_slug, v.name AS v_name,
              v.sku AS v_sku, v.price AS v_price, v.mrp AS v_mrp, v.stock AS v_stock,
              v.low_stock_threshold AS v_threshold, v.image AS v_image,
              v.barcode AS v_barcode, v.attributes AS v_attributes,
              v.position AS v_position
       FROM cart_items ci
       JOIN products p ON p.slug = ci.product_slug
       LEFT JOIN variants v ON v.id = ci.variant_id
       WHERE ci.session_id = ? AND p.listed = 1
       ORDER BY ci.id DESC`
    )
    .all(owner)) as Row[];

  const lines: CartLine[] = rows.map((r) => {
    const product = mapProduct(r);
    const variant = r.v_id
      ? {
          id: str(r.v_id),
          product_slug: str(r.v_product_slug),
          name: str(r.v_name),
          sku: strOrNull(r.v_sku),
          price: num(r.v_price),
          mrp: num(r.v_mrp),
          stock: num(r.v_stock),
          low_stock_threshold: num(r.v_threshold),
          image: strOrNull(r.v_image),
          barcode: strOrNull(r.v_barcode),
          attributes: parseJson<Record<string, string>>(r.v_attributes, {}),
          position: num(r.v_position),
        }
      : null;
    // A product on a sale price sells for the sale price. The variant's own
    // price wins when there is one — a variant is priced on its own.
    const unitPrice = variant ? variant.price : sellingPrice(product);
    const unitMrp = variant ? variant.mrp : product.mrp;
    const quantity = num(r.line_qty);
    return {
      id: num(r.line_id),
      quantity,
      product,
      variant,
      unitPrice,
      unitMrp,
      lineTotal: unitPrice * quantity,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const savings = lines.reduce(
    (sum, l) => sum + l.unitMrp * l.quantity - l.lineTotal,
    0
  );
  const shipping = shippingFor(subtotal);

  return {
    lines,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    savings,
    shipping,
    total: subtotal + shipping,
  };
}

/**
 * Puts a product in a customer's cart.
 *
 * The account is part of the call: the cart belongs to the customer, and
 * the shop's own rules — the option has to exist, the quantity has to be
 * something the shop can sell — are checked here, on the server, where
 * they cannot be argued with.
 */
export async function addToCart(
  userId: number,
  productSlug: string,
  variantId: string | null,
  quantity: number
): Promise<{ ok: boolean; message: string }> {
  const checked = await checkSelection(productSlug, variantId, quantity);
  if (!checked.ok) return { ok: false, message: checked.message };
  const { selection } = checked;

  const owner = `u:${userId}`;
  const db = getDb();

  const existing = (await db
    .prepare(
      `SELECT id, quantity FROM cart_items
       WHERE session_id = ? AND product_slug = ? AND (variant_id IS ? OR variant_id = ?)`
    )
    .get(owner, productSlug, variantId, variantId)) as
    | { id: number; quantity: number }
    | undefined;

  if (existing) {
    (await db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(
      Math.min(
        existing.quantity + selection.quantity,
        selection.allowBackorder ? 10 : selection.stock
      ),
      existing.id
    ));
  } else {
    (await db.prepare(
      `INSERT INTO cart_items (session_id, product_slug, variant_id, quantity)
       VALUES (?,?,?,?)`
    ).run(owner, productSlug, variantId, selection.quantity));
  }

  return { ok: true, message: `${selection.product.name} added to cart` };
}

/**
 * Empties the basket.
 *
 * It is called once the order is in — after the money has been taken for
 * a card order, and straight away for a cash-on-delivery one. The basket
 * is emptied through the shop's own session, so one shopper cannot empty
 * another's.
 */
export async function clearCart(): Promise<void> {
  const owner = await cartOwnerKey();
  if (!owner) return;
  await getDb()
    .prepare("DELETE FROM cart_items WHERE session_id = ?")
    .run(owner);
}

/**
 * Empties the basket, unless the order was a basket bought outright.
 *
 * An order that came of "buy now" did not come out of the cart, so the
 * cart is left exactly as it was — that is the whole point of buying
 * one thing without touching the basket.
 */
export async function clearCartForOrder(orderId: string): Promise<void> {
  const row = (await getDb()
    .prepare("SELECT purchase_intent_id FROM orders WHERE id = ?")
    .get(orderId)) as Row | undefined;
  if (str(row?.purchase_intent_id)) return;
  await clearCart();
}

export async function getCartCount(): Promise<number> {
  const owner = await cartOwnerKey();
  if (!owner) return 0;
  const row = (await getDb()
    .prepare(
      "SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_items WHERE session_id = ?"
    )
    .get(owner)) as Row | undefined;
  return num(row?.n);
}
