/**
 * What a product sells for.
 *
 * A product has a price and, sometimes, a sale price. The sale price is the
 * one that counts while it is set: it is what the customer pays and what the
 * order is recorded at. Every place that shows or charges a price goes
 * through here, so a card, a basket and an order can never disagree.
 *
 * This module imports nothing, so a client component may use it.
 */

export type Priced = {
  price: number;
  sale_price: number | null;
};

/** The price a product sells for: the sale price when there is one. */
export function sellingPrice(product: Priced): number {
  const sale = product.sale_price;
  return typeof sale === "number" && sale > 0 ? sale : product.price;
}

/** True when the product is on a promotional price. */
export function isOnSalePrice(product: Priced): boolean {
  const sale = product.sale_price;
  return typeof sale === "number" && sale > 0 && sale < product.price;
}
