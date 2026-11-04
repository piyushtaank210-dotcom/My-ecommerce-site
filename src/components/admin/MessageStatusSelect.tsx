"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABEL,
  type MessageStatus,
} from "@/lib/message-status";
import { setMessageStatusAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/** Moves an enquiry along the support queue. */
export function MessageStatusSelect({
  messageId,
  status,
}: {
  messageId: number;
  status: string;
}) {
  const [state, formAction] = useActionState(setMessageStatusAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  const current = (MESSAGE_STATUSES as readonly string[]).includes(status)
    ? (status as MessageStatus)
    : "new";

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={messageId} />
      <select
        name="status"
        defaultValue={current}
        aria-label={`Status for enquiry ${messageId}`}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-ink"
      >
        {MESSAGE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {MESSAGE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
