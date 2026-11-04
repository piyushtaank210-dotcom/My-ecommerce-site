/**
 * Stock, and what counts as low.
 *
 * A product with variants is sold through those variants, so the stock a
 * customer can actually buy is the variants' stock added up — not the
 * product's own column. The back office shows and filters on that number,
 * so what an admin sees in the catalogue is what the shop can really sell.
 *
 * This module holds no data and imports nothing, so a client component is
 * free to use it.
 */

/** The threshold a product starts with when nobody has set one. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export type StockLevel = "out" | "low" | "in";

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  out: "Out of stock",
  low: "Low stock",
  in: "In stock",
};

/** The pill each level is shown in. */
export const STOCK_LEVEL_TONE: Record<StockLevel, string> = {
  out: "bg-red-50 text-red-700",
  low: "bg-amber-50 text-amber-700",
  in: "bg-green-50 text-green-700",
};

/**
 * Which band a stock number falls into.
 *
 * The threshold is the number at or below which the stock is called low —
 * five by default, but every product and every option can carry its own.
 */
export function stockLevel(
  stock: number,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD
): StockLevel {
  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  return "in";
}

/**
 * The worst of a set of levels.
 *
 * "out" beats "low" beats "in", so a product with one option sold out is
 * never counted as comfortably in stock.
 */
export function worstStockLevel(levels: StockLevel[]): StockLevel {
  if (levels.includes("out")) return "out";
  if (levels.includes("low")) return "low";
  return "in";
}

/**
 * The level of a whole product.
 *
 * A product with options is low when the stock it can sell has reached the
 * product's own threshold, or when one of its options has reached that
 * option's own — an option that has run out makes the product low even
 * while the others are still on the shelf. This is the same rule the
 * catalogue's stock filter uses, so the two cannot disagree.
 */
export function productStockLevel(product: {
  stock: number;
  low_stock_threshold: number;
  variants: { stock: number; low_stock_threshold: number }[];
}): StockLevel {
  if (!product.variants.length) {
    return stockLevel(product.stock, product.low_stock_threshold);
  }
  const sellable = product.variants.reduce((sum, v) => sum + v.stock, 0);
  if (sellable <= 0) return "out";
  if (sellable <= product.low_stock_threshold) return "low";
  if (
    product.variants.some((v) => v.stock <= v.low_stock_threshold)
  ) {
    return "low";
  }
  return "in";
}

/**
 * The stock a product can actually sell.
 *
 * A product with variants sells through them, so its own stock column is
 * not what reaches a customer. A product without variants sells from its
 * own stock.
 */
export function effectiveStock(product: {
  stock: number;
  variants: { stock: number }[];
}): number {
  if (!product.variants.length) return product.stock;
  return product.variants.reduce((sum, v) => sum + v.stock, 0);
}

/**
 * The stock a product can actually sell, from a product row.
 *
 * The listing already works it out — the options' stock added up — so the
 * cards and the search results agree with the product page.
 */
export function sellableStock(product: {
  stock: number;
  sellable_stock?: number;
}): number {
  return typeof product.sellable_stock === "number"
    ? product.sellable_stock
    : product.stock;
}

/* ------------------------------------------------------------- movements */

/** What kind of movement a row in the inventory history is. */
export const MOVEMENT_TYPES = [
  "sale",
  "resale",
  "restock",
  "return",
  "adjustment",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  sale: "Sold",
  resale: "Order reopened",
  restock: "Order cancelled",
  return: "Return verified",
  adjustment: "Adjusted",
};

export const MOVEMENT_TONE: Record<MovementType, string> = {
  sale: "bg-blue-50 text-blue-700",
  resale: "bg-blue-50 text-blue-700",
  restock: "bg-green-50 text-green-700",
  return: "bg-green-50 text-green-700",
  adjustment: "bg-gray-100 text-gray-700",
};

/* --------------------------------------------------------------- reasons */

/**
 * Where an order line's stock stands, and what that means.
 *
 * `settled` is what an order from before the stock was tracked looks like:
 * there is nothing to give back, because the count already includes it.
 */
export const STOCK_STATE_LABEL: Record<string, string> = {
  deducted: "Stock taken",
  restocked: "Back in stock",
  awaiting_check: "Awaiting a check",
  returned: "Returned to stock",
  written_off: "Not restocked",
  settled: "Settled",
};

/**
 * The reasons a person can give when they change a stock level by hand.
 */

/**
 * Why somebody changed a stock level by hand.
 *
 * The list is a starting point, not a straitjacket: "Other" asks for the
 * detail in the note, and that detail is what ends up in the history.
 */
export const STOCK_REASONS = [
  "Stock received",
  "Stock take correction",
  "Damaged in the warehouse",
  "Returned to stock",
  "Supplier recall",
  "Mis-pick corrected",
  "Opening balance",
  "Other",
] as const;

export type StockReason = (typeof STOCK_REASONS)[number];

/** The reason that means the note carries the real explanation. */
export const OTHER_REASON = "Other";

/**
 * How a stock level is changed by hand.
 *
 * "set" puts it at a number, "add" and "remove" move it by one.
 */
export const ADJUST_MODES = ["set", "add", "remove"] as const;

export type AdjustMode = (typeof ADJUST_MODES)[number];

export const ADJUST_MODE_LABEL: Record<AdjustMode, string> = {
  set: "Set to",
  add: "Add",
  remove: "Remove",
};
