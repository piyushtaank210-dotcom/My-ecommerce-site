"use client";

import { useActionState, useState } from "react";
import {
  approveReturnAction,
  rejectReturnAction,
  schedulePickupAction,
  recordQcAction,
  processRefundAction,
  dispatchReplacementAction,
  addStaffNoteAction,
  type AdminReturnState,
} from "@/lib/admin-return-actions";
import type { ReturnRequest } from "@/lib/return-status";
import { money } from "@/lib/format";
import { Check, X, Truck, ClipboardCheck, CreditCard, Send, Loader2 } from "lucide-react";

const initial: AdminReturnState = { ok: false };

export function ReturnAdminActions({ ret }: { ret: ReturnRequest }) {
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
    processRefundAction,
    initial
  );

  // 5. Replacement
  const [replacementState, replacementAction, isReplacementPending] = useActionState(
    dispatchReplacementAction,
    initial
  );

  // 6. Notes
  const [noteState, noteAction, isNotePending] = useActionState(
    addStaffNoteAction,
    initial
  );

  const decisionsArray = ret.items.map((it) => ({
    itemId: it.id,
    decision: itemDecisions[it.id] ?? "restock",
  }));

  return (
    <div className="space-y-6">
      {/* 1. APPROVE / REJECT PANEL (For 'requested' state) */}
      {ret.status === "requested" && (
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

      {/* 3. QUALITY CHECK (QC) & RECEIPT PANEL */}
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

      {/* 4. REFUND SETTLEMENT PANEL (When QC is passed and type === 'return') */}
      {ret.type === "return" && (ret.status === "qc_passed" || (ret.status === "received" && ret.qc_status === "passed")) && (
        <section className="rounded-xl border border-green-200 bg-green-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <CreditCard className="h-4 w-4 text-green-700" />
            Process Refund
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            Record the financial refund transaction to complete this return.
          </p>

          {refundState.message && (
            <p className={`mt-3 text-[13px] ${refundState.ok ? "text-green-700" : "text-red-600"}`}>
              {refundState.message}
            </p>
          )}

          <form action={refundAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <div className="grid gap-4 sm:grid-cols-3">
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
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink font-bold"
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

              <div>
                <label className="block text-[12px] font-semibold text-gray-600">
                  Bank Reference / UTR Number *
                </label>
                <input
                  type="text"
                  name="reference"
                  required
                  placeholder="e.g. UTR492819482910"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-600">
                Settlement Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional confirmation note or bank receipt ref..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isRefundPending}
              className="btn btn-primary btn-sm bg-green-700 hover:bg-green-800 border-green-700"
            >
              {isRefundPending ? "Settling refund..." : "Confirm Refund & Mark Completed"}
            </button>
          </form>
        </section>
      )}

      {/* 5. REPLACEMENT DISPATCH PANEL (When QC is passed and type === 'replacement') */}
      {ret.type === "replacement" && (ret.status === "qc_passed" || (ret.status === "received" && ret.qc_status === "passed")) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Truck className="h-4 w-4 text-blue-700" />
            Dispatch Replacement Shipment
          </h2>
          <p className="mt-1 text-[12.5px] text-gray-600">
            Deduct replacement units from warehouse stock and record the outbound tracking number.
          </p>

          {replacementState.message && (
            <p className={`mt-3 text-[13px] ${replacementState.ok ? "text-green-700" : "text-red-600"}`}>
              {replacementState.message}
            </p>
          )}

          <form action={replacementAction} className="mt-4 space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <div className="grid gap-4 sm:grid-cols-2">
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
                  New Tracking Number *
                </label>
                <input
                  type="text"
                  name="tracking"
                  required
                  placeholder="e.g. REP-TRK-789012"
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
                placeholder="Dispatched replacement unit from warehouse..."
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={isReplacementPending}
              className="btn btn-primary btn-sm bg-blue-700 hover:bg-blue-800 border-blue-700"
            >
              {isReplacementPending ? "Dispatching..." : "Dispatch Replacement & Complete"}
            </button>
          </form>
        </section>
      )}

      {/* 6. INTERNAL STAFF NOTE */}
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
