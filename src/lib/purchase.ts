/**
 * A purchase in progress.
 *
 * Two things share this module, because they are the same thing seen from
 * two sides.
 *
 * The first is "buy now": a basket of its own that is not the cart. The
 * customer presses the button on the product page and goes straight to
 * the checkout with that one product in it, and their cart is left exactly
 * as it was. The row records what is being bought — the product, the
 * option, how many — and never a price: the price is worked out from the
 * catalogue when the basket is read, because a price the browser wrote
 * down is not a price.
 *
 * The second is a purchase that is waiting for a sign-in. A guest who
 * presses "buy now" or "add to cart" is sent to the sign-in page, and this
 * row is what they come back to. It is claimed once: the claim is a single
 * statement, so two sign-ins arriving at the same moment cannot both have
 * it, and the thing they asked for is done once and once only.
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { getProduct } from "./queries";
import { getCurrentUser, type User } from "./auth";
import { sellingPrice } from "./pricing";
import { shippingFor } from "./format";
import { getBackorderPolicy } from "./settings";
import { backordersAllowed } from "./variations";
import { isOnSale } from "./product-status";
import type { ProductWithVariants, Variant } from "./types";

/** The cookie that remembers the purchase waiting for a sign-in. */
const COOKIE = "pf_purchase";

/**
 * How long a purchase may wait for a sign-in before it is forgotten.
 *
 * Twenty minutes is long enough to type an address into a password
 * manager and short enough that a purchase is not still waiting for
 * somebody the next morning.
 */
export const PENDING_MINUTES = 20;

/** What the customer asked for. */
export type PurchaseKind = "buy-now" | "add-to-cart";

export type PurchaseIntent = {
  id: string;
  kind: PurchaseKind;
  /** The account it belongs to, once one is known. */
  user_id: number | null;
  product_slug: string;
  variant_id: string | null;
  quantity: number;
  /** Where to go once the purchase has been carried out. */
  next_path: string | null;
  status: "pending" | "claimed";
  created_at: string;
  claimed_at: string | null;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

function mapIntent(r: Row): PurchaseIntent {
  return {
    id: str(r.id),
    kind: str(r.kind) === "add-to-cart" ? "add-to-cart" : "buy-now",
    user_id: r.user_id === null || r.user_id === undefined ? null : num(r.user_id),
    product_slug: str(r.product_slug),
    variant_id: strOrNull(r.variant_id),
    quantity: num(r.quantity),
    next_path: strOrNull(r.next_path),
    status: str(r.status) === "claimed" ? "claimed" : "pending",
    created_at: str(r.created_at),
    claimed_at: strOrNull(r.claimed_at),
  };
}

const COLUMNS =
  "id, kind, user_id, product_slug, variant_id, quantity, next_path, status, created_at, claimed_at";

/* ------------------------------------------------------------------ write */

/**
 * Records a purchase the customer has started.
 *
 * The purchases that are finished with are let go: the ones that have
 * been bought, and the ones nobody ever came back for. A purchase that
 * is waiting for a sign-in is only worth keeping for as long as the
 * sign-in page would keep it — and a purchase that has become a basket
 * is kept for a good while longer, so that a customer who is slow at the
 * checkout does not find their basket gone.
 */
export async function createIntent(input: {
  kind: PurchaseKind;
  productSlug: string;
  variantId: string | null;
  quantity: number;
  userId: number | null;
  nextPath?: string | null;
}): Promise<PurchaseIntent> {
  const db = getDb();
  const id = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - PENDING_MINUTES * 60_000).toISOString();
  const stale = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  // A purchase nobody signed in for is not worth keeping for long: the
  // sign-in page has forgotten it by then.
  await db
    .prepare(
      "DELETE FROM purchase_intents WHERE status = 'pending' AND user_id IS NULL AND created_at < ?"
    )
    .run(cutoff);
  // The rest is kept for a day — long enough for a customer to sit and
  // think, and short enough that the table does not fill up.
  await db
    .prepare("DELETE FROM purchase_intents WHERE created_at < ?")
    .run(stale);

  await db
    .prepare(
      `INSERT INTO purchase_intents
         (id, kind, user_id, product_slug, variant_id, quantity, next_path, status, created_at)
       VALUES (?,?,?,?,?,?,?,'pending',?)`
    )
    .run(
      id,
      input.kind,
      input.userId,
      input.productSlug,
      input.variantId,
      input.quantity,
      input.nextPath ?? null,
      now
    );

  return {
    id,
    kind: input.kind,
    user_id: input.userId,
    product_slug: input.productSlug,
    variant_id: input.variantId,
    quantity: input.quantity,
    next_path: input.nextPath ?? null,
    status: "pending",
    created_at: now,
    claimed_at: null,
  };
}

