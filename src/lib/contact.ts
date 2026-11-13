import { getDb } from "./db";
import { sendEmail, enquiryNotificationAddress } from "./mail";

export const CONTACT_SUBJECTS = [
  "product",
  "order",
  "support",
  "returns",
  "other",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** Where an enquiry sits in the support queue — see src/lib/message-status.ts. */
export {
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABEL,
  type MessageStatus,
} from "./message-status";

export type ContactMessage = {
  name: string;
  email: string;
  /** The phone number, when the customer gave one. */
  phone?: string | null;
  subject: ContactSubject;
  orderId: string | null;
  message: string;
};

/** The subject of an enquiry, as the customer chose it. */
export const CONTACT_SUBJECT_LABEL: Record<ContactSubject, string> = {
  product: "A question about a product",
  order: "A question about an order",
  support: "Something else",
  returns: "A return, replacement or refund",
  other: "Something else",
};

/**
 * Records an enquiry from the contact page.
 *
 * It is saved first and always — the enquiry is in the shop's queue even
 * if the email cannot be sent. The email is a second step, and what
 * became of it is written down against the enquiry so that it can be
 * sent again later.
 */
export async function createContactMessage(
  input: ContactMessage
): Promise<{ id: number; emailStatus: string }> {
  const db = getDb();

  const inserted = (await db
    .prepare(
      `INSERT INTO contact_messages (name, email, phone, subject, order_id, message)
       VALUES (?,?,?,?,?,?)
       RETURNING id`
    )
    .run(
      input.name,
      input.email,
      input.phone || null,
      input.subject,
      input.orderId,
      input.message
    )) as {
    lastInsertRowid?: number;
    id?: number;
  };

  const id = Number(inserted.lastInsertRowid ?? inserted.id ?? 0);

  // The email is sent after the enquiry is saved, and it never stops
  // the enquiry being recorded.
  const emailStatus = await notifyEnquiryByEmail(id, input);

  return { id, emailStatus };
}

/**
 * Sends the shop an email about an enquiry.
 *
 * The enquiry is already saved by the time this runs. The address it
 * goes to is the shop's own, and what happened is written down against
 * the enquiry, so a message that could not be sent can be sent again.
 */
export async function notifyEnquiryByEmail(
  id: number,
  enquiry: ContactMessage
): Promise<"sent" | "not_configured" | "failed"> {
  const db = getDb();
  const to = enquiryNotificationAddress();

  // When the enquiry arrived, as it was recorded. The message says the
  // time the enquiry was made, not the time this attempt was made — so
  // that sending it again is the same message to Resend, and the
  // idempotency key means what it is meant to.
  const received = await db
    .prepare("SELECT created_at FROM contact_messages WHERE id = ?")
    .get(id);
  const receivedAt =
    (received?.created_at ? String(received.created_at) : "") ||
    new Date().toISOString();

  const subject = `New enquiry: ${CONTACT_SUBJECT_LABEL[enquiry.subject] ?? enquiry.subject}`;
  const body = [
    "A customer has sent the shop an enquiry.",
    "",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    enquiry.phone ? `Phone: ${enquiry.phone}` : null,
    enquiry.orderId ? `Order: ${enquiry.orderId}` : null,
    `Subject: ${CONTACT_SUBJECT_LABEL[enquiry.subject] ?? enquiry.subject}`,
    `Received: ${receivedAt}`,
    "",
    "Message:",
    enquiry.message,
    "",
    `Open it in the back office: ${enquiryLink(id)}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const result = await sendEmail({
    to,
    subject,
    body,
    // The enquiry's own number is the key, so that sending it again is
    // the same message to Resend and not a second one.
    idempotencyKey: `enquiry:${id}`,
  });

  await db
    .prepare(
      `UPDATE contact_messages
          SET email_status = ?,
              email_sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE email_sent_at END
        WHERE id = ?`
    )
    .run(result.status, result.status, id);

  if (result.status === "not_configured") {
    console.warn(
      "[enquiries] the enquiry was saved but no mail service is set up, so the notification was not sent."
    );
  } else if (result.status === "failed") {
    console.warn(
      `[enquiries] the enquiry ${id} was saved but the notification could not be sent.`
    );
  }

  return result.status;
}

/**
 * Sends the notification for an enquiry again.
 *
 * It is used when a message could not be sent — the shop sets the mail
 * service up, or the service was down, and the enquiries that did not
 * go out are sent again.
 */
export async function resendEnquiryEmail(id: number): Promise<{
  ok: boolean;
  message: string;
}> {
  const db = getDb();

  const row = (await db
    .prepare(
      "SELECT id, name, email, phone, subject, order_id, message FROM contact_messages WHERE id = ?"
    )
    .get(id)) as
    | {
        id: number;
        name: string;
        email: string;
        phone: string | null;
        subject: ContactSubject;
        order_id: string | null;
        message: string;
      }
    | undefined;

  if (!row) return { ok: false, message: "No such enquiry." };

  // The same enquiry, with the same details — so that sending it again
  // is the same message to Resend, and the idempotency key means what
  // it is meant to.
  const status = await notifyEnquiryByEmail(id, {
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    orderId: row.order_id,
    message: row.message,
  });

  if (status === "sent") {
    return { ok: true, message: "The notification has been sent." };
  }
  if (status === "not_configured") {
    return {
      ok: false,
      message:
        "The shop has no mail service set up yet, so there is nowhere to send it.",
    };
  }
  return { ok: false, message: "The notification could not be sent." };
}

/** Where the enquiry can be read in the back office. */
function enquiryLink(id: number): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://consoleseller.in";
  return `${base}/admin/messages?q=${encodeURIComponent(String(id))}`;
}
