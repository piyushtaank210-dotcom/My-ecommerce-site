"use client";

import { useActionState, useState } from "react";
import {
  approveReturnAction,
  rejectReturnAction,
  schedulePickupAction,
  recordQcAction,
  initiateRefundAction,
  confirmRefundPaidAction,
  rejectRefundAction,
  markCompletedAction,
  markReceivedAction,
  requestMoreInfoAction,
  dispatchReplacementAction,
  dispatchMissingAccessoriesAction,
  setReplacementDeliveryAction,
  addStaffNoteAction,
  type AdminReturnState,
} from "@/lib/admin-return-actions";
import type {
  ReturnRequest,
  ReplacementCandidate,
} from "@/lib/return-status";
import {
  REPLACEMENT_DELIVERY_STATUSES,
  REPLACEMENT_DELIVERY_LABEL,
  REPLACEMENT_DELIVERY_TONE,
} from "@/lib/return-status";
import { money, formatDate } from "@/lib/format";
import {
  Check,
  X,
  Truck,
  ClipboardCheck,
  CreditCard,
  Send,
  Loader2,
  PackageCheck,
  HelpCircle,
  Flag,
  Banknote,
} from "lucide-react";

const initial: AdminReturnState = { ok: false };

export function ReturnAdminActions({
  ret,
  candidates = [],
}: {
  ret: ReturnRequest;
  candidates?: ReplacementCandidate[];
}) {
  // 1. Approve / Reject States
  const [approveState, approveAction, isApprovePending] = useActionState(
    approveReturnAction,
    initial
  );
  const [rejectState, rejectAction, isRejectPending] = useActionState(
    rejectReturnAction,
    initial
  );

  // 2. Pickup Scheduling
  const [pickupState, pickupAction, isPickupPending] = useActionState(
    schedulePickupAction,
    initial
  );

  // 3. QC Inspection
  const [qcState, qcAction, isQcPending] = useActionState(
    recordQcAction,
    initial
  );
  const [qcStatus, setQcStatus] = useState<"passed" | "failed">("passed");
  const [itemDecisions, setItemDecisions] = useState<
    Record<number, "restock" | "write_off" | "reject">
  >(() => {
    const map: Record<number, "restock" | "write_off" | "reject"> = {};
    ret.items.forEach((item) => {
      map[item.id] = "restock";
    });
    return map;
  });

  // 4. Refund
  const [refundState, refundAction, isRefundPending] = useActionState(
    initiateRefundAction,
    initial
  );

  // 4b. Confirming the refund has actually been paid, and refusing it.
  const [paidState, paidAction, isPaidPending] = useActionState(
    confirmRefundPaidAction,
    initial
  );
  const [refuseState, refuseAction, isRefusePending] = useActionState(
    rejectRefundAction,
    initial
  );

  // 5. Replacement
  const [replacementState, replacementAction, isReplacementPending] = useActionState(
    dispatchReplacementAction,
    initial
  );

  // 5b. Where the replacement has got to.
  const [deliveryState, deliveryAction, isDeliveryPending] = useActionState(
    setReplacementDeliveryAction,
    initial
  );

  // What is going out, item by item. It starts as the unit that came back.
  const [replacementChoice, setReplacementChoice] = useState<
    Record<number, { value: string; quantity: number }>
  >(() => {
    const map: Record<number, { value: string; quantity: number }> = {};
    for (const c of candidates) {
      const own = c.options.find((o) => o.current) ?? c.options[0];
      map[c.itemId] = { value: own?.value ?? "", quantity: c.quantity };
    }
    return map;
  });

  const choices = candidates.map((c) => {
    const pick = replacementChoice[c.itemId];
    const option = c.options.find((o) => o.value === pick?.value);
    return {
      itemId: c.itemId,
      productSlug: option?.productSlug ?? "",
      variantId: option?.variantId ?? null,
      quantity: pick?.quantity ?? c.quantity,
    };
  });

  // 6. Notes
  const [noteState, noteAction, isNotePending] = useActionState(
    addStaffNoteAction,
    initial
  );

  // 7. Asking the customer for more information
  const [infoState, infoAction, isInfoPending] = useActionState(
    requestMoreInfoAction,
    initial
  );

  // 8. The product arriving back at the warehouse
  const [receivedState, receivedAction, isReceivedPending] = useActionState(
    markReceivedAction,
    initial
  );

  // 9. Closing the request
  const [completeState, completeAction, isCompletePending] = useActionState(
    markCompletedAction,
    initial
  );

  // 10. Sending the missing accessories out.
  const [accessoriesState, accessoriesAction, isAccessoriesPending] = useActionState(
    dispatchMissingAccessoriesAction,
    initial
  );

  const decisionsArray = ret.items.map((it) => ({
    itemId: it.id,
    decision: itemDecisions[it.id] ?? "restock",
  }));

  return (
    <div className="space-y-6">
      {/* 1. APPROVE / REJECT PANEL (For 'requested' state) */}
      {(ret.status === "requested" || ret.status === "info_requested") && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
          <h2 className="text-[15px] font-bold text-ink">Review Request</h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            Verify customer details and uploaded photo proof. Decide whether to approve for courier pickup or reject.
          </p>

          {approveState.message && (
            <p className={`mt-3 text-[13px] ${approveState.ok ? "text-green-700" : "text-red-600"}`}>
              {approveState.message}
            </p>
          )}
          {rejectState.message && (
            <p className={`mt-3 text-[13px] ${rejectState.ok ? "text-green-700" : "text-red-600"}`}>
              {rejectState.message}
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Approve Form */}
            <form action={approveAction} className="rounded-lg border border-gray-200 bg-white p-4">
              <input type="hidden" name="returnId" value={ret.id} />
              <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-green-800">
                <Check className="h-4 w-4 text-green-600" />
                Approve Request
              </h3>
              <p className="mt-1 text-[12px] text-gray-500">
                Approving moves this request to pickup scheduling.
              </p>
              <textarea
                name="adminNotes"
                rows={2}
                placeholder="Optional notes for customer / internal..."
                className="mt-3 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
              />
              <button
                type="submit"
                disabled={isApprovePending}
                className="btn btn-primary btn-sm mt-3 w-full"
              >
                {isApprovePending ? "Approving..." : "Approve Return Request"}
              </button>
            </form>

            {/* Reject Form */}
            <form action={rejectAction} className="rounded-lg border border-gray-200 bg-white p-4">
              <input type="hidden" name="returnId" value={ret.id} />
              <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-red-800">
                <X className="h-4 w-4 text-red-600" />
                Reject Request
              </h3>
              <p className="mt-1 text-[12px] text-gray-500">
                Provide reason (visible to customer).
              </p>
              <textarea
                name="rejectionReason"
                required
                rows={2}
                placeholder="State why this claim is not covered (e.g. past policy window, user physical damage)..."
                className="mt-3 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
              />
              <button
                type="submit"
                disabled={isRejectPending}
                className="btn btn-outline btn-sm mt-3 w-full text-red-700 hover:bg-red-50 hover:border-red-300"
              >
                {isRejectPending ? "Rejecting..." : "Reject Return Request"}
              </button>
            </form>
          </div>

          {/* Ask the customer for more information */}
          <form
            action={infoAction}
            className="mt-4 rounded-lg border border-gray-200 bg-white p-4"
          >
            <input type="hidden" name="returnId" value={ret.id} />
            <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-gray-800">
              <HelpCircle className="h-4 w-4 text-gray-500" />
              Request More Information
            </h3>
            <p className="mt-1 text-[12px] text-gray-500">
              The question is shown to the customer on their own returns page.
            </p>
            {infoState.message && (
              <p className={`mt-2 text-[12.5px] ${infoState.ok ? "text-green-700" : "text-red-600"}`}>
                {infoState.message}
              </p>
            )}
            <textarea
              name="message"
              required
              rows={2}
              placeholder="e.g. Please upload a photo of the serial number on the box..."
              className="mt-3 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
            />
            <button
              type="submit"
              disabled={isInfoPending}
              className="btn btn-outline btn-sm mt-3 w-full"
            >
              {isInfoPending ? "Sending..." : "Ask the customer"}
            </button>
          </form>
        </section>
      )}

      {/* 2. PICKUP SCHEDULING PANEL (For 'approved' state or updating) */}
      {(ret.status === "approved" || ret.status === "pickup_scheduled") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Truck className="h-4 w-4 text-brand" />
            {ret.status === "pickup_scheduled" ? "Update Pickup Details" : "Schedule Courier Pickup"}
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            Enter the reverse logistics courier partner, AWB/tracking code, and pickup date.
          </p>

          {pickupState.message && (
            <p className={`mt-3 text-[13px] ${pickupState.ok ? "text-green-700" : "text-red-600"}`}>
              {pickupState.message}
            </p>
          )}

          <form action={pickupAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Courier Partner *
                </label>
                <input
                  type="text"
                  name="courier"
                  required
                  defaultValue={ret.pickup_courier ?? "Bluedart Express"}
                  placeholder="e.g. Bluedart, Delhivery"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Tracking / AWB Number *
                </label>
                <input
                  type="text"
                  name="tracking"
                  required
                  defaultValue={ret.pickup_tracking ?? ""}
                  placeholder="e.g. AWB987654321"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Scheduled Pickup Date *
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={ret.pickup_date ?? new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Pickup Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional instructions for warehouse or courier..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isPickupPending}
              className="btn btn-primary btn-sm"
            >
              {isPickupPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving pickup...
                </>
              ) : ret.status === "pickup_scheduled" ? (
                "Update Pickup Info"
              ) : (
                "Save & Dispatch Pickup"
              )}
            </button>
          </form>
        </section>
      )}

      {/* 3. THE PRODUCT ARRIVING BACK */}
      {(ret.status === "pickup_scheduled" || ret.status === "approved") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <PackageCheck className="h-4 w-4 text-brand" />
            Mark Product Received
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            The parcel has arrived at the warehouse and is waiting for inspection.
          </p>

          {receivedState.message && (
            <p className={`mt-3 text-[13px] ${receivedState.ok ? "text-green-700" : "text-red-600"}`}>
              {receivedState.message}
            </p>
          )}

          <form action={receivedAction} className="mt-4 space-y-3">
            <input type="hidden" name="returnId" value={ret.id} />
            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Receipt Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional — what came in, and in what condition..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>
            <button
              type="submit"
              disabled={isReceivedPending}
              className="btn btn-primary btn-sm"
            >
              {isReceivedPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recording...
                </>
              ) : (
                "Mark as Received"
              )}
            </button>
          </form>
        </section>
      )}

      {/* 4. QUALITY CHECK (QC) & RECEIPT PANEL */}
      {(ret.status === "pickup_scheduled" || ret.status === "received") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <ClipboardCheck className="h-4 w-4 text-brand" />
            Item Receipt & Quality Inspection (QC)
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            Confirm package arrival at warehouse, inspect the unit condition, and decide stock disposition.
          </p>

          {qcState.message && (
            <p className={`mt-3 text-[13px] ${qcState.ok ? "text-green-700" : "text-red-600"}`}>
              {qcState.message}
            </p>
          )}

          <form action={qcAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <input type="hidden" name="qcStatus" value={qcStatus} />
            <input type="hidden" name="decisions" value={JSON.stringify(decisionsArray)} />

            <div>
              <label className="block text-[12.5px] font-semibold text-gray-700">
                Overall QC Result *
              </label>
              <div className="mt-2 flex items-center gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
                  <input
                    type="radio"
                    name="_qcStatus"
                    value="passed"
                    checked={qcStatus === "passed"}
                    onChange={() => setQcStatus("passed")}
                    className="h-4 w-4 text-brand focus:ring-brand"
                  />
                  <span>QC Passed (Condition as claimed)</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
                  <input
                    type="radio"
                    name="_qcStatus"
                    value="failed"
                    checked={qcStatus === "failed"}
                    onChange={() => setQcStatus("failed")}
                    className="h-4 w-4 text-brand focus:ring-brand"
                  />
                  <span>QC Failed (Damaged / Missing components / Discrepancy)</span>
                </label>
              </div>
            </div>

            {/* Item-level stock decision */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <h3 className="text-[13px] font-bold text-ink">
                Item Stock Action
              </h3>
              {ret.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 text-[13px]"
                >
                  <span className="font-medium text-ink">
                    {item.name} × {item.quantity}
                  </span>
                  <select
                    value={itemDecisions[item.id] ?? "restock"}
                    onChange={(e) =>
                      setItemDecisions((prev) => ({
                        ...prev,
                        [item.id]: e.target.value as "restock" | "write_off" | "reject",
                      }))
                    }
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink"
                  >
                    <option value="restock">
                      Restock into sellable inventory (+{item.quantity})
                    </option>
                    <option value="write_off">
                      Write off as damaged / scrap (do not add stock)
                    </option>
                    <option value="reject">Reject item</option>
                  </select>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Inspection Findings & Condition Notes *
              </label>
              <textarea
                name="notes"
                required
                rows={2}
                placeholder="Inspected box, serial verified, controller included, no physical damage..."
                className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isQcPending}
              className="btn btn-primary btn-sm"
            >
              {isQcPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recording inspection...
                </>
              ) : (
                "Submit QC & Update Stock"
              )}
            </button>
          </form>
        </section>
      )}

      {/* 5. REFUND PANEL (When QC is passed and type === 'return') */}
      {ret.type === "return" && (ret.status === "qc_passed" || (ret.status === "received" && ret.qc_status === "passed")) && (
        <section className="rounded-xl border border-green-200 bg-green-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <CreditCard className="h-4 w-4 text-green-700" />
            Approve the Refund
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            Approving the refund says the money will go back. It does not say it
            has. The payment is confirmed separately, once it has actually gone
            out.
          </p>

          {refundState.message && (
            <p className={`mt-3 text-[13px] ${refundState.ok ? "text-green-700" : "text-red-600"}`}>
              {refundState.message}
            </p>
          )}

          <form action={refundAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Refund Amount (₹) *
                </label>
                <input
                  type="number"
                  name="amount"
                  required
                  min={1}
                  defaultValue={ret.refund_amount || ret.items.reduce((sum, it) => sum + it.price * it.quantity, 0)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-bold text-ink"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Payment Method *
                </label>
                <select
                  name="method"
                  defaultValue="Original Payment Source"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-ink"
                >
                  <option value="Original Payment Source">Original Payment Source (UPI/Card)</option>
                  <option value="Bank IMPS/NEFT">Bank IMPS / NEFT Transfer</option>
                  <option value="UPI Direct">UPI Direct Transfer</option>
                  <option value="Store Credit">Store Credit / Wallet</option>
                  <option value="Cash Refund">Cash Refund</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional — anything the customer should know about the refund..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isRefundPending}
              className="btn btn-primary btn-sm bg-green-700 hover:bg-green-800 border-green-700"
            >
              {isRefundPending ? "Approving..." : "Approve Refund"}
            </button>
          </form>
        </section>
      )}

      {/* 5b. THE REFUND IS RAISED — IS THE MONEY OUT? */}
      {ret.type === "return" && ret.status === "refund_pending" && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Banknote className="h-4 w-4 text-amber-700" />
            The Refund
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            {ret.refund_status === "processed"
              ? `Paid — ${money(ret.refund_amount)} went back on ${
                  ret.refund_processed_at ? formatDate(ret.refund_processed_at) : ""
                }${ret.refund_reference ? ` under reference ${ret.refund_reference}` : ""}.`
              : `Raised — ${money(ret.refund_amount)} is owed to the customer by ${
                  ret.refund_method ?? "the original payment source"
                }. It is not paid until it is confirmed below.`}
          </p>

          {paidState.message && (
            <p className={`mt-3 text-[13px] ${paidState.ok ? "text-green-700" : "text-red-600"}`}>
              {paidState.message}
            </p>
          )}
          {refuseState.message && (
            <p className={`mt-3 text-[13px] ${refuseState.ok ? "text-green-700" : "text-red-600"}`}>
              {refuseState.message}
            </p>
          )}

          {ret.refund_status !== "processed" && (
            <>
              <form action={paidAction} className="mt-4 space-y-4">
                <input type="hidden" name="returnId" value={ret.id} />
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600">
                    Reference the refund was paid under *
                  </label>
                  <input
                    type="text"
                    name="reference"
                    required
                    placeholder="e.g. UTR492819482910"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600">
                    Notes
                  </label>
                  <input
                    type="text"
                    name="notes"
                    placeholder="Optional — when it went out, and how..."
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPaidPending}
                  className="btn btn-primary btn-sm bg-green-700 hover:bg-green-800 border-green-700"
                >
                  {isPaidPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    "Confirm the Refund Has Been Paid"
                  )}
                </button>
              </form>

              <form action={refuseAction} className="mt-5 border-t border-amber-200 pt-5">
                <input type="hidden" name="returnId" value={ret.id} />
                <label className="block text-[12px] font-semibold text-gray-600">
                  Refuse the refund instead
                </label>
                <p className="mt-1 text-[12px] text-gray-500">
                  The customer is told why. A reason is required.
                </p>
                <textarea
                  name="reason"
                  required
                  rows={2}
                  placeholder="e.g. The unit was not returned in the condition claimed..."
                  className="mt-2 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
                />
                <button
                  type="submit"
                  disabled={isRefusePending}
                  className="btn btn-outline btn-sm mt-3 text-red-700 hover:border-red-300 hover:bg-red-50"
                >
                  {isRefusePending ? "Refusing..." : "Refuse the Refund"}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {/* 6. REPLACEMENT DISPATCH PANEL (When QC is passed and type === 'replacement') */}
      {ret.type === "replacement" && (ret.status === "qc_passed" || (ret.status === "received" && ret.qc_status === "passed")) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Truck className="h-4 w-4 text-blue-700" />
            Create the Replacement Shipment
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            Choose what is going out. The shelf is checked again when the
            shipment is created, so what is shown here is never the last word.
          </p>

          {replacementState.message && (
            <p className={`mt-3 text-[13px] ${replacementState.ok ? "text-green-700" : "text-red-600"}`}>
              {replacementState.message}
            </p>
          )}

          <form action={replacementAction} className="mt-4 space-y-5">
            <input type="hidden" name="returnId" value={ret.id} />
            <input type="hidden" name="choices" value={JSON.stringify(choices)} />

            {/* What is going out, item by item. */}
            <div className="space-y-3">
              {candidates.map((candidate) => {
                const pick = replacementChoice[candidate.itemId];
                const option = candidate.options.find((o) => o.value === pick?.value);
                const wanted = pick?.quantity ?? candidate.quantity;
                const short = option ? option.stock < wanted : false;

                return (
                  <div
                    key={candidate.itemId}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13px] font-bold text-ink">
                        {candidate.itemName}
                      </p>
                      <p className="text-[12px] text-gray-500">
                        {candidate.quantity} unit{candidate.quantity === 1 ? "" : "s"} came back
                      </p>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem]">
                      <div>
                        <label className="block text-[12px] font-semibold text-gray-600">
                          Send instead
                        </label>
                        <select
                          name="replacementChoice"
                          value={pick?.value ?? ""}
                          onChange={(e) =>
                            setReplacementChoice((prev) => ({
                              ...prev,
                              [candidate.itemId]: {
                                ...prev[candidate.itemId],
                                value: e.target.value,
                              },
                            }))
                          }
                          className="mt-1 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] text-ink"
                        >
                          {candidate.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                              {o.current ? " (the unit that came back)" : ""} —{" "}
                              {o.stock > 0 ? `${o.stock} in stock` : "out of stock"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold text-gray-600">
                          How many
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={wanted}
                          onChange={(e) =>
                            setReplacementChoice((prev) => ({
                              ...prev,
                              [candidate.itemId]: {
                                ...prev[candidate.itemId],
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                        />
                      </div>
                    </div>

                    {option && (
                      <p
                        className={`mt-2 text-[12px] ${
                          short ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        {short
                          ? `Only ${option.stock} on the shelf — pick another, or wait for stock.`
                          : `${option.stock} on the shelf.`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Outbound Courier *
                </label>
                <input
                  type="text"
                  name="courier"
                  required
                  defaultValue="Bluedart Express"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Tracking / AWB Number *
                </label>
                <input
                  type="text"
                  name="tracking"
                  required
                  placeholder="e.g. REP-TRK-789012"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Dispatch Date
                </label>
                <input
                  type="date"
                  name="dispatchDate"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Dispatch Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Which unit went out, and anything the customer should know..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isReplacementPending}
              className="btn btn-primary btn-sm bg-blue-700 hover:bg-blue-800 border-blue-700"
            >
              {isReplacementPending ? "Dispatching..." : "Create the Replacement Shipment"}
            </button>
          </form>
        </section>
      )}

      {/* 6b. THE REPLACEMENT IS ON ITS WAY */}
      {ret.type === "replacement" && ret.status === "replacement_pending" && ret.replacement_order_id && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Truck className="h-4 w-4 text-brand" />
            The Replacement
          </h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Shipment</dt>
              <dd className="tnum font-medium text-ink">{ret.replacement_order_id}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Courier</dt>
              <dd className="font-medium text-ink">{ret.replacement_courier ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Tracking / AWB</dt>
              <dd className="tnum font-medium text-ink">{ret.replacement_tracking ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Dispatched on</dt>
              <dd className="font-medium text-ink">{ret.replacement_dispatch_date ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Delivery</dt>
              <dd>
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                    REPLACEMENT_DELIVERY_TONE[
                      ret.replacement_delivery_status ?? "dispatched"
                    ]
                  }`}
                >
                  {
                    REPLACEMENT_DELIVERY_LABEL[
                      ret.replacement_delivery_status ?? "dispatched"
                    ]
                  }
                </span>
              </dd>
            </div>
          </dl>

          {deliveryState.message && (
            <p className={`mt-3 text-[13px] ${deliveryState.ok ? "text-green-700" : "text-red-600"}`}>
              {deliveryState.message}
            </p>
          )}

          <form action={deliveryAction} className="mt-4 space-y-3">
            <input type="hidden" name="returnId" value={ret.id} />
            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Where it has got to
              </label>
              <select
                name="deliveryStatus"
                defaultValue={ret.replacement_delivery_status ?? "dispatched"}
                className="mt-1 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[13px] text-ink sm:w-72"
              >
                {REPLACEMENT_DELIVERY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {REPLACEMENT_DELIVERY_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional — what the courier said..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>
            <button type="submit" disabled={isDeliveryPending} className="btn btn-outline btn-sm">
              {isDeliveryPending ? "Recording..." : "Record the delivery"}
            </button>
          </form>
        </section>
      )}
      {/* 6b. THE MISSING ACCESSORIES GOING OUT */}
      {ret.type === "accessories" && ret.status !== "completed" && ret.status !== "rejected" && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Truck className="h-4 w-4 text-blue-700" />
            Send the Missing Accessories
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            The customer keeps the console or controller. Nothing is
            collected and nothing is refunded — the parts go out to them,
            and the request closes when they have been sent.
          </p>

          {ret.missing_accessories && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-gray-500">
                What the customer says is missing
              </p>
              <p className="mt-1 whitespace-pre-line text-[13px] text-gray-700">
                {ret.missing_accessories}
              </p>
            </div>
          )}

          {accessoriesState.message && (
            <p className={`mt-3 text-[13px] ${accessoriesState.ok ? "text-green-700" : "text-red-600"}`}>
              {accessoriesState.message}
            </p>
          )}

          <form action={accessoriesAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Courier *
                </label>
                <input
                  name="courier"
                  required
                  placeholder="Delhivery, Blue Dart..."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Tracking number *
                </label>
                <input
                  name="tracking"
                  required
                  placeholder="The number the customer will track"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Notes for the customer
              </label>
              <textarea
                name="notes"
                rows={2}
                placeholder="What is in the parcel, and when to expect it."
                className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
              />
            </div>
            <button
              type="submit"
              disabled={isAccessoriesPending}
              className="btn btn-primary btn-sm"
            >
              {isAccessoriesPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recording the shipment...
                </>
              ) : (
                "Record the shipment and close the request"
              )}
            </button>
          </form>
        </section>
      )}

      {/* 6c. Where the missing accessories have got to. */}
      {ret.type === "accessories" && ret.accessories_dispatched_at && (
        <section className="rounded-xl border border-green-200 bg-green-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Flag className="h-4 w-4 text-green-700" />
            The Accessories Have Been Sent
          </h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Courier</dt>
              <dd className="font-medium text-ink">{ret.accessories_courier}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Tracking</dt>
              <dd className="tnum font-medium text-ink">{ret.accessories_tracking}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Sent on</dt>
              <dd className="font-medium text-ink">
                {ret.accessories_dispatched_at?.slice(0, 10)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* 7. CLOSING THE REQUEST */}
      {(ret.status === "refund_pending" || ret.status === "replacement_pending") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Flag className="h-4 w-4 text-brand" />
            Mark as Completed
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            {ret.type === "replacement"
              ? "The replacement has gone out. Close the request once the customer has it."
              : ret.refund_status === "processed"
                ? "The refund has been confirmed as paid. The request can be closed."
                : "The refund has been raised but not confirmed as paid. Confirm the refund first — the request stays open until the money has actually gone back."}
          </p>

          {completeState.message && (
            <p className={`mt-3 text-[13px] ${completeState.ok ? "text-green-700" : "text-red-600"}`}>
              {completeState.message}
            </p>
          )}

          <form action={completeAction} className="mt-4 space-y-3">
            <input type="hidden" name="returnId" value={ret.id} />
            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Closing Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional — what was settled, and how..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>
            <button
              type="submit"
              disabled={isCompletePending}
              className="btn btn-primary btn-sm"
            >
              {isCompletePending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Closing...
                </>
              ) : (
                "Mark as Completed"
              )}
            </button>
          </form>
        </section>
      )}

      {/* 8. INTERNAL STAFF NOTE */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Send className="h-4 w-4 text-gray-500" />
          Add Internal Staff Note
        </h2>
        {noteState.message && (
          <p className={`mt-2 text-[12.5px] ${noteState.ok ? "text-green-700" : "text-red-600"}`}>
            {noteState.message}
          </p>
        )}
        <form action={noteAction} className="mt-3 flex gap-2">
          <input type="hidden" name="returnId" value={ret.id} />
          <input
            type="text"
            name="note"
            required
            placeholder="Log customer phone call, warehouse remark, or internal update..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
          />
          <button
            type="submit"
            disabled={isNotePending}
            className="btn btn-outline btn-sm"
          >
            {isNotePending ? "Adding..." : "Add Note"}
          </button>
        </form>
      </section>
    </div>
  );
}
