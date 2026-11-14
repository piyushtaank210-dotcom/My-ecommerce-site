/**
 * The payment gateway's credentials.
 *
 * The shop takes payment through Razorpay. The keys live here and
 * nowhere else: the key id is the shop's name at the gateway, and the key
 * secret is what proves a payment came from the gateway rather than from
 * a browser. Both are read from the environment, and neither is ever
 * written down in the source.
 *
 * This is deliberately its own module with no imports, so that it can be
 * read from anywhere without dragging anything else along with it.
 *
 * The key secret never leaves the server. The key id does not have to be
 * secret — it goes out to the browser to open the checkout — but it is
 * still read on the server and handed over deliberately, rather than
 * being written into the bundle.
 */

/** The gateway's key id, when the shop has been given one. */
export function gatewayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID || null;
}

/** The gateway's key secret, when the shop has been given one. */
export function gatewayKeySecret(): string | null {
  return process.env.RAZORPAY_KEY_SECRET || null;
}

/**
 * Whether the shop has been given the keys it needs to reach the
 * gateway.
 *
 * A shop without them still takes cash-on-delivery orders; it just
 * cannot take money online.
 */
export function gatewayIsConfigured(): boolean {
  return Boolean(gatewayKeyId() && gatewayKeySecret());
}

/** The currency the shop takes payment in. */
export function gatewayCurrency(): string {
  return process.env.RAZORPAY_CURRENCY || "INR";
}

/**
 * Where the gateway's API lives.
 *
 * It is the gateway's own address unless the shop has been told
 * otherwise. Razorpay publishes a mock of its API for testing against,
 * and pointing the shop at it is how the whole payment is exercised
 * without asking the real gateway for money that is not there.
 */
export function gatewayApiBase(): string {
  return process.env.RAZORPAY_API_BASE || "https://api.razorpay.com";
}
