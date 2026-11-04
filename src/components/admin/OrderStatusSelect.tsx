"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@/lib/order-status";
import { setOrderStatusAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/**
 * Moves an order along its journey. The select submits itself the moment it
 * changes — no separate save button to forget.
 */
export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [state, formAction] = useActionState(setOrderStatusAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  const current = (ORDER_STATUSES as readonly string[]).includes(status)
    ? (status as OrderStatus)
    : "confirmed";

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={orderId} />
      <select
        name="status"
        defaultValue={current}
        aria-label={`Status for order ${orderId}`}
        onChange={() => formRef.current?.requestSubmit()}
        className={`h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium ${
          current === "cancelled"
            ? "text-red-600"
            : current === "delivered"
              ? "text-green-700"
              : "text-ink"
        }`}
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
