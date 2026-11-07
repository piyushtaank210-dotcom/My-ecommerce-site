"use client";

import { useActionState } from "react";
import { Loader2, XCircle, CheckCircle2, CreditCard } from "lucide-react";
import {
  approveCancellationAction,
  confirmCancellationRefundAction,
  rejectCancellationAction,
  type CancellationActionState,
} from "@/lib/cancellation-actions";
import {
  CANCELLATION_DISPATCH_LABEL,
  CANCELLATION_STATUS_LABEL,
  type OrderCancellation,
} from "@/lib/cancellation-status";

const initial: CancellationActionState = { ok: false };

/**
 * A cancellation request, and the decision on it.
 *
 * Cancellation is its own thing and not a return: the order is called off
 * and the stock goes back on the shelf. The reason the customer gave is
 * kept with it, and a decision always carries a reason.
 */
export function OrderCancellationPanel({
  cancellation,
  orderTotal,
  canDecide,
}: {
  cancellation: OrderCancellation;
  orderTotal: number;
  canDecide: boolean;
}) {
  const [approveState, approveAction, isApprovePending] = useActionState(
    approveCancellationAction,
    initial
  );
  const [rejectState, rejectAction, isRejectPending] = useActionState(
    rejectCancellationAction,
    initial
  );
  const [refundState, refundAction, isRefundPending] = useActionState(
    confirmCancellationRefundAction,
    initial
  );

  const decided = cancellation.status !== "requested";

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <XCircle className="h-4 w-4 text-amber-700" />
        Cancellation request {cancellation.id}
      </h2>

      <dl className="mt-3 space-y-2 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Status</dt>
          <dd className="font-semibold text-ink">
            {CANCELLATION_STATUS_LABEL[cancellation.status]}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">The order was</dt>
          <dd className="font-medium text-ink">
            {CANCELLATION_DISPATCH_LABEL[cancellation.dispatch_state]}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-500">Asked on</dt>
          <dd className="font-medium text-ink">
            {cancellation.created_at.slice(0, 10)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">The customer&apos;s reason</dt>
          <dd className="mt-1 rounded-lg bg-white p-3 text-[12.5px] text-gray-700">
            {cancellation.reason}
          </dd>
        </div>
        {cancellation.rejection_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
            <span className="font-bold">Declined because: </span>
            {cancellation.rejection_reason}
          </div>
        )}
        {cancellation.status === "approved" && (
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-[12.5px] text-gray-700">
            The order was cancelled
            {cancellation.refund_amount > 0
              ? ` and a refund of ₹${cancellation.refund_amount.toLocaleString("en-IN")} was raised.`
              : "."}{" "}
            {cancellation.refund_status === "pending" &&
              "It is not paid until the payment provider confirms it."}
            {cancellation.refund_status === "processed" &&
              `Confirmed as paid${cancellation.refund_reference ? ` (ref ${cancellation.refund_reference})` : ""}.`}
          </div>
        )}
      </dl>

      {!decided && canDecide && (
        <div className="mt-5 space-y-4 border-t border-amber-200 pt-4">
          <p className="text-[12.5px] text-gray-700">
            {cancellation.dispatch_state === "after_dispatch"
              ? "This order has already shipped, so cancelling it is subject to the shipping and return process. Approving it stops the order and raises a refund."
              : "This order has not shipped. Approving it cancels the order and raises a refund."}
          </p>

          {approveState.message && (
            <p className={`text-[13px] ${approveState.ok ? "text-green-700" : "text-red-600"}`}>
              {approveState.message}
            </p>
          )}
          {rejectState.message && (
            <p className={`text-[13px] ${rejectState.ok ? "text-green-700" : "text-red-600"}`}>
              {rejectState.message}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <form action={approveAction} className="rounded-lg border border-green-200 bg-white p-3">
              <input type="hidden" name="cancellationId" value={cancellation.id} />
              <label className="block text-[12px] font-semibold text-gray-600">
                Refund amount (₹)
              </label>
              <input
                name="refundAmount"
                type="number"
                min={0}
                defaultValue={orderTotal}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-bold text-ink"
              />
              <label className="mt-3 block text-[12px] font-semibold text-gray-600">
                Notes for the customer
              </label>
              <input
                name="adminNotes"
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
              <button
                type="submit"
                disabled={isApprovePending}
                className="btn btn-primary btn-sm mt-3 w-full"
              >
                {isApprovePending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve the cancellation
                  </>
                )}
              </button>
            </form>

            <form action={rejectAction} className="rounded-lg border border-red-200 bg-white p-3">
              <input type="hidden" name="cancellationId" value={cancellation.id} />
              <label className="block text-[12px] font-semibold text-gray-600">
                Why we cannot cancel this *
              </label>
              <textarea
                name="rejectionReason"
                required
                rows={3}
                placeholder="The customer sees this, so it should explain the decision."
                className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
              />
              <button
                type="submit"
                disabled={isRejectPending}
                className="btn btn-outline btn-sm mt-3 w-full text-red-700 hover:border-red-300 hover:bg-red-50"
              >
                {isRejectPending ? "Declining..." : "Decline the request"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* The money. A refund that has been raised is a promise; only the
          payment provider's confirmation makes it a fact. */}
      {cancellation.status === "approved" &&
        cancellation.refund_status === "pending" &&
        canDecide && (
          <form
            action={refundAction}
            className="mt-4 rounded-lg border border-indigo-200 bg-white p-3"
          >
            <input type="hidden" name="cancellationId" value={cancellation.id} />
            <p className="text-[12.5px] text-gray-700">
              The refund has been raised but not confirmed as paid. Give the
              reference from the payment provider once the money has gone out.
            </p>
            {refundState.message && (
              <p className={`mt-2 text-[13px] ${refundState.ok ? "text-green-700" : "text-red-600"}`}>
                {refundState.message}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="block text-[12px] font-semibold text-gray-600">
                  Refund reference (UTR)
                </label>
                <input
                  name="refundReference"
                  placeholder="From the payment provider"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
              <button
                type="submit"
                disabled={isRefundPending}
                className="btn btn-outline btn-sm"
              >
                {isRefundPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-3.5 w-3.5" />
                    Confirm the refund as paid
                  </>
                )}
              </button>
            </div>
          </form>
        )}
    </section>
  );
}
