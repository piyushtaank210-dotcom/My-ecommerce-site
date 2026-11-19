import { getDb } from "./db";
import { sendEmail } from "./mail";
import { formatDate } from "./format";
import { STORE } from "./store-info";
import { CONTACT_SUBJECT_LABEL, type ContactSubject } from "./contact";

/**
 * The shop's replies to its enquiries.
 *
 * An enquiry arrives from the contact page and sits in the queue. This
 * module is how the shop answers it: it writes the reply down, sends it
 * to the address the customer gave, and records what became of it.
 *
 * Three rules it keeps:
 *
 * A reply that did not go out is never recorded as one that did. The
 * row says 'sent' only when the mail service said so, and it says why
 * when it did not.
 *
 * An enquiry is only marked as answered when the reply actually went
 * out. A failure leaves the enquiry exactly where it was.
 *
 * And a reply is only ever sent once. The key it was written under is
 * unique, and it is claimed before the message goes out — so a
 * double-clicked button, or the same request arriving twice, is one
 * email rather than two.
 */

/** How long a reply may be. */
export const REPLY_MAX_LENGTH = 5000;

/** What became of a reply. */
export type ReplyStatus = "pending" | "sent" | "failed";

/** A reply, as the back office reads it. */
export type EnquiryReply = {
  id: number;
  message_id: number;
  body: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: ReplyStatus;
  email_id: string | null;
  error: string | null;
  reply_key: string;
  sent_by: number | null;
  sent_by_name: string | null;
  created_at: string;
  /** When it actually went out. */
  sent_at: string | null;
};

/** Why a reply could not be sent. */
export type ReplyProblem =
  | "invalid"
  | "not_found"
  | "no_address"
  | "send_failed";

