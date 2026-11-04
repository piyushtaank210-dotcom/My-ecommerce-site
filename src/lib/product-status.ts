/**
 * Where a product sits in the catalogue's workflow.
 *
 * This module holds the vocabulary rather than the data, and imports nothing
 * — a client component is allowed to import it, but never anything that
 * reaches the database.
 *
 * The rule the shop runs on: a product is on the storefront only when its
 * status is `published` *and* the older `listed` flag is still true. The two
 * are kept apart on purpose. `listed` is the old delist switch and the shop
 * still honours it, so a product that was delisted before the status field
 * existed stays hidden exactly as it was.
 */
export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Anything unrecognised is treated as published, which is what the column
 *  defaults to — a product should never silently vanish because of a typo. */
export function parseProductStatus(value: unknown): ProductStatus {
  const s = String(value ?? "").trim().toLowerCase();
  return (PRODUCT_STATUSES as readonly string[]).includes(s)
    ? (s as ProductStatus)
    : "published";
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** What each status means, for the admin panel. */
export const PRODUCT_STATUS_DESCRIPTION: Record<ProductStatus, string> = {
  draft: "Not finished yet. Hidden from the shop.",
  published: "On sale in the shop.",
  archived: "Taken off sale. Kept for its history, restorable at any time.",
};

/** Tailwind classes for the status pill used in the catalogue table. */
export const PRODUCT_STATUS_PILL: Record<ProductStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-green-50 text-green-700",
  archived: "bg-amber-50 text-amber-700",
};

/**
 * True when the shop is allowed to show this product.
 *
 * Both conditions have to hold: the workflow says it is published, and the
 * older `listed` flag has not been switched off. A product that was delisted
 * before the status field existed stays hidden, exactly as it was.
 */
export function isOnSale(product: {
  listed: boolean;
  status: ProductStatus;
}): boolean {
  return product.listed && product.status === "published";
}
