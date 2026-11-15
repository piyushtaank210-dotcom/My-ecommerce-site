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

import {
  gatewayApiBase,
  gatewayCurrency,
  gatewayIsConfigured,
  gatewayKeyId,
  gatewayKeySecret,
} from "./gateway-config";

// The check scripts ask the gateway module whether the shop has been
// given its keys, so that a refund is never tested against the real
// gateway by mistake. It is the same question this module asks itself.
export { gatewayIsConfigured };

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
  /**
   * A key that says "this is the same refund as last time".
   *
   * It is sent as the gateway's own idempotency key, so that a request
   * that was retried after the network wobbled is answered with the
   * refund that was already made rather than a second one.
   */
  idempotencyKey?: string;
};

/**
 * The currency the shop takes payment in.
 */
function currencyOf(): string {
  return gatewayCurrency();
}

/**
 * The credentials, as HTTP Basic wants them.
 *
 * The key id and the key secret are joined with a colon and encoded.
 */
function authorization(): string {
  const id = gatewayKeyId() ?? "";
  const secret = gatewayKeySecret() ?? "";
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
      `${gatewayApiBase()}/v1/payments/${encodeURIComponent(request.paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: authorization(),
          "Content-Type": "application/json",
          // The gateway is told that a repeated request is the same
          // request, so that a retry after the network wobbled cannot
          // send the money back twice.
          ...(request.idempotencyKey
            ? { "Idempotency-Key": request.idempotencyKey }
            : {}),
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
      `${gatewayApiBase()}/v1/refunds/${encodeURIComponent(refundId)}`,
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

/**
 * A refund the gateway has already made against a payment.
 */
export type GatewayRefundRecord = {
  /** The gateway's own reference for the refund. */
  id: string;
  /** The gateway's reference for the payment it was made against. */
  paymentId: string | null;
  /** The shop's own receipt for the refund. */
  receipt: string | null;
  /** How much went back, in paise. */
  amount: number;
  /** The gateway's own status for it. */
  status: string;
};

/**
 * The refunds the gateway has already made against a payment.
 *
 * It is the safety net under the shop's own record of a refund. A
 * request can be interrupted between the gateway accepting the refund and
 * the shop hearing about it, and the shop would then have no refund id
 * while the money had already gone back. Asking the gateway what it has
 * already done against the payment answers that, and stops a retry from
 * sending the money back a second time.
 *
 * It answers with the reason it could not ask, rather than throwing:
 * the caller decides whether that is a reason to stop.
 */
export async function listGatewayRefunds(
  paymentId: string
): Promise<{ ok: true; refunds: GatewayRefundRecord[] } | { ok: false; reason: string }> {
  if (!paymentId) {
    return { ok: false, reason: "This order carries no gateway payment reference." };
  }
  if (!gatewayIsConfigured()) {
    return { ok: false, reason: "The shop has not been given gateway credentials." };
  }

  try {
    const url = `${gatewayApiBase()}/v1/refunds?payment_id=${encodeURIComponent(paymentId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: authorization() },
    });

    const body = (await response.json().catch(() => ({}))) as {
      items?: {
        id?: string;
        payment_id?: string;
        receipt?: string;
        amount?: number;
        status?: string;
      }[];
      error?: { description?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        reason: body.error?.description ?? `The gateway did not answer (${response.status}).`,
      };
    }

    const refunds = (body.items ?? []).map((r) => ({
      id: String(r.id ?? ""),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      receipt: r.receipt ? String(r.receipt) : null,
      amount: Number(r.amount ?? 0),
      status: String(r.status ?? "pending"),
    }));

    return { ok: true, refunds };
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
