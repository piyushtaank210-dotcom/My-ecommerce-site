"use client";

import { useActionState } from "react";
import { Loader2, AlertCircle, XCircle, CheckCircle2 } from "lucide-react";
import {
  requestCancellationAction,
  type CancellationActionState,
} from "@/lib/cancellation-actions";
import {
  CANCELLATION_DISPATCH_LABEL,
  CANCELLATION_STATUS_LABEL,
  type OrderCancellation,
} from "@/lib/cancellation-status";

const initial: CancellationActionState = { ok: false };

/**
 * The customer's request to cancel an order.
 *
 * An order that has not shipped is cancelled outright. One that is
 * already on its way is a request the back office looks at, because the
 * goods are in the courier's van. One that has been delivered is not
 * cancelled at all — it is returned or replaced under the return rules,
 * and the wording says so.
 */
export function CancellationRequestForm({
  orderId,
  orderStatus,
  dispatchState,
  existing,
}: {
  orderId: string;
  orderStatus: string;
  dispatchState: "before_dispatch" | "after_dispatch" | "after_delivery";
  existing?: OrderCancellation | null;
}) {
  const [state, formAction, isPending] = useActionState(
    requestCancellationAction,
    initial
  );

  if (dispatchState === "after_delivery") {
    return (
      <section className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <XCircle className="h-4 w-4 text-gray-400" />
          This order has been delivered
        </h2>
        <p className="mt-1 text-[12.5px] text-gray-600">
          A delivered order is not cancelled — it is returned or replaced
          under our return rules. If the unit is damaged, faulty, not what
          you ordered, or missing parts, raise it and we will put it
          right.
        </p>
      </section>
    );
  }

  if (existing) {
    return (
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <CheckCircle2 className="h-4 w-4 text-brand" />
          Cancellation request {existing.id}
        </h2>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500">Status</dt>
            <dd className="font-semibold text-ink">
              {CANCELLATION_STATUS_LABEL[existing.status]}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500">Order was</dt>
            <dd className="font-medium text-ink">
              {CANCELLATION_DISPATCH_LABEL[existing.dispatch_state]}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Your reason</dt>
            <dd className="mt-1 rounded-lg bg-gray-50 p-3 text-[12.5px] text-gray-700">
              {existing.reason}
            </dd>
          </div>
          {existing.rejection_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
              <span className="font-bold">Why we could not cancel this: </span>
              {existing.rejection_reason}
            </div>
          )}
          {existing.status === "approved" && existing.refund_status === "pending" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
              The order is cancelled and the refund has been raised. We
              will confirm it as paid once the payment provider does.
            </p>
          )}
          {existing.status === "approved" && existing.refund_status === "processed" && (
            <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-[12.5px] text-green-800">
              The order is cancelled and the refund has been made
              {existing.refund_reference ? ` (ref ${existing.refund_reference})` : ""}.
            </p>
          )}
        </dl>
      </section>
    );
  }

  const shipped = dispatchState === "after_dispatch";

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
        <XCircle className="h-4 w-4 text-gray-400" />
        Cancel this order
      </h2>
      <p className="mt-1 text-[12.5px] text-gray-600">
        {shipped
          ? "This order has already shipped. Tell us why and we will look at it — cancellation at this stage is subject to the shipping and return process."
          : "This order has not shipped yet. Tell us why and we will cancel it."}
        {orderStatus === "packed" && !shipped
          ? " It has been packed, so it may have already left the warehouse."
          : ""}
      </p>

      {state.message && (
        <div
          className={`mt-3 rounded-lg border p-3 text-[12.5px] font-medium ${
            state.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{state.message}</p>
          </div>
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <div>
          <label
            htmlFor="cancelReason"
            className="block text-[13px] font-semibold text-ink"
          >
            Why do you want to cancel?
          </label>
          <textarea
            id="cancelReason"
            name="reason"
            rows={3}
            required
            placeholder="Tell us what changed — it helps us decide quickly."
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-outline btn-sm"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Request cancellation"
          )}
        </button>
      </form>
    </section>
  );
}
