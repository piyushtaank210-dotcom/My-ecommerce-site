import { revalidatePath } from "next/cache";
import { fail, json } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import {
  checkoutBasket,
  checkoutSchema,
  GATEWAY_NAME,
  isDuplicateOrderError,
  isStockError,
  writeCheckoutOrder,
} from "@/lib/checkout";
import {
  gatewayCurrency,
  gatewayIsConfigured,
  gatewayKeyId,
} from "@/lib/gateway-config";
import {
  claimCheckoutAttempt,
  checkoutIdempotencyKey,
  gatewayOrderForAttempt,
  orderIdForAttempt,
  recordGatewayOrder,
  releaseCheckoutAttempt,
  settleCheckoutAttempt,
} from "@/lib/gateway-records";
import { generateOrderId } from "@/lib/orders";
import { createGatewayOrder, MINIMUM_AMOUNT } from "@/lib/payment-gateway";
import { signPendingOrder } from "@/lib/pending-order";
import { ensureSessionId } from "@/lib/session";

/**
 * Waits for an attempt somebody else owns to finish.
 *
 * The attempt is settled the moment the gateway's order is on file, so
 * the wait is for that row to be filled in. It is a short wait — the
 * request that owns the attempt is one call to the gateway away — and
 * it gives up rather than holding the browser's request open.
 */
async function waitForAttempt(
  attemptKey: string,
  { timeoutMs = 15_000, everyMs = 250 } = {}
): Promise<{
  orderId: string;
  gatewayOrderId: string;
} | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const attempt = await gatewayOrderForAttempt(attemptKey);
    if (attempt) {
      return {
        orderId: attempt.orderId,
        gatewayOrderId: attempt.gatewayOrderId,
      };
    }
    await new Promise((done) => setTimeout(done, everyMs));
  }
  return null;
}

