"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Reply as ReplyIcon, Send, X } from "lucide-react";
import { toast } from "@/components/Toaster";

/**
 * The shop's answer to a customer.
 *
 * The button opens a letter: the customer's name and address are on it,
 * the message they wrote is above it, and the reply is written below.
 * It is sent through the shop's own mail service and recorded against
 * the enquiry, so the conversation is there to be read afterwards.
 *
 * The button is busy while the reply is on its way, and it stays busy
 * until the mail service has answered — a reply that is still being
 * sent must not be sent a second time.
 */

/** A key that is not written down anywhere else. */
function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function EnquiryReplyButton({
  messageId,
  customerName,
  customerEmail,
  subjectLabel,
  orderId,
  receivedAt,
  originalMessage,
}: {
  messageId: number;
  customerName: string;
  customerEmail: string;
  /** The subject the customer chose, in words. */
  subjectLabel: string;
  orderId: string | null;
  /** When the enquiry arrived, as it is written. */
  receivedAt: string;
  /** What the customer wrote. */
  originalMessage: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary btn-sm"
        title={`Reply to ${customerName}`}
      >
        <ReplyIcon className="h-3.5 w-3.5" />
        Reply
      </button>

      {open && (
        <ReplyLetter
          messageId={messageId}
          customerName={customerName}
          customerEmail={customerEmail}
          subjectLabel={subjectLabel}
          orderId={orderId}
          receivedAt={receivedAt}
          originalMessage={originalMessage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The letter itself. */
function ReplyLetter({
  messageId,
  customerName,
  customerEmail,
  subjectLabel,
  orderId,
  receivedAt,
  originalMessage,
  onClose,
}: {
  messageId: number;
  customerName: string;
  customerEmail: string;
  subjectLabel: string;
  orderId: string | null;
  receivedAt: string;
  originalMessage: string;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The key the reply is written under. It is made when the letter is
  // opened, and it is the same for every attempt of this letter — so a
  // second click is the same reply arriving twice, not a second email.
  const keyRef = useRef({ base: newKey(), attempt: 0 });
  const router = useRouter();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function send() {
    if (busy) return;
    if (!body.trim()) {
      setError("Write a reply before sending it.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const replyKey = `${keyRef.current.base}-${keyRef.current.attempt}`;
      const res = await fetch(`/api/admin/messages/${messageId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, replyKey }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "The reply could not be sent.");
        // The next attempt is a new one, so that a reply that did not go
        // out can be written and sent again.
        keyRef.current.attempt += 1;
        toast(data?.error ?? "The reply could not be sent.", "error");
        return;
      }

      toast(
        data?.status === "duplicate"
          ? "That reply has already been sent."
          : "The reply has been sent.",
        "success"
      );
      onClose();
      router.refresh();
    } catch {
      setError("The reply could not be sent. Check the shop's connection.");
      keyRef.current.attempt += 1;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Reply to ${customerName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-ink">
              Reply to {customerName}
            </h2>
            <p className="mt-1 text-[12.5px] text-gray-600">
              The reply goes to the address on the enquiry.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Who it is going to, so that it is never a guess. */}
          <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">
                {customerName}
              </p>
              <p className="truncate text-[12.5px] text-gray-600">
                {customerEmail}
              </p>
            </div>
          </div>

          {/* What is being answered. */}
          <div className="mt-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">
              Their message
            </p>
            <p className="mt-1 text-[12px] text-gray-500">
              {subjectLabel}
              {orderId ? ` · Order ${orderId}` : ""} · {receivedAt}
            </p>
            <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-gray-700">
              {originalMessage}
            </div>
          </div>

          {/* What the shop writes. */}
          <div className="mt-4">
            <label
              htmlFor={`reply-${messageId}`}
              className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400"
            >
              Your reply
            </label>
            <textarea
              id={`reply-${messageId}`}
              ref={textareaRef}
              rows={6}
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your reply here…"
              className="input mt-1.5 resize-y"
            />
            <p className="mt-1.5 text-[12px] text-gray-500">
              It is sent as plain text, with the enquiry quoted below it so
              the customer knows what is being answered.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-outline btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="btn btn-primary btn-sm"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send reply
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
