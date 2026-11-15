"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  NEXT_ORDER_STATUS,
  ORDER_STATUS_LABEL,
  nextOrderStatuses,
  type OrderStatus,
} from "@/lib/order-status";
import { setOrderStatusAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/**
 * Moves an order along its journey from the orders list.
 *
 * It offers only the moves that make sense from where the order is now:
 * an order that is pending can be confirmed or cancelled, an order that
 * is packed can be shipped, and a delivered order cannot be moved at
 * all. The server checks the same thing, so nothing here can put an
 * order somewhere it should not be.
 *
 * Cancelling is not on this list. A cancellation needs a reason, and the
 * reason is asked for on the order's own page.
 */
export function OrderStatusSelect({
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
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  const current = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    status as OrderStatus
  )
    ? (status as OrderStatus)
    : "pending";

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  const choices = nextOrderStatuses(current).filter((choice) => choice !== "cancelled");

  if (choices.length === 0) {
    return (
      <span className="text-[12.5px] font-medium capitalize text-gray-600">
        {ORDER_STATUS_LABEL[current]}
      </span>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={orderId} />
      <select
        name="status"
        defaultValue={current}
        aria-label={`Status for order ${orderId}`}
        disabled={isPending}
        onChange={() => formRef.current?.requestSubmit()}
        className={`h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium disabled:opacity-60 ${
          current === "cancelled"
            ? "text-red-600"
            : current === "delivered"
              ? "text-green-700"
              : current === "pending"
                ? "text-amber-700"
                : "text-ink"
        }`}
      >
        <option value={current}>{ORDER_STATUS_LABEL[current]}</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {ORDER_STATUS_LABEL[choice]}
          </option>
        ))}
      </select>
    </form>
  );
}

/**
 * The step the order is at, as a word.
 */
export function nextStatusLabel(status: string): string | null {
  const current = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).includes(
    status as OrderStatus
  )
    ? (status as OrderStatus)
    : "pending";
  const next = NEXT_ORDER_STATUS[current];
  return next ? ORDER_STATUS_LABEL[next] : null;
}