export type ReplyResult = {
  ok: boolean;
  /** What became of it. */
  status: ReplyStatus | "duplicate";
  /** What the shop should be told. */
  message: string;
  /** Why it could not be sent, when it could not. */
  problem?: ReplyProblem;
  /** The reply, when there is one. */
  reply?: EnquiryReply;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

function mapReply(r: Row): EnquiryReply {
  return {
    id: num(r.id),
    message_id: num(r.message_id),
    body: str(r.body),
    to_email: str(r.to_email),
    to_name: strOrNull(r.to_name),
    subject: str(r.subject),
    status: (str(r.status) || "pending") as ReplyStatus,
    email_id: strOrNull(r.email_id),
    error: strOrNull(r.error),
    reply_key: str(r.reply_key),
    sent_by: r.sent_by === null ? null : num(r.sent_by),
    sent_by_name: strOrNull(r.sent_by_name),
    created_at: str(r.created_at),
    sent_at: strOrNull(r.sent_at),
  };
}

/**
 * Whether an address is one an email can be sent to.
 *
 * A plain check: there is something before the sign, something after it,
 * and a dot in the part after it. It is not a proof, but it is enough to
 * refuse an address that was never an address.
 */
export function isEmailAddress(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return !/\s/.test(value);
}

/**
 * Tidies what the shop wrote.
 *
 * The line endings are made the same on every machine, the ends are
 * trimmed, and the control characters that have no business in a letter
 * are taken out.
 */
export function tidyReplyBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

/**
 * The subject the reply goes out with.
 */
export function replySubject(): string {
  return `Re: Your Enquiry – ${STORE.name}`;
}

/**
 * The letter the customer reads.
 *
 * It carries the reply itself, the shop's own details, and the enquiry
 * the reply is about — so the customer can see which of their messages
 * is being answered without having to find the thread.
 *
 * It says nothing about the shop's own side: no staff addresses, no
 * notes, nothing that is not the customer's business.
 */
export function replyEmailBody(input: {
  customerName: string;
  reply: string;
  /** The subject the customer chose. */
  subject: string;
  orderId: string | null;
  receivedAt: string;
  originalMessage: string;
}): string {
  const name = input.customerName.trim() || "there";

  return [
    `Hello ${name},`,
    "",
    input.reply,
    "",
    "—",
    "Kind regards,",
    STORE.name,
    `${STORE.email} · ${STORE.phone}`,
    STORE.url,
    "",
    "--- Your enquiry ---",
    `Subject: ${input.subject}`,
    input.orderId ? `Order: ${input.orderId}` : null,
    `Received: ${formatDate(input.receivedAt)}`,
    "",
    input.originalMessage,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Every reply to an enquiry, oldest first.
 */
export async function listReplies(messageId: number): Promise<EnquiryReply[]> {
  const rows = (await getDb()
    .prepare(
      `SELECT * FROM enquiry_replies
        WHERE message_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(messageId)) as Row[];

  return rows.map(mapReply);
}

/**
 * The replies to a page of enquiries, asked for in one go.
 *
 * The database is far away, so everything the page needs is asked for
 * at once rather than one enquiry at a time.
 */
export async function listRepliesForMessages(
  messageIds: number[]
): Promise<Map<number, EnquiryReply[]>> {
  const byId = new Map<number, EnquiryReply[]>();
  if (!messageIds.length) return byId;

  const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(",");
  const rows = (await getDb()
    .prepare(
      `SELECT * FROM enquiry_replies
        WHERE message_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC`
    )
    .all(...messageIds)) as Row[];

  for (const row of rows) {
    const reply = mapReply(row);
    const list = byId.get(reply.message_id) ?? [];
    list.push(reply);
    byId.set(reply.message_id, list);
  }

  return byId;
}

/**
 * Writes a reply to a customer and sends it.
 *
 * The reply is written down first, and the email goes out after it —
 * the same order the shop's other messages use. If the mail service
 * refuses the message, the reply is still on record as one that did not
 * go out, and the enquiry is left exactly where it was.
 */
export async function sendEnquiryReply(input: {
  messageId: number;
  /** What the shop wrote. */
  body: string;
  /**
   * The key this reply is written under.
   *
   * The same key is never written twice. It is what stops a second
   * click from being a second email.
   */
  replyKey: string;
  /** Who wrote it. */
  sentBy?: number | null;
  sentByName?: string | null;
}): Promise<ReplyResult> {
  const db = getDb();

  const messageId = Number(input.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return {
      ok: false,
      status: "failed",
      problem: "invalid",
      message: "That is not an enquiry.",
    };
  }

  const body = tidyReplyBody(String(input.body ?? ""));
  if (!body) {
    return {
      ok: false,
      status: "failed",
      problem: "invalid",
      message: "Write a reply before sending it.",
    };
  }
  if (body.length > REPLY_MAX_LENGTH) {
    return {
      ok: false,
      status: "failed",
      problem: "invalid",
      message: `A reply can be ${REPLY_MAX_LENGTH} characters at most.`,
    };
  }

  const replyKey = String(input.replyKey ?? "").trim();
  if (!replyKey || replyKey.length > 100 || !/^[A-Za-z0-9_-]+$/.test(replyKey)) {
    return {
      ok: false,
      status: "failed",
      problem: "invalid",
      message:
        "This reply could not be identified. Refresh the page and try again.",
    };
  }

  // The enquiry the reply answers.
  const enquiry = (await db
    .prepare(
      `SELECT id, name, email, subject, order_id, message, status, created_at
         FROM contact_messages WHERE id = ?`
    )
    .get(messageId)) as Row | undefined;

  if (!enquiry) {
    return {
      ok: false,
      status: "failed",
      problem: "not_found",
      message: "No such enquiry.",
    };
  }

  const to = str(enquiry.email).trim();
  if (!isEmailAddress(to)) {
    return {
      ok: false,
      status: "failed",
      problem: "no_address",
      message: "This enquiry has no email address to reply to.",
    };
  }

  // The key is claimed before anything is sent. A reply that has already
  // been written under this key is not written again, and it is not sent
  // again either — it is the same reply, arriving twice.
  const inserted = (await db
    .prepare(
      `INSERT INTO enquiry_replies
         (message_id, body, to_email, to_name, subject, status, reply_key, sent_by, sent_by_name)
       VALUES (?,?,?,?,?,'pending',?,?,?)
       ON CONFLICT (reply_key) DO NOTHING
       RETURNING id`
    )
    .run(
      messageId,
      body,
      to,
      strOrNull(enquiry.name),
      replySubject(),
      replyKey,
      input.sentBy ?? null,
      input.sentByName ?? null
    )) as { changes: number; lastInsertRowid?: number; id?: number };

  if (!inserted.changes) {
    const existing = (await db
      .prepare("SELECT * FROM enquiry_replies WHERE reply_key = ?")
      .get(replyKey)) as Row | undefined;

    return {
      ok: true,
      status: "duplicate",
      message: "That reply has already been sent.",
      reply: existing ? mapReply(existing) : undefined,
    };
  }

  const replyId = Number(inserted.lastInsertRowid ?? inserted.id ?? 0);

  const subject = replySubject();
  const sent = await sendEmail({
    to,
    subject,
    body: replyEmailBody({
      customerName: str(enquiry.name),
      reply: body,
      subject:
        CONTACT_SUBJECT_LABEL[str(enquiry.subject) as ContactSubject] ??
        str(enquiry.subject),
      orderId: strOrNull(enquiry.order_id),
      receivedAt: str(enquiry.created_at),
      originalMessage: str(enquiry.message),
    }),
    // The same key is the same message to the mail service, so a retry
    // after a failure is not a second email.
    idempotencyKey: `enquiry-reply:${replyKey}`,
  });

  const now = new Date().toISOString();

  if (sent.status !== "sent") {
    // The reply did not go out. It is recorded as one that did not, with
    // the reason, and the enquiry is left exactly where it was — a
    // failure to send is not an answer.
    await db
      .prepare(
        `UPDATE enquiry_replies
            SET status = 'failed', error = ?, sent_at = NULL
          WHERE id = ?`
      )
      .run(sent.error ?? "The reply could not be sent.", replyId);

    return {
      ok: false,
      status: "failed",
      problem: "send_failed",
      message:
        sent.status === "not_configured"
          ? "The shop has no mail service set up, so the reply could not be sent."
          : `The reply could not be sent. ${
              sent.error ?? ""
            }`.trim(),
    };
  }

  await db
    .prepare(
      `UPDATE enquiry_replies
          SET status = 'sent', email_id = ?, sent_at = ?
        WHERE id = ?`
    )
    .run(sent.id ?? null, now, replyId);

  // The reply has gone out, so the enquiry is answered. A closed
  // enquiry is not reopened by a reply — it is left as it was closed.
  const current = str(enquiry.status) || "new";
  if (current !== "closed") {
    await db
      .prepare(
        `UPDATE contact_messages
            SET status = 'answered', handled_by = ?, handled_at = ?
          WHERE id = ?`
      )
      .run(input.sentBy ?? null, now, messageId);
  }

  const saved = (await db
    .prepare("SELECT * FROM enquiry_replies WHERE id = ?")
    .get(replyId)) as Row | undefined;

  return {
    ok: true,
    status: "sent",
    message: "The reply has been sent.",
    reply: saved ? mapReply(saved) : undefined,
  };
}
