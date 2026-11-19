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
import { getCurrentUser, type User } from "./auth";
import { createOrder, type CheckoutLine } from "./orders";
import { InventoryError } from "./inventory";
import {
  assignIntent,
  buildIntentBasket,
  findIntent,
  type PurchaseLine,
} from "./purchase";
import {
  CHECKOUT_FIELD_RULES,
  checkCheckoutField,
  type CheckoutFieldName,
} from "./checkout-fields";

/**
 * One of the fields the customer fills in, held to the shop's own rule.
 *
 * The rule itself lives in `checkout-fields`, apart from the rest of
 * the checkout, so that the form in the browser can hold exactly the
 * same one. A customer is told what is wrong with a field by the form,
 * and the shop has to agree with the form about it — otherwise the
 * form would let a customer type something the shop would refuse.
 */
function checkoutField(name: CheckoutFieldName) {
  const rule = CHECKOUT_FIELD_RULES[name];
  return z
    .string({ error: rule.required })
    .trim()
    .superRefine((value, ctx) => {
      const problem = checkCheckoutField(name, value);
      if (problem) {
        ctx.addIssue({ code: "custom", message: problem.message });
      }
    });
}

/**
 * What the customer fills in.
 *
 * The rules themselves live apart, in `checkout-fields.ts`, because the
 * form in the browser has to hold the same ones — a customer is told
 * what is wrong with a field by the form, and the shop has to agree
 * with the form about it.
 *
 * The form checks first, so that the customer is told straight away;
 * the shop checks again anyway, because the browser is the customer's
 * side of the conversation and cannot be trusted with anything that
 * decides what is owed.
 */
export const checkoutSchema = z.object({
  name: checkoutField("name"),
  email: checkoutField("email"),
  phone: checkoutField("phone"),
  address1: checkoutField("address1"),
  address2: z.string().trim().optional(),
  city: checkoutField("city"),
  state: checkoutField("state"),
  pincode: checkoutField("pincode"),
  notes: z.string().trim().optional(),
  paymentMethod: z.enum(["online", "cod"]),
  saveAddress: z.string().trim().optional(),
});

export type CheckoutDetails = z.infer<typeof checkoutSchema>;

/** The gateway the shop takes payment through. */
export const GATEWAY_NAME = "razorpay";

/** The basket, as the order will be written. */
export type CheckoutBasket = {
  lines: CheckoutLine[];
  totals: { subtotal: number; shipping: number; total: number };
};

/**
 * What the checkout is showing.
 *
 * It is either the customer's cart, or the one thing they pressed "buy
 * now" for. A basket bought that way is not in the cart and does not
 * touch it — the cart is still exactly as it was when they pressed the
 * button.
 */
export type CheckoutView = {
  /** Which of the two baskets this is. */
  source: "cart" | "buy-now";
  lines: PurchaseLine[];
  totals: { subtotal: number; shipping: number; total: number };
  itemCount: number;
  savings: number;
  /** Why the basket cannot be used, when it cannot. */
  problem: string | null;
};

const NO_TOTALS = { subtotal: 0, shipping: 0, total: 0 };

/**
 * The basket the checkout is working on.
 *
 * It is read on the server, and it is the only account of what is owed
 * that the shop trusts: the amount the customer is charged comes from
 * here and not from anything the browser says.
 *
 * A basket bought with "buy now" is read from the purchase the customer
 * started, and its price is worked out from the catalogue at that
 * moment — the price in the row is never used, because the price in the
 * row is not the price.
 */
export async function checkoutView(
  buyToken?: string | null,
  knownUser?: User | null
): Promise<CheckoutView> {
  if (buyToken) {
    const empty: CheckoutView = {
      source: "buy-now",
      lines: [],
      totals: NO_TOTALS,
      itemCount: 0,
      savings: 0,
      problem: "That basket is no longer available.",
    };

    const intent = await findIntent(buyToken);
    if (!intent) return empty;

    // A basket belongs to the account that started it.
    const user = knownUser === undefined ? await getCurrentUser() : knownUser;
    if (intent.user_id !== null && intent.user_id !== user?.id) {
      return {
        ...empty,
        problem: "That basket belongs to another account.",
      };
    }

    // A basket that was started before the customer signed in belongs to
    // nobody; the first account to reach it takes it over.
    if (intent.user_id === null && user) {
      await assignIntent(intent.id, user.id);
      intent.user_id = user.id;
    }

    const built = await buildIntentBasket(intent);
    if (!built.ok) return { ...empty, problem: built.reason };

    return {
      source: "buy-now",
      lines: built.basket.lines,
      totals: {
        subtotal: built.basket.subtotal,
        shipping: built.basket.shipping,
        total: built.basket.total,
      },
      itemCount: built.basket.itemCount,
      savings: built.basket.savings,
      problem: null,
    };
  }

  const cart = await getCart();
  const lines: PurchaseLine[] = cart.lines.map((l) => ({
    productSlug: l.product.slug,
    variantId: l.variant?.id ?? null,
    variantName: l.variant?.name ?? null,
    name: l.product.name,
    image: l.product.image ?? null,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    unitMrp: l.unitMrp,
    lineTotal: l.lineTotal,
  }));

  return {
    source: "cart",
    lines,
    totals: {
      subtotal: cart.subtotal,
      shipping: cart.shipping,
      total: cart.total,
    },
    itemCount: cart.itemCount,
    savings: cart.savings,
    problem: null,
  };
}

/**
 * The basket, as the order will be written.
 *
 * It is read on the server, and it is the only account of what is owed
 * that the shop trusts: the amount the customer is charged comes from
 * here and not from anything the browser says.
 */
export async function checkoutBasket(
  buyToken?: string | null,
  knownUser?: User | null
): Promise<CheckoutBasket | null> {
  const view = await checkoutView(buyToken, knownUser);
  if (view.problem || view.lines.length === 0) return null;

  return {
    lines: view.lines.map((l) => ({
      productSlug: l.productSlug,
      variantId: l.variantId,
      variantName: l.variantName,
      name: l.name,
      price: l.unitPrice,
      quantity: l.quantity,
    })),
    totals: view.totals,
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
  options: {
    orderId?: string;
    gateway?: string | null;
    notify?: boolean;
    /** The purchase this order came of, when it was bought outright. */
    purchaseIntentId?: string | null;
  } = {}
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
    {
      id: options.orderId,
      notify: options.notify,
      purchaseIntentId: options.purchaseIntentId,
    }
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
