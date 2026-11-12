import { getDb } from "./db";

/**
 * What the shop tells people, and how it tells them.
 *
 * Every message is written to the database first, so nothing is lost
 * when there is nowhere to send it to. The customer sees their messages
 * on their dashboard; the back office sees the ones for staff.
 *
 * An email is sent only when the shop has been told how to send one.
 * When it has not, the message is still recorded — marked as not sent —
 * so the shop knows what it owes the customer rather than quietly
 * forgetting.
 */

/**
 * The kinds of message the shop sends about a request.
 */
export const NOTIFICATION_KINDS = [
  "submitted",
  "under_review",
  "evidence_required",
  "evidence_received",
  "approved",
  "rejected",
  "pickup_scheduled",
  "received",
  "inspection_completed",
  "replacement_approved",
  "replacement_dispatched",
  "refund_approved",
  "refund_processing",
  "refund_completed",
  "resolved",
  "cancelled",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Whether the shop has been told how to send an email.
 *
 * There are two ways it can be set up: a Resend key, or a webhook of
 * the shop's own. With neither, the shop records its messages and does
 * not pretend to have sent anything.
 */
export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL);
}

/** The address the shop sends from. */
function fromAddress(): string {
  return (
    process.env.MAIL_FROM ||
    process.env.NEXT_PUBLIC_STORE_EMAIL ||
    "consoleseller.in@gmail.com"
  );
}

/**
 * A message to be sent.
 */
export type NotificationInput = {
  /** "customer" or "admin". */
  audience: "customer" | "admin";
  /** The customer the message is for, when there is one. */
  userId?: number | null;
  /** Where to send it, when it is to be sent. */
  email?: string | null;
  /** The request it is about. */
  returnId?: string | null;
  /** What it is about. */
  kind: NotificationKind;
  /** The headline. */
  title: string;
  /** The message itself. */
  body: string;
  /**
   * What makes this message unique. The same change never sends the
   * same message twice.
   */
  dedupeKey: string;
};

/**
 * Records a message, and sends it if the shop can.
 *
 * It never throws: a message that cannot be sent must not stop the
 * decision that caused it from being recorded.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    const db = getDb();

    const inserted = (await db
      .prepare(
        `INSERT INTO notifications
           (audience, user_id, email, return_id, channel, kind, title, body, status, dedupe_key)
         VALUES (?, ?, ?, ?, 'in_app', ?, ?, ?, 'unread', ?)
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`
      )
      .run(
        input.audience,
        input.userId ?? null,
        input.email ?? null,
        input.returnId ?? null,
        input.kind,
        input.title,
        input.body,
        input.dedupeKey
      )) as { changes: number; lastInsertRowid?: number };

    // The message was already recorded — it has been said before.
    if (inserted.changes === 0) return;

    if (!input.email) return;

    const sent = await sendEmail({
      to: input.email,
      subject: input.title,
      body: input.body,
    });

    await db
      .prepare(
        `UPDATE notifications
            SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END
          WHERE dedupe_key = ?`
      )
      .run(sent.status, sent.status, input.dedupeKey);
  } catch (err) {
    console.warn(
      `[notifications] could not record "${input.kind}":`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Sends one email.
 *
 * It is sent through Resend when the shop has a key for it, and through
 * the shop's own webhook when it has that instead. With neither, the
 * message is not sent and the shop is told so plainly.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ status: "sent" | "not_configured" | "failed" }> {
  const resendKey = process.env.RESEND_API_KEY;
  const webhook = process.env.MAIL_WEBHOOK_URL;

  if (!resendKey && !webhook) return { status: "not_configured" };

  const text = `${input.body}\n\n— ConsoleSeller\n${fromAddress()}`;

  try {
    if (resendKey) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM
            ? `ConsoleSeller <${process.env.MAIL_FROM}>`
            : `ConsoleSeller <${fromAddress()}>`,
          to: [input.to],
          subject: input.subject,
          text,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(
          `[notifications] the mail service refused the message (${response.status}): ${detail}`
        );
        return { status: "failed" };
      }
      return { status: "sent" };
    }

    const response = await fetch(webhook!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MAIL_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.MAIL_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: input.to,
        from: fromAddress(),
        subject: input.subject,
        text,
      }),
    });
    if (!response.ok) {
      console.warn(
        `[notifications] the mail webhook refused the message (${response.status})`
      );
      return { status: "failed" };
    }
    return { status: "sent" };
  } catch (err) {
    console.warn(
      "[notifications] could not send the message:",
      err instanceof Error ? err.message : err
    );
    return { status: "failed" };
  }
}

/**
 * A message to the customer about their request.
 */
export async function notifyCustomer(input: {
  userId?: number | null;
  email?: string | null;
  returnId: string;
  orderId: string;
  kind: NotificationKind;
  title: string;
  body: string;
}): Promise<void> {
  await notify({
    audience: "customer",
    userId: input.userId ?? null,
    email: input.email ?? null,
    returnId: input.returnId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    // One message of each kind per request. The same change never sends
    // the same message twice.
    dedupeKey: `return:${input.returnId}:${input.kind}`,
  });
}

/**
 * A message to the back office about a request.
 */
export async function notifyAdmins(input: {
  returnId: string;
  orderId: string;
  kind: NotificationKind;
  title: string;
  body: string;
}): Promise<void> {
  await notify({
    audience: "admin",
    returnId: input.returnId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    dedupeKey: `admin:return:${input.returnId}:${input.kind}`,
  });
}

/**
 * The customer's messages, newest first.
 */
export async function getNotificationsForUser(
  userId: number,
  limit = 50
): Promise<
  {
    id: number;
    return_id: string | null;
    kind: string;
    title: string;
    body: string;
    status: string;
    read_at: string | null;
    created_at: string;
  }[]
> {
  return (await getDb()
    .prepare(
      `SELECT id, return_id, kind, title, body, status, read_at, created_at
         FROM notifications
        WHERE user_id = ? AND audience = 'customer'
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(userId, limit)) as never;
}

/**
 * How many of the customer's messages they have not read.
 */
export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE user_id = ? AND audience = 'customer' AND status = 'unread'`
    )
    .get(userId)) as { n?: number } | undefined;
  return Number(row?.n ?? 0);
}

/**
 * Marks a message as read.
 *
 * The message has to belong to the person marking it, so one customer
 * cannot read another's mail.
 */
export async function markNotificationRead(
  id: number,
  userId: number
): Promise<boolean> {
  const result = (await getDb()
    .prepare(
      `UPDATE notifications
          SET status = 'read', read_at = datetime('now')
        WHERE id = ? AND user_id = ? AND audience = 'customer'`
    )
    .run(id, userId)) as { changes: number };
  return result.changes > 0;
}

/**
 * Marks every one of the customer's messages as read.
 */
export async function markAllNotificationsRead(userId: number): Promise<number> {
  const result = (await getDb()
    .prepare(
      `UPDATE notifications
          SET status = 'read', read_at = datetime('now')
        WHERE user_id = ? AND audience = 'customer' AND status = 'unread'`
    )
    .run(userId)) as { changes: number };
  return result.changes;
}
