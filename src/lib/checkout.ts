/**
 * The checkout.
 *
 * What the customer fills in at the checkout, and what the shop does
 * with it once it has been filled in.
 *
 * The details are checked here rather than in the browser, because the
 * browser is the customer's side of the conversation and cannot be
 * trusted with anything that decides what is owed.
 */

import { z } from "zod";
import { getCart } from "./cart";
import { createAddress } from "./addresses";
import { getCurrentUser } from "./auth";
import { createOrder, type CheckoutLine } from "./orders";
import { InventoryError } from "./inventory";

/** The gateway the shop takes payment through. */
export const GATEWAY_NAME = "razorpay";

/**
 * What the customer fills in.
 *
 * The payment method is either money taken now through the gateway, or
 * money taken when the goods arrive. Which way the money goes is not
 * decided here — the customer chooses that on the gateway's own
 * checkout, and the shop records what the gateway says it was.
 */
export const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid phone number."),
  address1: z.string().trim().min(5, "Enter your street address."),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter your city."),
  state: z.string().trim().min(2, "Select your state."),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "PIN code must be 6 digits."),
  notes: z.string().trim().optional(),
  paymentMethod: z.enum(["online", "cod"]),
  saveAddress: z.string().trim().optional(),
});

export type CheckoutDetails = z.infer<typeof checkoutSchema>;

/** The basket, as the order will be written. */
export type CheckoutBasket = {
  lines: CheckoutLine[];
  totals: { subtotal: number; shipping: number; total: number };
};

/**
 * The basket, as the order will be written.
 *
 * It is read on the server, and it is the only account of what is owed
 * that the shop trusts: the amount the customer is charged comes from
 * here and not from anything the browser says.
 */
export async function checkoutBasket(): Promise<CheckoutBasket | null> {
  const cart = await getCart();
  if (cart.lines.length === 0) return null;

  return {
    lines: cart.lines.map((l) => ({
      productSlug: l.product.slug,
      variantId: l.variant?.id ?? null,
      variantName: l.variant?.name ?? null,
      name: l.product.name,
      price: l.unitPrice,
      quantity: l.quantity,
    })),
    totals: {
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
  };
}

/**
 * Writes the order, and takes the stock for it.
 *
 * The stock is taken before any money is taken: a customer who has paid
 * for a console has to be able to have that console. An order that is
 * waiting on a payment says so, and waits for the money before it is
 * announced — the customer is not told their order is in until it is.
 */
export async function writeCheckoutOrder(
  details: CheckoutDetails,
  basket: CheckoutBasket,
  options: { orderId?: string; gateway?: string | null; notify?: boolean } = {}
): Promise<string> {
  const orderId = await createOrder(
    {
      name: details.name,
      email: details.email,
      phone: details.phone,
      address1: details.address1,
      address2: details.address2 || undefined,
      city: details.city,
      state: details.state,
      pincode: details.pincode,
      notes: details.notes || undefined,
      paymentMethod: options.gateway ? GATEWAY_NAME : "cod",
      paymentGateway: options.gateway ?? null,
      paymentReference: null,
    },
    basket.lines,
    basket.totals,
    { id: options.orderId, notify: options.notify }
  );

  // "Save this address" — keep it on the account for next time.
  //
  // It is a convenience, not part of the order, so a failure to save it
  // must not lose the order the customer has already placed.
  if (details.saveAddress) {
    const user = await getCurrentUser();
    if (user) {
      try {
        await createAddress(user.id, {
          label: "Checkout",
          name: details.name,
          phone: details.phone,
          address1: details.address1,
          address2: details.address2,
          city: details.city,
          state: details.state,
          pincode: details.pincode,
        });
      } catch (err) {
        console.error("[checkout] the address could not be saved:", err);
      }
    }
  }

  return orderId;
}

/**
 * Whether the stock ran out between the basket and the checkout.
 */
export function isStockError(err: unknown): err is InventoryError {
  return err instanceof InventoryError;
}

/**
 * Whether the order was already written.
 *
 * Two requests for the same checkout attempt arrive at the same moment
 * often enough — a double tap, a browser retry — and they both try to
 * write the same order. The second one is told the order is already
 * there, and that is not a fault: it is the same order.
 *
 * PostgreSQL says so with the code for a unique-constraint violation;
 * SQLite says it in the message.
 */
export function isDuplicateOrderError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23505") return true;
  return /UNIQUE constraint failed|PRIMARY KEY must be unique/i.test(
    e?.message ?? ""
  );
}
