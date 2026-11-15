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
 *
 * The mock is a development thing and is treated as one. A mock lives on
 * the machine that runs it, so an address that points back at the
 * machine — `127.0.0.1`, `localhost`, `0.0.0.0` — can never be the real
 * gateway. Outside development such an address is refused, and the shop
 * talks to Razorpay instead: a deployment that was pointed at a mock by
 * mistake would otherwise take payments against a gateway that does not
 * exist, and the shop would never hear about them.
 */
export function gatewayApiBase(): string {
  const configured = process.env.RAZORPAY_API_BASE?.trim();
  const base = configured || "https://api.razorpay.com";

  if (process.env.NODE_ENV === "production" && isLocalAddress(base)) {
    console.warn(
      "[gateway] the gateway address is a local one, which cannot be the real " +
        "gateway. The shop is talking to Razorpay instead."
    );
    return "https://api.razorpay.com";
  }

  return base;
}

/**
 * Whether an address points back at the machine it is running on.
 *
 * It is the mock's address, and it is the only kind of address that can
 * never be the real gateway.
 */
function isLocalAddress(base: string): boolean {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    // An address that cannot be read is not one this can vouch for, and
    // it is left alone — the request will fail loudly rather than
    // quietly going somewhere else.
    return false;
  }
}