/**
 * Takes a purchase for an account, once.
 *
 * The claim is one statement, and it only takes a row that is still
 * waiting, that belongs to nobody else, and that has not been waiting
 * too long. Two requests arriving at the same moment — a double tap, a
 * browser retry — cannot both have it: the second one finds the row
 * already claimed and is told no.
 */
export async function claimIntent(
  id: string,
  userId: number
): Promise<PurchaseIntent | null> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - PENDING_MINUTES * 60_000).toISOString();
  const row = await getDb()
    .prepare(
      `UPDATE purchase_intents
          SET status = 'claimed', claimed_at = ?, user_id = COALESCE(user_id, ?)
        WHERE id = ? AND status = 'pending' AND (user_id IS NULL OR user_id = ?)
          AND created_at > ?
        RETURNING ${COLUMNS}`
    )
    .get(now, userId, id, userId, cutoff);
  return row ? mapIntent(row) : null;
}

/**
 * Gives a purchase to an account, if it has not been given to one.
 *
 * A basket that was started before the customer signed in belongs to
 * nobody; the first account to reach it takes it over.
 */
export async function assignIntent(
  id: string,
  userId: number
): Promise<void> {
  await getDb()
    .prepare(
      "UPDATE purchase_intents SET user_id = ? WHERE id = ? AND user_id IS NULL"
    )
    .run(userId, id);
}

