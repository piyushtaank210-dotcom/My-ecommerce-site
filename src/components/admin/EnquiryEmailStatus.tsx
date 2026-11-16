"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MailWarning, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "@/components/Toaster";

/**
 * Whether the shop was told about an enquiry by email.
 *
 * The enquiry is always saved — this only says whether the notification
 * got out. Where it did not, the button sends it again, so that nothing
 * is silently missed.
 */
export function EnquiryEmailStatus({
  messageId,
  status,
  sentAt,
}: {
  messageId: number;
  /** "sent", "not_configured" or "failed" — and nothing for the old ones. */
  status: string | null;
  sentAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // The enquiries that were made before this was in place carry no
  // status at all. They are not shown as failures — they simply do not
  // say anything.
  if (!status) return null;

  const sent = status === "sent";

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/messages/${messageId}/resend-email`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? "The notification could not be sent.", "error");
        return;
      }
      toast("The notification has been sent.", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`admin-badge ${
          sent ? "admin-badge--good" : "admin-badge--warn"
        }`}
        title={
          sent
            ? sentAt
              ? `The shop was told by email on ${sentAt}.`
              : "The shop was told by email."
            : "The shop was not told by email."
        }
      >
        {sent ? (
          <>
            <CheckCircle2 className="h-3 w-3" />
            Notified
          </>
        ) : (
          <>
            <MailWarning className="h-3 w-3" />
            Not notified
          </>
        )}
      </span>

      {!sent && (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="btn btn-outline btn-sm"
          title="Send the notification again"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Send again
        </button>
      )}
    </span>
  );
}
