"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  PackageCheck,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";
import {
  cancelOrderAction,
  confirmOrderAction,
  refundOrderAction,
  refreshRefundStatusAction,
} from "@/lib/admin-order-actions";
import { initialOrderActionState } from "@/lib/order-action-state";
import {
  CANCELLATION_REASON_CODES,
  CANCELLATION_REASON_LABEL,
  SHIPPING_METHODS,
  SHIPPING_METHOD_LABEL,
} from "@/lib/order-dispatch-options";
import { money } from "@/lib/format";
import { toast } from "@/components/Toaster";

/**
 * The actions the back office takes on an order.
 *
 * The order is confirmed with its shipping details, cancelled with a
 * reason, and refunded through the payment gateway. All three are done
 * on the server — this component asks, and shows what came back.
 *
 * The button is a split one: the body of it opens the shipping form,
 * and the arrow beside it opens the menu the cancellation is in. The
 * refund button is greyed out until the order has actually been
 * cancelled, because there is nothing to refund before that.
 */
export function OrderActionBar({
  orderId,
  status,
  customerName,
  total,
  paymentReference,
  paymentGateway,
  hasShipping,
  canUpdate,
  refundStatus,
}: {
  orderId: string;
  status: string;
  customerName: string;
  total: number;
  paymentReference: string | null;
  paymentGateway: string | null;
  hasShipping: boolean;
  canUpdate: boolean;
  refundStatus: string;
}) {  const router = useRouter();

  const [shippingState, shippingAction, isShippingPending] = useActionState(
    confirmOrderAction,
    initialOrderActionState
  );
  const [cancelState, cancelAction, isCancelPending] = useActionState(
    cancelOrderAction,
    initialOrderActionState
  );
  const [refundState, refundAction, isRefundPending] = useActionState(
    refundOrderAction,
    initialOrderActionState
  );
  const [statusState, statusAction, isStatusPending] = useActionState(
    refreshRefundStatusAction,
    initialOrderActionState
  );

  const [shippingOpen, setShippingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [method, setMethod] = useState("surface");
  const [reasonCode, setReasonCode] = useState<string>("");

  const menuRef = useRef<HTMLDivElement>(null);

  const cancelled = status === "cancelled";
  const pending = status === "pending";
  const refunded = refundStatus === "processed";
  const refundStarted = refundStatus === "pending" || refundStatus === "processed";

  /* The menu closes when the click lands outside it, and on Escape. */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* Each action says what happened, once, and the page is looked at
     again so that what is on it is what the database says. */
  useEffect(() => {
    if (shippingState.message) {
      toast(shippingState.message, shippingState.ok ? "success" : "error");
    }
    if (shippingState.done === "shipping") {
      setShippingOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingState]);

  useEffect(() => {
    if (cancelState.message) {
      toast(cancelState.message, cancelState.ok ? "success" : "error");
    }
    if (cancelState.done === "cancel") {
      setCancelOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelState]);

  useEffect(() => {
    if (refundState.message) {
      toast(refundState.message, refundState.ok ? "success" : "error");
    }
    if (refundState.done === "refund") {
      setRefundOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundState]);

  useEffect(() => {
    if (statusState.message) {
      toast(statusState.message, statusState.ok ? "success" : "error");
    }
    if (statusState.done === "refund-status") router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusState]);

  const shippingError = shippingState.field ? shippingState.message : null;
  const cancelError = cancelState.field ? cancelState.message : null;

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-[14px] font-bold text-ink">Order actions</h2>
          {!cancelled && (
            <span className="text-[12px] text-gray-500">
              {pending
                ? "This order is waiting to be checked. Confirm it with its shipping details."
                : hasShipping
                  ? "The shipping details below can be changed."
                  : "Save the shipping details before the order is confirmed."}
            </span>
          )}
        </header>

        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {cancelled ? (
              <p className="flex items-center gap-2 text-[13px] font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                This order was cancelled.
              </p>
            ) : (
              /* The split button: the body confirms, the arrow opens
                 the menu the cancellation is in.

                 The two halves are wrapped in a box of their own so
                 that the corners are rounded and the join between them
                 is a hairline. The menu sits outside that box, because a
                 box that cuts its corners off would cut the menu off
                 with them. */
              <div className="relative" ref={menuRef}>
                <div className="inline-flex overflow-hidden rounded-lg shadow-[0_6px_18px_-8px_rgb(0_113_197/0.65)]">
                  <button
                    type="button"
                    onClick={() => setShippingOpen((open) => !open)}
                    disabled={!canUpdate}
                    aria-expanded={shippingOpen}
                    className="inline-flex items-center gap-2 bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {pending
                      ? "Confirm Order"
                      : hasShipping
                        ? "Update shipping"
                        : "Confirm Order"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    disabled={!canUpdate}
                    aria-label="More order actions"
                    aria-expanded={menuOpen}
                    className="inline-flex items-center border-l border-white/25 bg-brand px-2 text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {menuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-pop">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setCancelOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                      Cancel Order
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* The refund. It is greyed out until the order has been
                cancelled, because there is nothing to refund before
                that. */}
            <button
              type="button"
              onClick={() => setRefundOpen(true)}
              disabled={!canUpdate || !cancelled || refunded}
              title={
                refunded
                  ? "This order has already been refunded."
                  : cancelled
                    ? "Send the money back through the payment gateway."
                    : "A refund can only be sent once the order has been cancelled."
              }
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:border-gray-200 disabled:hover:text-gray-400"
            >
              <CreditCard className="h-4 w-4" />
              Refund
            </button>

            {refunded ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11.5px] font-semibold text-green-700">
                <Check className="h-3.5 w-3.5" />
                Refunded
              </span>
            ) : refundStarted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700">
                Refund {refundStatus === "pending" ? "in progress" : refundStatus}
              </span>
            ) : null}
          </div>

          {/* The shipping form. It opens below the buttons, in the same
              card, so the page does not jump about. */}
          {shippingOpen && !cancelled && (
            <div className="mt-4 rounded-lg border border-brand/20 bg-brand-tint/30 p-4">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                <Truck className="h-4 w-4 text-brand" />
                Shipping details
              </h3>
              <p className="mt-1 text-[12.5px] text-gray-600">
                {pending
                  ? "All three are needed. The order stays pending until they are saved."
                  : "All three are needed before the order can be confirmed."}
              </p>

              <form action={shippingAction} className="mt-4 space-y-4">
                <input type="hidden" name="orderId" value={orderId} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="courierPartner">
                      Courier partner name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="courierPartner"
                      name="courierPartner"
                      required
                      autoFocus
                      placeholder="Delhivery, Blue Dart, DTDC…"
                      className={`input ${shippingState.field === "courier" ? "input-error" : ""}`}
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="shippingMethod">
                      Shipping method <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="shippingMethod"
                      name="shippingMethod"
                      required
                      value={method}
                      onChange={(event) => setMethod(event.target.value)}
                      className={`input ${shippingState.field === "method" ? "input-error" : ""}`}
                    >
                      {SHIPPING_METHODS.map((option) => (
                        <option key={option} value={option}>
                          {SHIPPING_METHOD_LABEL[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {method === "other" && (
                  <div>
                    <label className="label" htmlFor="customShippingMethod">
                      Shipping method <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="customShippingMethod"
                      name="customShippingMethod"
                      required
                      placeholder="How the parcel is going"
                      className={`input ${shippingState.field === "customMethod" ? "input-error" : ""}`}
                    />
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="trackingId">
                    Tracking ID / AWB number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="trackingId"
                    name="trackingId"
                    required
                    placeholder="The shipment's tracking number"
                    className={`input ${shippingState.field === "tracking" ? "input-error" : ""}`}
                  />
                </div>

                {shippingError && (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {shippingError}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-brand/15 pt-3.5">
                  <button
                    type="submit"
                    disabled={isShippingPending}
                    className="btn btn-primary btn-sm"
                  >
                    {isShippingPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Confirm &amp; Save
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShippingOpen(false)}
                    className="btn btn-outline btn-sm"
                  >
                    Go Back
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* The refund's own status, once there is one. */}
          {cancelled && refundStarted && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12.5px] text-gray-700">
                  {refunded
                    ? "The payment provider has confirmed that the money has been paid back."
                    : "The payment provider has accepted the refund. It has not reached the customer yet — it takes 5–7 working days."}
                </p>
                {!refunded && (
                  <form action={statusAction}>
                    <input type="hidden" name="orderId" value={orderId} />
                    <button
                      type="submit"
                      disabled={isStatusPending}
                      className="btn btn-outline btn-sm"
                    >
                      {isStatusPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Check status
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {cancelOpen && (
        <CancelModal
          orderId={orderId}
          reasonCode={reasonCode}
          setReasonCode={setReasonCode}
          error={cancelError}
          pending={isCancelPending}
          action={cancelAction}
          onClose={() => setCancelOpen(false)}
        />
      )}

      {refundOpen && (
        <RefundModal
          orderId={orderId}
          customerName={customerName}
          total={total}
          paymentReference={paymentReference}
          paymentGateway={paymentGateway}
          error={refundState.field ? refundState.message : null}
          pending={isRefundPending}
          action={refundAction}
          onClose={() => setRefundOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------- the modals */

/** The backdrop, and the frame the modal sits in. */
function Modal({
  title,
  subtitle,
  onClose,
  children,
  tone = "default",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop">
        <header
          className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${
            tone === "danger" ? "border-red-200 bg-red-50/60" : "border-gray-200"
          }`}
        >
          <div>
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] text-gray-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * The cancellation. A reason is required — the order is not cancelled
 * until one has been chosen, and "other" carries a sentence of its own.
 */
function CancelModal({
  orderId,
  reasonCode,
  setReasonCode,
  error,
  pending,
  action,
  onClose,
}: {
  orderId: string;
  reasonCode: string;
  setReasonCode: (value: string) => void;
  error: string | null | undefined;
  pending: boolean;
  action: (formData: FormData) => void;
  onClose: () => void;
}) {
  const other = reasonCode === "other";

  return (
    <Modal
      title="Cancel this order"
      subtitle="Why are you cancelling this order?"
      onClose={onClose}
      tone="danger"
    >
      <form action={action}>
        <input type="hidden" name="orderId" value={orderId} />

        <fieldset className="space-y-2">
          <legend className="sr-only">Cancellation reason</legend>
          {CANCELLATION_REASON_CODES.map((code) => (
            <label
              key={code}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${
                reasonCode === code
                  ? "border-red-300 bg-red-50 text-ink"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="reasonCode"
                value={code}
                required
                checked={reasonCode === code}
                onChange={() => setReasonCode(code)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
              />
              <span>{CANCELLATION_REASON_LABEL[code]}</span>
            </label>
          ))}
        </fieldset>

        {other && (
          <div className="mt-4">
            <label className="label" htmlFor="reasonDetail">
              The reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reasonDetail"
              name="reasonDetail"
              rows={3}
              required
              autoFocus
              placeholder="Say why the order is being cancelled."
              className={`input ${error?.includes("Say why") ? "input-error" : ""}`}
            />
          </div>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] text-gray-600">
          The stock goes back on the shelf when the order is cancelled. The
          customer is told, and the refund can be sent from here afterwards.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Confirm Cancellation
              </>
            )}
          </button>
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
            Go Back
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The refund.
 *
 * It says what is being refunded, against which payment, and it does
 * not claim the money has reached the customer — that is the payment
 * provider's word to give, and it is asked for afterwards.
 */
function RefundModal({
  orderId,
  customerName,
  total,
  paymentReference,
  paymentGateway,
  error,
  pending,
  action,
  onClose,
}: {
  orderId: string;
  customerName: string;
  total: number;
  paymentReference: string | null;
  paymentGateway: string | null;
  error: string | null | undefined;
  pending: boolean;
  action: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(total));
  const value = Number(amount);
  const full = Number.isFinite(value) && Math.round(value) === Math.round(total);
  const valid = Number.isFinite(value) && value > 0 && value <= total;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Order ID", value: <span className="tnum font-semibold text-ink">{orderId}</span> },
    { label: "Customer", value: <span className="font-semibold text-ink">{customerName || "—"}</span> },
    {
      label: "Original payment",
      value: <span className="tnum font-semibold text-ink">{money(total)}</span>,
    },
    {
      label: "Payment ID",
      value: (
        <span className="tnum break-all text-ink">
          {paymentReference || "No gateway payment on this order"}
        </span>
      ),
    },
  ];

  return (
    <Modal
      title="Refund this order"
      subtitle="The money goes back through the payment provider, by the method it was paid with."
      onClose={onClose}
    >
      <form action={action}>
        <input type="hidden" name="orderId" value={orderId} />

        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-3 px-3.5 py-2.5"
            >
              <dt className="text-[12.5px] text-gray-500">{row.label}</dt>
              <dd className="min-w-0 text-right text-[12.5px]">{row.value}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-3.5 py-2.5">
            <dt className="text-[12.5px] font-semibold text-gray-600">Refund amount</dt>
            <dd className="flex items-center gap-1.5">
              <span className="text-[12.5px] text-gray-500">₹</span>
              <input
                name="amount"
                type="number"
                min={1}
                max={total}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="tnum w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-right text-[13px] font-bold text-ink"
              />
            </dd>
          </div>
        </dl>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] font-medium text-red-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
          {paymentReference
            ? `The refund will be sent to ${paymentGateway ?? "the payment provider"} against payment ${paymentReference}. It takes 5–7 working days to reach the customer's account.`
            : "This order has no gateway payment on it, so the refund has to be paid by hand."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !valid || !paymentReference}
            className="btn btn-primary btn-sm"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Refunding...
              </>
            ) : (
              <>
                <CreditCard className="h-3.5 w-3.5" />
                {full ? "Confirm Full Refund" : "Confirm Refund"}
              </>
            )}
          </button>
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
            Go Back
          </button>
        </div>
      </form>
    </Modal>
  );
}
