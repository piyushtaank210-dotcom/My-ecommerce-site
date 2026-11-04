import { getDb, parseJson } from "./db";
import { readSessionId } from "./session";
import { shippingFor } from "./format";
import { sellingPrice } from "./pricing";
import { mapProduct, PRODUCT_STOCK_COLUMNS_SQL } from "./queries";
import type { Cart, CartLine, Variant } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

export async function getCart(): Promise<Cart> {
  const sessionId = await readSessionId();
  const empty: Cart = {
    lines: [],
    itemCount: 0,
    subtotal: 0,
    savings: 0,
    shipping: 0,
    total: 0,
  };
  if (!sessionId) return empty;

  const db = getDb();
  const rows = db
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
    .all(sessionId) as Row[];

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

export async function getCartCount(): Promise<number> {
  const sessionId = await readSessionId();
  if (!sessionId) return 0;
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_items WHERE session_id = ?"
    )
    .get(sessionId) as Row | undefined;
  return num(row?.n);
}
