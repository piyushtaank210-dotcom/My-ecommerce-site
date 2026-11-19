import { fail, json, requireApiPermission } from "@/lib/api";
import { sendEnquiryReply } from "@/lib/enquiry-replies";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/messages/[id]/reply
 *
 *   { "body": "…", "replyKey": "…" }
 *
 * Answers a customer by email.
 *
 * Only the staff who work the enquiries queue may do this, and the
 * reply is recorded before the mail service is asked to send it — so a
 * reply that could not be sent is never recorded as one that went out,
 * and a second request carrying the same key is the same reply arriving
 * twice rather than a second email.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("messages.handle");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return fail("That is not an enquiry.", 400);
  }

  let body: { body?: unknown; replyKey?: unknown };
  try {
    body = (await request.json()) as { body?: unknown; replyKey?: unknown };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const result = await sendEnquiryReply({
    messageId,
    body: typeof body.body === "string" ? body.body : "",
    replyKey: typeof body.replyKey === "string" ? body.replyKey : "",
    sentBy: guard.user.id,
    sentByName: guard.user.name,
  });

  if (!result.ok) {
    const status =
      result.problem === "not_found"
        ? 404
        : result.problem === "invalid" || result.problem === "no_address"
          ? 400
          : 502;
    return fail(result.message, status);
  }

  return json({
    ok: true,
    status: result.status,
    message: result.message,
    reply: result.reply,
  });
}