/**
 * POST /api/create-order — start an order.
 *
 * There are two kinds of order. One is paid for at the door, and it is
 * finished here: the order is written, the stock is taken, the customer
 * is told, and the basket is emptied.
 *
 * The other is paid for now, through the gateway. For that one the shop
 * asks the gateway for an order to pay against, and answers with the
 * three things the gateway's checkout needs: its order id, the amount in
 * paise, and the currency. The shop's own order is written first, so
 * that the stock is held before any money moves — and it waits for the
 * money before the customer is told the order is in.
 *
 * The amount is the basket's, read on the server. A customer may say what
 * they think they are paying, and the shop checks it against its own
 * figures rather than taking it on trust.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Send the checkout details as JSON.", 400);
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return fail("Check the highlighted fields.", 400, { errors });
  }
  const details = parsed.data;

  const basket = await checkoutBasket();
  if (!basket) return fail("Your cart is empty.", 400);

  // Money taken at the door.
  if (details.paymentMethod === "cod") {
    const orderId = await writeCheckoutOrder(details, basket);
    await clearCart();
    revalidatePath("/", "layout");
    return json({ ok: true, mode: "cod", order_id: orderId });
  }

  // Money taken now. The gateway's own unit is the paise; the shop keeps
  // its money in rupees, so the conversion happens here and nowhere else.
  const amount = Math.round(basket.totals.total * 100);
  if (amount < MINIMUM_AMOUNT) {
    return fail("The order total is too small to charge.", 400);
  }

  const asked = (body as { amount?: unknown }).amount;
  if (typeof asked === "number" && Math.round(asked) !== amount) {
    return fail("The amount does not match your basket. Please try again.", 400);
  }

  if (!gatewayIsConfigured()) {
    return fail(
      "The shop has not been given its payment gateway keys, so it cannot take money online right now.",
      503
    );
  }

  // The token that lets this browser put the order away again, if the
  // customer closes the payment window without paying. It is also what
  // the idempotency key is made from — the session is what says "this
  // is the same customer on the same attempt".
  const sessionId = await ensureSessionId();

  /*
    A repeated attempt is the same attempt.

    A customer who taps "Pay now" twice, or whose browser retries the
    request after the network wobbles, should get one order to pay
    against — not two, and not two chances to be charged. The browser
    sends an id for the attempt, the shop mixes it with the session and
    hashes it, and that hash is what everything else is worked out from.

    Razorpay's order API has no idempotency of its own, so the shop
    cannot ask it to make the same order twice. The claim below is what
    does it instead: the first request to write the attempt owns it, and
    every other one waits for it to finish rather than making an order
    of its own.
  */
  const attemptId = String(
    (body as { checkout_attempt?: unknown })?.checkout_attempt ?? ""
  ).trim();
  const idempotencyKey = attemptId
    ? checkoutIdempotencyKey({ sessionId, attemptId })
    : null;

  /*
    The shop's own order id is worked out from the attempt rather than
    made at random.

    Two requests for the same attempt often arrive at the same moment —
    a double tap, a browser retry — and they both come up with the same
    id. It is also the gateway's receipt, so the payment is tied to
    that one order whichever gateway order it was made against.
  */
  const orderId = idempotencyKey
    ? orderIdForAttempt(idempotencyKey)
    : generateOrderId();

  /** The answer the browser gets, once there is an order to pay against. */
  const answerFor = (gatewayOrderId: string, forOrderId: string) =>
    json({
      ok: true,
      mode: "gateway",
      order_id: gatewayOrderId,
      amount,
      currency: gatewayCurrency(),
      key_id: gatewayKeyId(),
      shop_order_id: forOrderId,
      pending_token: signPendingOrder(forOrderId, sessionId),
    });

  /**
   * Writes the shop's own order, taking the stock off the shelf.
   *
   * It answers rather than throws: a stock error is the customer being
   * told to adjust their basket, and an order that is already there is
   * a request that lost the race and has nothing left to do.
   */
  const writeTheOrder = async (
    forOrderId: string
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
    try {
      await writeCheckoutOrder(details, basket, {
        orderId: forOrderId,
        gateway: GATEWAY_NAME,
        // The order is not announced until the money is in.
        notify: false,
      });
      return { ok: true };
    } catch (err) {
      if (isStockError(err)) {
        return {
          ok: false,
          status: 409,
          error: `${err.message} Nothing has been ordered — please adjust your basket.`,
        };
      }
      if (idempotencyKey && isDuplicateOrderError(err)) {
        // Somebody else wrote it. It is the same order.
        return { ok: true };
      }
      throw err;
    }
  };

  if (idempotencyKey) {
    // The claim.
    const claim = await claimCheckoutAttempt({
      attemptKey: idempotencyKey,
      orderId,
      amount,
      currency: gatewayCurrency(),
    });

    if (!claim.won) {
      // Somebody else is making this attempt. Wait for them.
      //
      // They are making the same order — the order id comes out of the
      // same hash — so the answer is the same answer. Waiting is better
      // than making a second order at the gateway, which Razorpay has
      // no way of merging and which would be left behind as an orphan.
      const finished = await waitForAttempt(idempotencyKey);
      if (finished) {
        return answerFor(finished.gatewayOrderId, finished.orderId);
      }

      // The attempt was abandoned — the request that owned it did not
      // finish. This one takes it over. The write that settles it only
      // lands for one of them, so if two take over at once, one wins and
      // the other waits for the winner.
      const taken = await createGatewayOrder({
        amount,
        receipt: claim.orderId,
        notes: { shop_order_id: claim.orderId },
      });
      if (!taken.ok) {
        await releaseCheckoutAttempt(idempotencyKey);
        return fail(taken.reason, taken.status);
      }
      const written = await writeTheOrder(claim.orderId);
      if (!written.ok) {
        await releaseCheckoutAttempt(idempotencyKey);
        return fail(written.error, written.status);
      }
      const settled = await settleCheckoutAttempt({
        attemptKey: idempotencyKey,
        gatewayOrderId: taken.order.orderId,
      });
      if (!settled) {
        // Somebody else settled it first. Theirs is the one to use.
        const theirs = await waitForAttempt(idempotencyKey);
        if (theirs) return answerFor(theirs.gatewayOrderId, theirs.orderId);
      }
      await recordGatewayOrder({
        gatewayOrderId: taken.order.orderId,
        orderId: claim.orderId,
        amount: taken.order.amount,
        currency: taken.order.currency,
        status: "created",
        idempotencyKey,
      });
      return answerFor(taken.order.orderId, claim.orderId);
    }
  }

  // The attempt is ours. Make the order to pay against.
  const gatewayOrder = await createGatewayOrder({
    amount,
    receipt: orderId,
    notes: { shop_order_id: orderId },
  });
  if (!gatewayOrder.ok) {
    if (idempotencyKey) await releaseCheckoutAttempt(idempotencyKey);
    return fail(gatewayOrder.reason, gatewayOrder.status);
  }

  // The shop's own order, with the stock taken off the shelf.
  const written = await writeTheOrder(orderId);
  if (!written.ok) {
    if (idempotencyKey) await releaseCheckoutAttempt(idempotencyKey);
    return fail(written.error, written.status);
  }

  // The attempt is finished, and the gateway's order is on file.
  if (idempotencyKey) {
    await settleCheckoutAttempt({
      attemptKey: idempotencyKey,
      gatewayOrderId: gatewayOrder.order.orderId,
    });
  }
  await recordGatewayOrder({
    gatewayOrderId: gatewayOrder.order.orderId,
    orderId,
    amount: gatewayOrder.order.amount,
    currency: gatewayOrder.order.currency,
    status: "created",
    idempotencyKey,
  });

  return answerFor(gatewayOrder.order.orderId, orderId);
}
