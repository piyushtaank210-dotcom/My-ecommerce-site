/**
 * The token that lets a customer put away an order they did not pay for.
 *
 * When a customer closes the payment window without paying, the order
 * the shop wrote for them is not a real order: nothing was paid, nothing
 * should be sent, and the stock has to go back on the shelf. Something
 * has to be able to say so.
 *
 * The order id is not enough on its own. An order id is a receipt, and
 * anyone who has ever seen one can write it down, so an endpoint that
 * cancels an order cannot simply believe the id it is given. This signs
 * the order id together with the browser session that made the order, so
 * that only the session that started the payment can end it.
 *
 * The token is short-lived by nature: it stops meaning anything the
 * moment the payment is made, because the order is then confirmed and
 * the stock is spoken for.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./session-token";

/** Signs the order and the session that made it. */
export function signPendingOrder(orderId: string, sessionId: string): string {
  return createHmac("sha256", sessionSecret())
    .update(`pending.${orderId}.${sessionId}`)
    .digest("base64url");
}

/**
 * Whether the token belongs to this order and this browser.
 *
 * The comparison is made in constant time, so that it cannot be worked
 * out one character at a time.
 */
export function pendingOrderIsOurs(input: {
  orderId: string;
  sessionId: string;
  token: string;
}): boolean {
  if (!input.orderId || !input.sessionId || !input.token) return false;

  const expected = Buffer.from(signPendingOrder(input.orderId, input.sessionId));
  const given = Buffer.from(input.token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
