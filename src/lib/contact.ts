import { getDb } from "./db";

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
  subject: ContactSubject;
  orderId: string | null;
  message: string;
};

/** Records an enquiry from the contact page. */
export function createContactMessage(input: ContactMessage): void {
  getDb()
    .prepare(
      `INSERT INTO contact_messages (name, email, subject, order_id, message)
       VALUES (?,?,?,?,?)`
    )
    .run(input.name, input.email, input.subject, input.orderId, input.message);
}
