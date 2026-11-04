"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveStockCheckAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/**
 * Settles a return.
 *
 * The units are not sellable stock until somebody has looked at them and
 * said so. This is where that happens — either they go back on the shelf,
 * or they do not, and either way the reason is recorded.
 */
export function StockCheckForm({
  orderId,
  canManage,
}: {
  orderId: string;
  canManage: boolean;
}) {
  const [state, formAction] = useActionState(resolveStockCheckAction, initial);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);
  const [action, setAction] = useState("restock");

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!canManage) {
    return (
      <p className="text-[12.5px] text-gray-500">
        An administrator settles this. The units stay off the shelf until
        then.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <label htmlFor={`action-${orderId}`} className="label">
          What to do
        </label>
        <select
          id={`action-${orderId}`}
          name="action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="input h-9 cursor-pointer"
        >
          <option value="restock">Put back into stock</option>
          <option value="write_off">Do not restock</option>
        </select>
      </div>

      <div className="min-w-[220px] flex-1">
        <label htmlFor={`reason-${orderId}`} className="label">
          Reason
        </label>
        <input
          id={`reason-${orderId}`}
          name="reason"
          required
          placeholder={
            action === "restock"
              ? "Came back, sealed, fit to sell."
              : "Came back damaged — not fit to sell."
          }
          className="input h-9"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-sm">
        Settle
      </button>
    </form>
  );
}
