import Link from "next/link";
import type { Product } from "@/lib/types";
import { sellableStock } from "@/lib/stock";
import { AddToCartButton } from "./AddToCartButton";

/**
 * The button under a product card.
 *
 * A product with options is stocked one option at a time — a 1TB console
 * and a 2TB console are counted separately — so there is no single thing
 * to put in the basket. The card sends the shopper to the product page to
 * pick the option, rather than choosing one on their behalf and showing a
 * price they never agreed to.
 */
export function ProductCardAction({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  // What the shop can really sell: the options' stock added up, or the
  // product's own count when it has no options.
  const outOfStock = sellableStock(product) <= 0;

  if (outOfStock) {
    return (
      <button type="button" disabled className={className}>
        Out of stock
      </button>
    );
  }

  if (product.option_count > 0) {
    return (
      <Link href={`/product/${product.slug}`} className={className}>
        Choose an option
      </Link>
    );
  }

  return (
    <AddToCartButton
      productSlug={product.slug}
      className={className}
      label="Add to cart"
    />
  );
}
