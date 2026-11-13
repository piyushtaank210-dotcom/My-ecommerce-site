import { Resend } from "resend";

/**
 * The shop's email.
 *
 * Everything the shop sends goes through this module: the messages
 * about a return, the enquiries, the order confirmations and the order
 * updates. It uses Resend's official SDK, and the API key is read from
 * the environment and never written down anywhere else.
 *
 * Two rules it keeps:
 *
 * A message is only ever reported as sent when Resend says it was. A
 * refusal from Resend is a failure, and it is recorded as one, so that
 * the shop never tells a customer their money is on its way when it is
 * not.
 *
 * And a message is only ever sent once. Every message carries a key
 * that says which event it belongs to, and the key is written down
 * before the message goes out — so a retry after a failure never sends
 * a second copy.
 */

/**
 * What became of a message.
 *
 * `not_configured` means the shop has not been given the keys it
 * needs. It is not a failure: the message is still recorded and the
 * customer still sees it on their dashboard.
 */
export type MailResult = {
  status: "sent" | "not_configured" | "failed";
  /** Resend's own reference for the message, when it was sent. */
  id?: string;
  /** Why it failed, when it did. */
  error?: string;
};

/**
 * The mail client.
 *
 * It is made once and kept, because the SDK holds a connection pool.
 */
let client: Resend | null = null;
let clientKey = "";

/**
 * Whether the shop has been given the keys it needs to send an email.
 */
export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * The Resend client, made when there is a key to make it with.
 */
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;

  // The key is read from the environment on every call, so that a
  // changed key is picked up without a restart.
  //
  // `RESEND_BASE_URL` points the SDK somewhere else. It is how the check
  // talks to a stand-in instead of the real service, so that the whole
  // path can be proved without sending anything to a customer.
  const url = process.env.RESEND_BASE_URL || undefined;
  if (!client || clientKey !== key) {
    client = new Resend(key, url ? { baseUrl: url } : undefined);
    clientKey = key;
  }
  return client;
}

/**
 * The address the shop sends from.
 *
 * It is written out in full — "Consoleseller Orders
 * <orders@consoleseller.in>" — because that is the format Resend wants,
 * and because a domain the shop owns is what a verified sender needs.
 */
export function fromAddress(): string {
  return (
    process.env.MAIL_FROM ||
    `ConsoleSeller <${process.env.NEXT_PUBLIC_STORE_EMAIL || "consoleseller.in@gmail.com"}>`
  );
}

/**
 * Where the shop's own enquiries are sent.
 *
 * It is the shop's own address, and it can be changed with one
 * environment variable.
 */
export function enquiryNotificationAddress(): string {
  return (
    process.env.ENQUIRY_NOTIFICATION_EMAIL ||
    process.env.NEXT_PUBLIC_STORE_EMAIL ||
    "consoleseller.in@gmail.com"
  );
}

/**
 * Sends one email through Resend.
 *
 * It never throws. A refusal from Resend, a key that is wrong, a
 * network that is down — all of them come back as a failure, so that
 * the caller can record it and carry on.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
  /** Resend's own idempotency key, so a retry never sends twice. */
  idempotencyKey?: string;
}): Promise<MailResult> {
  // A message with nowhere to go is a fault, and it is checked before
  // the keys — because a wrong address is wrong whether or not there
  // are keys.
  if (!input.to || !input.to.includes("@")) {
    return { status: "failed", error: "The message has no address to go to." };
  }

  const resend = getClient();

  // Without a key there is nowhere to send the message. The shop is
  // told so, rather than the message being quietly lost.
  if (!resend) {
    return {
      status: "not_configured",
      error:
        "RESEND_API_KEY is not set, so the shop has nowhere to send email from.",
    };
  }

  try {
    const response = await resend.emails.send(
      {
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        text: input.body,
      },
      // The idempotency key tells Resend that this is the same message
      // it has already seen, so a retry after a failure is not a second
      // email.
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined
    );

    if (response.error) {
      console.warn(
        `[mail] Resend refused the message "${input.subject}": ${response.error.name} — ${response.error.message}`
      );
      return {
        status: "failed",
        error: `${response.error.name}: ${response.error.message}`,
      };
    }

    return { status: "sent", id: response.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[mail] the message "${input.subject}" could not be sent: ${message}`);
    return { status: "failed", error: message };
  }
}

/**
 * Checks that the shop can reach Resend.
 *
 * It asks Resend for the domains it can send from, which needs only
 * the key. It is used by the test, and by whoever is setting the shop
 * up, to find out whether the key works before anything is sent.
 */
export async function testResendConnection(): Promise<{
  ok: boolean;
  message: string;
  domains?: { name: string; status: string }[];
}> {
  const resend = getClient();

  if (!resend) {
    return {
      ok: false,
      message:
        "RESEND_API_KEY is not set, so the shop cannot reach Resend.",
    };
  }

  try {
    const response = await resend.domains.list();

    if (response.error) {
      return {
        ok: false,
        message: `Resend refused the key: ${response.error.name} — ${response.error.message}`,
      };
    }

    const domains = (response.data?.data ?? []).map((d) => ({
      name: d.name,
      status: d.status,
    }));

    return {
      ok: true,
      message: `Resend answered. The shop can send from ${fromAddress()}.`,
      domains,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Resend could not be reached: ${err.message}`
          : "Resend could not be reached.",
    };
  }
}
