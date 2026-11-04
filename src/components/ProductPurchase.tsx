"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Loader2, Check } from "lucide-react";
import type { ProductWithVariants, Variant } from "@/lib/types";
import { money, discountPct } from "@/lib/format";
import { sellingPrice } from "@/lib/pricing";
import { addToCartAction } from "@/lib/actions";
import { backordersAllowed, type BackorderPolicy } from "@/lib/variations";
import { toast } from "./Toaster";

/**
 * The quantity, and the button that puts the thing in the basket.
 *
 * The option has already been chosen on the page — this is where it is
 * confirmed, and where the shopper finds out if it cannot be bought.
 */
export function ProductPurchase({
  product,
  variant,
  backorderPolicy,
}: {
  product: ProductWithVariants;
  /** The option that was chosen, when the product has options. */
  variant: Variant | null;
  backorderPolicy: BackorderPolicy;
}) {
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);

  const allowBackorder = backordersAllowed(backorderPolicy);

  // A variant is priced on its own. A product without one sells for its
  // sale price when it has one, and for its price otherwise.
  const price = variant ? variant.price : sellingPrice(product);
  const mrp = variant ? variant.mrp : product.mrp;
  const off = discountPct(mrp, price);
  const stock = variant ? variant.stock : product.stock;

  // The shelf may be empty, but the store may still take the order.
  const buyable = stock > 0 || allowBackorder;

  const maximum = useMemo(
    () => Math.max(1, Math.min(stock || 10, 10)),
    [stock]
  );

  async function addToCart() {
    setPending(true);
    const res = await addToCartAction(product.slug, variant?.id ?? null, qty);
    setPending(false);
    if (res.ok) {
      setAdded(true);
      toast(res.message, "success");
      window.setTimeout(() => setAdded(false), 1800);
    } else {
      toast(res.message, "error");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[13px] font-medium text-gray-600">Quantity</span>
        <div className="flex h-10 items-center rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
            className="grid h-10 w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="tnum w-8 text-center text-[14px] font-semibold text-ink">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(maximum, q + 1))}
            disabled={qty >= maximum}
            aria-label="Increase quantity"
            className="grid h-10 w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {stock > 0 && stock <= 12 ? (
          <span className="text-[13px] font-medium text-amber-600">
            Only {stock} left
          </span>
        ) : stock <= 0 ? (
          <span className="text-[13px] font-medium text-gray-500">
            {allowBackorder ? "Available on backorder" : "Sold out"}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={addToCart}
        disabled={pending || !buyable}
        className={`btn btn-lg w-full ${added ? "btn-outline" : "btn-primary"}`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : added ? (
          <>
            <Check className="h-4 w-4" />
            Added to cart
          </>
        ) : !buyable ? (
          "Out of stock"
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </>
        )}
      </button>

      {!buyable && (
        <p className="mt-2 text-center text-[12.5px] text-gray-500">
          This option is not on the shelf. The store does not take orders for
          things it does not have.
        </p>
      )}

      {buyable && stock <= 0 && (
        <p className="mt-2 text-center text-[12.5px] text-gray-500">
          This option is not on the shelf, but the store takes backorders — it
          will be ordered in.
        </p>
      )}

      <p className="mt-3 text-center text-[12.5px] text-gray-500">
        {price < mrp && (
          <>
            You save{" "}
            <span className="tnum font-semibold text-green-600">
              {money(mrp - price)}
            </span>{" "}
            ({off}% off)
          </>
        )}
      </p>
    </div>
  );
}
