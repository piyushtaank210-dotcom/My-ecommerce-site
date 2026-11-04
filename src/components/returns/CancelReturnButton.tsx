"use client";

import { useActionState, useRef } from "react";
import { cancelReturnRequestAction, type ReturnActionState } from "@/lib/return-actions";

const initial: ReturnActionState = { ok: false };

export function CancelReturnButton({ returnId }: { returnId: string }) {
  const [state, formAction, isPending] = useActionState(
    cancelReturnRequestAction,
    initial
  );
  const formRef = useRef<HTMLFormElement>(null);

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm("Are you sure you want to cancel this return request?")) {
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="returnId" value={returnId} />
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="btn btn-outline btn-sm text-red-600 hover:border-red-300 hover:bg-red-50"
      >
        {isPending ? "Cancelling..." : "Cancel request"}
      </button>
      {state.message && !state.ok && (
        <p className="mt-1 text-[12px] text-red-600">{state.message}</p>
      )}
    </form>
  );
}

