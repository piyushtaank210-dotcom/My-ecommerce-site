import { getDb } from "@/lib/db";
import { listMessages } from "@/lib/admin";
import { fail, json, requireApiPermission } from "@/lib/api";
import { MESSAGE_STATUSES, type MessageStatus } from "@/lib/contact";

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/messages/[id] — one enquiry. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("messages.view");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const message = listMessages({}).find((m) => m.id === Number(id));
  if (!message) return fail("No such enquiry.", 404);

  return json(message);
}

/** PATCH /api/admin/messages/[id] — move it along the queue. */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("messages.handle");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const messageId = Number(id);

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (!body.status || !(MESSAGE_STATUSES as readonly string[]).includes(body.status)) {
    return fail("Pick a valid status.", 400);
  }

  const closed = body.status === "closed" || body.status === "answered";
  const info = getDb()
    .prepare(
      `UPDATE contact_messages
       SET status = ?, handled_by = ?, handled_at = ?
       WHERE id = ?`
    )
    .run(
      body.status as MessageStatus,
      guard.user.id,
      closed ? new Date().toISOString() : null,
      messageId
    );

  if (!info.changes) return fail("No such enquiry.", 404);

  const updated = listMessages({}).find((m) => m.id === messageId);
  return json(updated);
}
