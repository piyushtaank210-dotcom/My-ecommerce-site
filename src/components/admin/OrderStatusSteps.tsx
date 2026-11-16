"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  NEXT_ORDER_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_TIMELINE,
  type OrderStatus,
} from "@/lib/order-status";
import { setOrderStatusAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/**
 * The rest of the order's journey.
 *
 * An order is pending until the back office checks it, and confirming it
 * means saving the courier it is going with and the number it can be
 * tracked by — so the first step here opens the shipping form rather
 * than moving the order on its own.
 *
 * After that the steps are one click each: packed, shipped, delivered.
 */
export function OrderStatusSteps({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [state, formAction, isPending] = useActionState(
    setOrderStatusAction,
    initial
  );
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  if (status === "cancelled") return null;

  const current = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    status as OrderStatus
  )
    ? (status as OrderStatus)
    : "pending";

  const steps = ORDER_TIMELINE.map((s) => s.status);
  const at = steps.indexOf(current);
  const next = NEXT_ORDER_STATUS[current];

  return (
    <section className="admin-panel">
      <div className="admin-panel-head admin-panel-head--plain">
        <div className="min-w-0">
          <h2 className="admin-panel-title">Order status</h2>
          <p className="admin-panel-sub">
            Where the parcel has got to, and what it moves on to next.
          </p>
        </div>
      </div>

      <div className="admin-panel-body">
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => {
            const done = index < at;
            const here = index === at;

            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                    here
                      ? "border-brand bg-brand text-white"
                      : done
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  {done && <Check className="h-3.5 w-3.5" />}
                  {ORDER_STATUS_LABEL[step]}
                </span>
                {index < steps.length - 1 && (
                  <span
                    className={`h-px w-4 sm:w-6 ${
                      index < at ? "bg-green-300" : "bg-gray-200"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>

        {current === "pending" && (
          <p className="mt-4 border-t border-gray-100 pt-3.5 text-[12.5px] text-gray-600">
            This order is waiting to be checked. Save its shipping details
            above to confirm it.
          </p>
        )}

        {next && current !== "pending" && (
          <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={orderId} />
            <input type="hidden" name="status" value={next} />
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-outline btn-sm"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Mark as {ORDER_STATUS_LABEL[next].toLowerCase()}
            </button>
            <span className="text-[12px] text-gray-500">
              The customer is told when the order moves on.
            </span>
          </form>
        )}
      </div>
    </section>
  );
}
