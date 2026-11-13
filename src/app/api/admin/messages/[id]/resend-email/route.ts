import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { resendEnquiryEmail } from "@/lib/contact";

/**
 * POST /api/admin/messages/[id]/resend-email
 *
 * Sends the shop's notification for an enquiry again.
 *
 * It is used when a message could not be sent — the shop has set the
 * mail service up, or the service was down — so that no enquiry is
 * silently missed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("messages.handle");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return fail("That is not an enquiry.", 400);
  }

  const result = await resendEnquiryEmail(messageId);
  if (!result.ok) return fail(result.message, 400);

  return json({ ok: true, message: result.message });
}
