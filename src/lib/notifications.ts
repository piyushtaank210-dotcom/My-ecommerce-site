import { getDb } from "./db";
import { sendEmail, type MailResult } from "./mail";

/**
 * What the shop tells people, and how it tells them.
 *
 * Every message is written to the database first, so nothing is lost
 * when there is nowhere to send it to. The customer sees their messages
 * on their dashboard; the back office sees the ones for staff.
 *
 * An email is sent only when the shop has been given the keys it
 * needs. When it has not, the message is still recorded — marked as not
 * sent — so the shop knows what it owes the customer rather than quietly
 * forgetting.
 */

/**
 * The kinds of message the shop sends about a request.
 *
 * Every step of the journey has one: the request being made, the shop
 * looking at it, evidence being asked for, the decision, the pickup, the
 * product coming back, the inspection, and then whichever remedy the
 * customer is getting — a replacement or a refund.
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
  "replacement_delivered",
  "accessories_dispatched",
  "refund_approved",
  "refund_processing",
  "refund_completed",
  "refund_failed",
  "resolved",
  "cancelled",
  // The messages about an order itself.
  "order_confirmed",
  "order_packed",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "cancellation_requested",
  "cancellation_approved",
  "cancellation_rejected",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export { emailIsConfigured } from "./mail";

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
  /** The order it is about, when it is about an order. */
  orderId?: string | null;
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
 * The message is written down first, and the email is sent after it.
 * That order matters: if the email fails, the message is still on the
 * customer's dashboard, and the shop knows the email did not go out.
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
           (audience, user_id, email, return_id, order_id, channel, kind, title, body,
            status, dedupe_key)
         VALUES (?, ?, ?, ?, ?, 'in_app', ?, ?, ?, 'unread', ?)
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`
      )
      .run(
        input.audience,
        input.userId ?? null,
        input.email ?? null,
        input.returnId ?? null,
        input.orderId ?? null,
        input.kind,
        input.title,
        input.body,
        input.dedupeKey
      )) as { changes: number; lastInsertRowid?: number };

    // The message was already recorded — it has been said before, and
    // the email went out with it the first time.
    if (inserted.changes === 0) return;

    if (!input.email) {
      await db
        .prepare(
          "UPDATE notifications SET email_status = 'not_configured' WHERE dedupe_key = ?"
        )
        .run(input.dedupeKey);
      return;
    }

    const sent = await sendEmail({
      to: input.email,
      subject: input.title,
      body: input.body,
      // The key tells Resend that this is a message it has already
      // seen, so that a retry is not a second email.
      idempotencyKey: input.dedupeKey,
    });

    // The outcome of the email is kept apart from the read state. A
    // message can be unread on the dashboard and its email can still
    // have gone out, and the shop needs to be able to tell the two
    // apart.
    await db
      .prepare(
        `UPDATE notifications
            SET email_status = ?,
                email_error = ?,
                email_sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END
          WHERE dedupe_key = ?`
      )
      .run(sent.status, sent.error ?? null, sent.status, input.dedupeKey);
  } catch (err) {
    console.warn(
      `[notifications] could not record "${input.kind}":`,
      err instanceof Error ? err.message : err
    );
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
    orderId: input.orderId,
    kind: input.kind,
    title: input.title,
    // Every message carries the request it is about, the order it is
    // about, and a way to go and look at it — so that the customer can
    // answer without having to find the thread again.
    body: [
      input.body,
      "",
      `Request: ${input.returnId}`,
      `Order: ${input.orderId}`,
      `Track it: ${customerRequestLink(input.returnId)}`,
    ].join("\n"),
    // One message of each kind per request. The same change never sends
    // the same message twice.
    dedupeKey: `return:${input.returnId}:${input.kind}`,
  });
}

/**
 * A message to the customer about their order.
 *
 * It goes on their dashboard and, when the shop has a mail service, to
 * their inbox. The key is the order and the step, so that a retry never
 * sends a second copy.
 */
export async function notifyCustomerAboutOrder(input: {
  userId?: number | null;
  email?: string | null;
  orderId: string;
  kind: NotificationKind;
  title: string;
  body: string;
}): Promise<void> {
  await notify({
    audience: "customer",
    userId: input.userId ?? null,
    email: input.email ?? null,
    orderId: input.orderId,
    kind: input.kind,
    title: input.title,
    body: [
      input.body,
      "",
      `Order: ${input.orderId}`,
      `See it: ${customerOrderLink(input.orderId)}`,
    ].join("\n"),
    dedupeKey: `order:${input.orderId}:${input.kind}`,
  });
}

/**
 * Where the customer goes to see their request.
 */
function customerRequestLink(returnId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://consoleseller.in";
  return `${base}/account/returns/${returnId}`;
}

/**
 * Where the customer goes to see their order.
 */
function customerOrderLink(orderId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://consoleseller.in";
  return `${base}/order/${orderId}`;
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
    order_id: string | null;
    kind: string;
    title: string;
    body: string;
    status: string;
    /** What became of the email: 'sent', 'not_configured' or 'failed'. */
    email_status: string | null;
    read_at: string | null;
    created_at: string;
  }[]
> {
  return (await getDb()
    .prepare(
      `SELECT id, return_id, order_id, kind, title, body, status, email_status,
              read_at, created_at
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
