"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Loader2, Check, Zap } from "lucide-react";
import type { ProductWithVariants, Variant } from "@/lib/types";
import { money, discountPct } from "@/lib/format";
import { sellingPrice } from "@/lib/pricing";
import { addToCartAction, buyNowAction } from "@/lib/purchase-actions";
import { backordersAllowed, type BackorderPolicy } from "@/lib/variations";
import { SIGN_IN_REQUIRED } from "@/lib/sign-in";
import { toast } from "./Toaster";

/**
 * The quantity, and the two ways of buying the thing.
 *
 * The option has already been chosen on the page — this is where it is
 * confirmed, and where the shopper finds out if it cannot be bought.
 *
 * "Buy now" goes straight to the checkout with this one thing in it and
 * leaves the cart alone. "Add to cart" puts it in the basket to be
 * bought later. Both of them need an account: the cart belongs to the
 * customer, so the shop asks for a sign-in before either of them goes
 * ahead.
 */
export function ProductPurchase({
  product,
  variant,
  backorderPolicy,
  signedIn,
}: {
  product: ProductWithVariants;
  /** The option that was chosen, when the product has options. */
  variant: Variant | null;
  backorderPolicy: BackorderPolicy;
  /** Whether the visitor is signed in. */
  signedIn: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  /** Which of the two buttons is working, if one is. */
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const [added, setAdded] = useState(false);
  /**
   * The guard that stops a second click.
   *
   * The state above is not quick enough on its own: two clicks in the
   * same moment both find the button still enabled, because the page has
   * not been drawn again between them. This is set the moment a click
   * arrives, so the second one is turned away.
   */
  const working = useRef(false);

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

  /**
   * Asks the customer to sign in, and takes them there.
   *
   * The toast is raised the moment the button is pressed, before the shop
   * has even been asked, so that the customer is told what is happening
   * while it is happening. The move to the sign-in page waits a moment
   * so that the toast can be read.
   */
  function askToSignIn(loginUrl: string | undefined) {
    if (!loginUrl) {
      working.current = false;
      setBusy(null);
      toast(SIGN_IN_REQUIRED, "error");
      return;
    }
    // The guard stays on: the page is about to change.
    window.setTimeout(() => router.push(loginUrl), 1200);
  }

  /** The button is free again. */
  function free() {
    working.current = false;
    setBusy(null);
  }

  async function addToCart() {
    if (working.current) return;
    working.current = true;
    setBusy("cart");

    const guest = !signedIn;
    if (guest) toast(SIGN_IN_REQUIRED, "info");

    let res;
    try {
      res = await addToCartAction(product.slug, variant?.id ?? null, qty);
    } catch {
      free();
      toast(
        "We could not reach the shop. Please check your connection and try again.",
        "error"
      );
      return;
    }

    // The shop asks for a sign-in before anything goes in the cart.
    if (res.needsLogin) {
      if (!guest) toast(SIGN_IN_REQUIRED, "info");
      askToSignIn(res.loginUrl);
      return;
    }

    free();
    if (res.ok) {
      setAdded(true);
      toast(res.message, "success");
      window.setTimeout(() => setAdded(false), 1800);
    } else {
      toast(res.message, "error");
    }
  }

  async function buyNow() {
    if (working.current) return;
    working.current = true;
    setBusy("buy");

    const guest = !signedIn;
    if (guest) toast(SIGN_IN_REQUIRED, "info");

    let res;
    try {
      res = await buyNowAction({
        productSlug: product.slug,
        variantId: variant?.id ?? null,
        quantity: qty,
      });
    } catch {
      free();
      toast(
        "We could not reach the shop. Please check your connection and try again.",
        "error"
      );
      return;
    }

    // The shop asks for a sign-in before the purchase goes ahead.
    if (res.needsLogin) {
      if (!guest) toast(SIGN_IN_REQUIRED, "info");
      askToSignIn(res.loginUrl);
      return;
    }

    free();
    if (!res.ok || !res.checkoutUrl) {
      toast(
        res.message ?? "We could not start the purchase. Please try again.",
        "error"
      );
      return;
    }

    // Straight to the checkout, with this one thing in it. The cart is
    // not touched.
    router.push(res.checkoutUrl);
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
            className="tap-lg grid w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35"
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
            className="tap-lg grid w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35"
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

      {/* The two ways of buying it. "Buy now" is the one that matters, so
          it is the filled one; the cart is the other way, and it stays
          clear of the way through. */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={buyNow}
          disabled={busy !== null || !buyable}
          className="btn btn-primary btn-lg w-full"
        >
          {busy === "buy" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening the checkout…
            </>
          ) : !buyable ? (
            "Out of stock"
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Buy now
            </>
          )}
        </button>

        <button
          type="button"
          onClick={addToCart}
          disabled={busy !== null || !buyable}
          className="btn btn-outline btn-lg w-full"
        >
          {busy === "cart" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding…
            </>
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
      </div>

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
