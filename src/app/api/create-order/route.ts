import { revalidatePath } from "next/cache";
import { fail, json } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import {
  checkoutBasket,
  checkoutSchema,
  GATEWAY_NAME,
  isStockError,
  writeCheckoutOrder,
} from "@/lib/checkout";
import { gatewayIsConfigured, gatewayKeyId } from "@/lib/gateway-config";
import { generateOrderId } from "@/lib/orders";
import { createGatewayOrder, MINIMUM_AMOUNT } from "@/lib/payment-gateway";
import { signPendingOrder } from "@/lib/pending-order";
import { ensureSessionId } from "@/lib/session";

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

  // The shop's own order id is the gateway's receipt: it is what ties a
  // payment back to the order it belongs to, and it is written down
  // before the money moves.
  const orderId = generateOrderId();

  const gatewayOrder = await createGatewayOrder({
    amount,
    receipt: orderId,
    notes: { shop_order_id: orderId },
  });
  if (!gatewayOrder.ok) return fail(gatewayOrder.reason, gatewayOrder.status);

  try {
    await writeCheckoutOrder(details, basket, {
      orderId,
      gateway: GATEWAY_NAME,
      // The order is not announced until the money is in.
      notify: false,
    });
  } catch (err) {
    // The stock ran out between the basket and the checkout. Nothing was
    // charged and nothing was taken off the shelf.
    if (isStockError(err)) {
      return fail(
        `${err.message} Nothing has been ordered — please adjust your basket.`,
        409
      );
    }
    throw err;
  }

  // The token that lets this browser put the order away again, if the
  // customer closes the payment window without paying.
  const sessionId = await ensureSessionId();

  return json({
    ok: true,
    mode: "gateway",
    order_id: gatewayOrder.order.orderId,
    amount: gatewayOrder.order.amount,
    currency: gatewayOrder.order.currency,
    key_id: gatewayKeyId(),
    shop_order_id: orderId,
    pending_token: signPendingOrder(orderId, sessionId),
  });
}
