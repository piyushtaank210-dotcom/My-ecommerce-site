"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { refreshTrackingAction } from "@/lib/admin-order-actions";
import { initialOrderActionState } from "@/lib/order-action-state";
import { toast } from "@/components/Toaster";

/**
 * Asks the courier where the parcel is.
 *
 * It is a question, not a command: the shop books its shipments by hand,
 * and this only reads what the courier already knows. Nothing here books
 * a pickup, assigns a courier or creates a shipment.
 */
export function TrackingRefreshButton({
  orderId,
  canUpdate,
}: {
  orderId: string;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(
    refreshTrackingAction,
    initialOrderActionState
  );

  useEffect(() => {
    if (state.message) {
      toast(state.message, state.ok ? "success" : "error");
    }
    if (state.done === "tracking") router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={isPending || !canUpdate}
        title={
          canUpdate
            ? "Ask the courier where this parcel is."
            : "Your role does not allow this."
        }
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {isPending ? "Asking..." : "Refresh tracking"}
      </button>
    </form>
  );
}
