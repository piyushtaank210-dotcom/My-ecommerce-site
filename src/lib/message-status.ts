/**
 * Where an enquiry sits in the support queue.
 *
 * Its own module, with no database import, so client components can use the
 * labels without pulling `node:sqlite` into the browser bundle.
 */
export const MESSAGE_STATUSES = [
  "new",
  "open",
  "answered",
  "closed",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  new: "New",
  open: "In progress",
  answered: "Answered",
  closed: "Closed",
};

export function isMessageStatus(value: unknown): value is MessageStatus {
  return (
    typeof value === "string" &&
    (MESSAGE_STATUSES as readonly string[]).includes(value)
  );
}