/** The purchase, if it is there. */
export async function findIntent(id: string): Promise<PurchaseIntent | null> {
  const row = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM purchase_intents WHERE id = ?`)
    .get(id);
  return row ? mapIntent(row) : null;
}

/* ------------------------------------------------------------- the cookie */

/** The purchase waiting for a sign-in, if there is one. */
export async function readPendingIntentId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/** Remembers the purchase waiting for a sign-in. */
export async function writePendingIntentId(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_MINUTES * 60,
  });
}

/** Forgets the purchase waiting for a sign-in. */
export async function clearPendingIntentId(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/* ------------------------------------------------------------- the basket */

/** One line of a purchase, as the customer will see it. */
export type PurchaseLine = {
  productSlug: string;
  variantId: string | null;
  variantName: string | null;
  name: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
};

/** A purchase, worked out from the catalogue. */
export type PurchaseBasket = {
  lines: PurchaseLine[];
  itemCount: number;
  subtotal: number;
  savings: number;
  shipping: number;
  total: number;
};

export type BasketResult =
  | { ok: true; basket: PurchaseBasket }
  | { ok: false; reason: string };

/**
 * What the customer chose, checked against the shop.
 *
 * The product has to be there, the option has to belong to it, and the
 * quantity has to be something the shop can actually sell. The prices
 * that come back are the shop's own.
 */
export type Selection = {
  product: ProductWithVariants;
  variant: Variant | null;
  quantity: number;
  price: number;
  mrp: number;
  stock: number;
  /** Whether the shop takes orders for things it does not have. */
  allowBackorder: boolean;
};

export async function checkSelection(
  productSlug: string,
  variantId: string | null,
  quantity: number
): Promise<{ ok: true; selection: Selection } | { ok: false; message: string }> {
  const product = await getProduct(productSlug);
  if (!product) return { ok: false, message: "Product not found." };

  const variant = variantId
    ? product.variants.find((v) => v.id === variantId) ?? null
    : null;

  // A product with options is stocked by its options, so a purchase
  // without one has nothing to be counted against.
  if (product.variants.length > 0 && !variant) {
    return { ok: false, message: "Choose an option first." };
  }

  const available = variant ? variant.stock : product.stock;
  const qty = Math.max(1, Math.min(quantity || 1, 10));

  // A shopper may only buy what is on the shelf — unless the store takes
  // backorders, in which case the missing units are ordered in.
  const allowBackorder = backordersAllowed(await getBackorderPolicy());

  if (available <= 0 && !allowBackorder) {
    return { ok: false, message: "That option is out of stock." };
  }
  if (qty > available && !allowBackorder) {
    return { ok: false, message: `Only ${available} left in stock.` };
  }

  return {
    ok: true,
    selection: {
      product,
      variant,
      quantity: qty,
      price: variant ? variant.price : sellingPrice(product),
      mrp: variant ? variant.mrp : product.mrp,
      stock: available,
      allowBackorder,
    },
  };
}

/**
 * The purchase, as a basket the checkout can be drawn from.
 *
 * Everything here is read from the catalogue when the basket is asked
 * for, so a price that has changed since the customer pressed the button
 * is the price they are shown, and a product that has been taken off the
 * shop floor is refused rather than sold.
 */
export async function buildIntentBasket(
  intent: PurchaseIntent
): Promise<BasketResult> {
  const product = await getProduct(intent.product_slug);
  if (!product) {
    return { ok: false, reason: "That product is no longer in the shop." };
  }
  if (!isOnSale(product)) {
    return { ok: false, reason: "That product is no longer on sale." };
  }

  const variant = intent.variant_id
    ? product.variants.find((v) => v.id === intent.variant_id) ?? null
    : null;
  if (product.variants.length > 0 && !variant) {
    return { ok: false, reason: "Choose an option first." };
  }

  const price = variant ? variant.price : sellingPrice(product);
  const mrp = variant ? variant.mrp : product.mrp;
  const stock = variant ? variant.stock : product.stock;
  const quantity = Math.max(1, Math.min(intent.quantity || 1, 10));

  const allowBackorder = backordersAllowed(await getBackorderPolicy());
  if (stock <= 0 && !allowBackorder) {
    return { ok: false, reason: "That option is out of stock." };
  }
  if (quantity > stock && !allowBackorder) {
    return { ok: false, reason: `Only ${stock} left in stock.` };
  }

  const line: PurchaseLine = {
    productSlug: product.slug,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    name: product.name,
    image: variant?.image ?? product.image ?? null,
    quantity,
    unitPrice: price,
    unitMrp: mrp,
    lineTotal: price * quantity,
  };

  const subtotal = line.lineTotal;
  const shipping = shippingFor(subtotal);

  return {
    ok: true,
    basket: {
      lines: [line],
      itemCount: quantity,
      subtotal,
      savings: mrp * quantity - subtotal,
      shipping,
      total: subtotal + shipping,
    },
  };
}

/* --------------------------------------------------------------- the flow */

/**
 * Starts a purchase, and says whether the customer has to sign in first.
 *
 * What is bought is checked against the shop before anything is written
 * down: the product has to be there, the option has to belong to it and
 * the quantity has to be something the shop can sell.
 */
export async function beginPurchase(input: {
  kind: PurchaseKind;
  productSlug: string;
  variantId: string | null;
  quantity: number;
  nextPath: string | null;
}): Promise<
  | {
      ok: true;
      /** The purchase, when there is one to come back to. */
      intent: PurchaseIntent | null;
      user: User | null;
    }
  | { ok: false; message: string }
> {
  const checked = await checkSelection(
    input.productSlug,
    input.variantId,
    input.quantity
  );
  if (!checked.ok) return { ok: false, message: checked.message };

  const user = await getCurrentUser();

  // A purchase bought outright is a row of its own — it is the basket the
  // checkout will use. A purchase that is only being added to the cart
  // needs a row only while it is waiting for a sign-in.
  if (input.kind === "add-to-cart" && user) {
    return { ok: true, intent: null, user };
  }

  const intent = await createIntent({
    kind: input.kind,
    productSlug: input.productSlug,
    variantId: checked.selection.variant?.id ?? null,
    quantity: checked.selection.quantity,
    userId: user?.id ?? null,
    nextPath: input.nextPath,
  });

  // A guest is sent to sign in first. The purchase is remembered in a
  // cookie, and it is carried out once they are through.
  if (!user) await writePendingIntentId(intent.id);

  return { ok: true, intent, user };
}
