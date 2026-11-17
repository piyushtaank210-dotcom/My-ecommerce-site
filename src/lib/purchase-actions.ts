"use server";

import { revalidatePath } from "next/cache";
import { addToCart } from "./cart";
import { beginPurchase } from "./purchase";
import { SIGN_IN_REQUIRED, signInUrl } from "./sign-in";

/**
 * What a purchase button has to say.
 *
 * `needsLogin` is the one that matters: it says the shop has asked the
 * customer to sign in before going on, and `loginUrl` is where they are
 * to be sent. The message is the one the toast shows.
 */
export type PurchaseResult = {
  ok: boolean;
  message?: string;
  /** The customer has to sign in before this can go on. */
  needsLogin?: boolean;
  /** Where they are to be sent to sign in. */
  loginUrl?: string;
  /** The checkout, when the purchase is ready for it. */
  checkoutUrl?: string;
};

/**
 * Buys one product, without going near the cart.
 *
 * The basket is a row of its own: the customer's cart is left exactly as
 * it was, and the checkout is given the one thing they chose. The price
 * is worked out from the catalogue when the basket is read, so what they
 * are charged is the shop's own figure and not the one the browser sent.
 */
export async function buyNowAction(input: {
  productSlug: string;
  variantId: string | null;
  quantity: number;
}): Promise<PurchaseResult> {
  const begun = await beginPurchase({
    kind: "buy-now",
    productSlug: input.productSlug,
    variantId: input.variantId,
    quantity: input.quantity,
    nextPath: null,
  });
  if (!begun.ok) return { ok: false, message: begun.message };

  const { intent, user } = begun;
  if (!intent) {
    return { ok: false, message: "We could not start the purchase. Please try again." };
  }
  const checkoutUrl = `/checkout?buy=${intent.id}`;

  // A guest is sent to sign in first. What they chose is remembered, and
  // they are taken to the checkout with it once they are through.
  if (!user) {
    return {
      ok: false,
      needsLogin: true,
      message: SIGN_IN_REQUIRED,
      loginUrl: signInUrl(checkoutUrl),
    };
  }

  return { ok: true, checkoutUrl };
}

/**
 * Puts a product in the customer's cart.
 *
 * The cart belongs to the account, so a customer has to be signed in
 * before anything is put in it. A guest who presses the button is told
 * so and sent to the sign-in page, and the thing they chose is put in
 * the cart for them once they are through.
 */
export async function addToCartAction(
  productSlug: string,
  variantId: string | null,
  quantity: number
): Promise<PurchaseResult> {
  const begun = await beginPurchase({
    kind: "add-to-cart",
    productSlug,
    variantId,
    quantity,
    nextPath: `/product/${productSlug}`,
  });
  if (!begun.ok) return { ok: false, message: begun.message };

  const { user } = begun;
  if (!user) {
    return {
      ok: false,
      needsLogin: true,
      message: SIGN_IN_REQUIRED,
      loginUrl: signInUrl(`/product/${productSlug}`),
    };
  }

  const res = await addToCart(user.id, productSlug, variantId, quantity);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
