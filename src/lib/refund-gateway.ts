/**
 * The payment gateway.
 *
 * The shop takes payments through Razorpay. When a refund is due, the
 * money goes back through the same gateway it came in by — that is what
 * the customer expects, and it is what the gateway's own refund API is
 * for.
 *
 * Nothing here is guessed. The gateway's refund API is called exactly
 * as Razorpay documents it:
 *
 *   POST https://api.razorpay.com/v1/payments/{payment_id}/refund
 *
 * with the key id and key secret as HTTP Basic credentials, and a body
 * carrying the amount in paise, the currency, and a receipt that is
 * the shop's own reference for the refund.
 *
 * The gateway answers with its own refund id and a status. It is the
 * gateway's status — not the shop's opinion — that decides whether the
 * refund is completed, and the id it returns is what is recorded.
 *
 * When the shop has not been given gateway credentials, or the order
 * carries no gateway payment reference, there is nothing to call. The
 * refund is then a manual one: an administrator pays it by hand and
 * records the reference of the payment they made. A refund is never
 * marked complete without either the gateway's confirmation or the
 * administrator's own confirmation with that reference.
 */

export type GatewayRefundResult = {
  ok: boolean;
  /** The gateway's own reference for the refund. */
  refundId?: string;
  /** The status the gateway reported. */
  status?: string;
  /** Why it did not work, when it did not. */
  reason?: string;
};

export type GatewayRefundRequest = {
  /** The gateway's reference for the payment being refunded. */
  paymentId: string;
  /**
   * How much is going back, in rupees.
   *
   * The gateway's own API is written in paise, and the request converts
   * as it goes out.
   */
  amount: number;
  /** The currency, as the gateway writes it. */
  currency?: string;
  /** The shop's own reference for this refund. */
  receipt: string;
  /** A note the gateway keeps with the refund. */
  notes?: Record<string, string>;
};

/**
 * Whether the shop has been given the keys it needs to reach the
 * gateway.
 *
 * The keys are read from the environment, and they are never written
 * down anywhere else.
 */
export function gatewayIsConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** The currency the shop takes payment in. */
function currencyOf(): string {
  return process.env.RAZORPAY_CURRENCY || "INR";
}

/**
 * The credentials, as HTTP Basic wants them.
 *
 * The key id and the key secret are joined with a colon and encoded.
 */
function authorization(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/**
 * Refunds a payment through the gateway.
 *
 * It never throws: a gateway that is down, or that refuses the refund,
 * is an answer the back office needs to see rather than a crash.
 */
export async function refundThroughGateway(
  request: GatewayRefundRequest
): Promise<GatewayRefundResult> {
  // The order is checked first, because it is the more specific of the
  // two reasons: an order with no payment reference cannot be refunded
  // through the gateway whether or not there are credentials.
  if (!request.paymentId) {
    return {
      ok: false,
      reason:
        "This order carries no gateway payment reference, so there is nothing to refund against. The refund has to be paid by hand.",
    };
  }
  if (!gatewayIsConfigured()) {
    return {
      ok: false,
      reason:
        "The shop has not been given gateway credentials, so the refund has to be paid by hand.",
    };
  }
  if (!request.amount || request.amount <= 0) {
    return { ok: false, reason: "Enter the amount to refund." };
  }

  try {
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(request.paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: authorization(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // The gateway's API is written in paise. The shop keeps its
          // money in rupees, so it is converted as it goes out.
          amount: Math.round(request.amount * 100),
          currency: request.currency ?? currencyOf(),
          receipt: request.receipt,
          ...(request.notes ? { notes: request.notes } : {}),
        }),
      }
    );

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      error?: { description?: string; code?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        reason:
          body.error?.description ??
          `The gateway refused the refund (${response.status}).`,
      };
    }

    return {
      ok: true,
      refundId: body.id,
      status: body.status ?? "pending",
    };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `The gateway could not be reached: ${err.message}`
          : "The gateway could not be reached.",
    };
  }
}

/**
 * Asks the gateway about a refund it has already been given.
 *
 * It is how the shop finds out whether a refund that was pending has
 * gone through, without asking the administrator to guess.
 */
export async function checkGatewayRefund(
  refundId: string
): Promise<GatewayRefundResult> {
  if (!gatewayIsConfigured()) {
    return {
      ok: false,
      reason: "The shop has not been given gateway credentials.",
    };
  }

  try {
    const response = await fetch(
      `https://api.razorpay.com/v1/refunds/${encodeURIComponent(refundId)}`,
      {
        method: "GET",
        headers: { Authorization: authorization() },
      }
    );

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      amount?: number;
      error?: { description?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        reason:
          body.error?.description ?? `The gateway did not answer (${response.status}).`,
      };
    }

    return { ok: true, refundId: body.id, status: body.status };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `The gateway could not be reached: ${err.message}`
          : "The gateway could not be reached.",
    };
  }
}

/**
 * Whether a gateway status means the money has gone back.
 *
 * The gateway calls a refund `processed` when it has been paid. The
 * other word it uses, `pending`, means it has not.
 */
export function gatewayStatusIsComplete(status: string | undefined): boolean {
  return (status ?? "").toLowerCase() === "processed";
}
