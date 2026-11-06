import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  CreditCard,
  Ban,
  Search,
  ClipboardCheck,
  Send,
  MessageSquare,
  ShieldAlert,
  Info,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  getReturnRequest,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_TYPE_LABEL,
  REPLACEMENT_DELIVERY_LABEL,
  returnReasonLabel,
} from "@/lib/returns";
import { getProduct } from "@/lib/queries";
import { money, formatDate } from "@/lib/format";
import { CancelReturnButton } from "@/components/returns/CancelReturnButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Return ${id} Tracking — ConsoleSeller` };
}

type TimelineStage = {
  key: string;
  label: string;
  description: string;
  status: "completed" | "current" | "pending";
  date?: string | null;
  note?: string | null;
};

export default async function CustomerReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const ret = getReturnRequest(id);

  if (!ret) notFound();

  // If user is logged in as a customer, ensure they own the return request
  if (user && ret.user_id && ret.user_id !== user.id && user.role === "member") {
    notFound();
  }

  // Enrich items with product thumbnail images
  const itemsWithImages = ret.items.map((it) => {
    const product = getProduct(it.product_slug);
    return {
      ...it,
      image: product?.image ?? null,
    };
  });

  const isTerminalNegative = ret.status === "rejected" || ret.status === "cancelled";

  // The statuses that mean a stage has been passed. A request moves
  // forward through them, so every stage before the current one is done.
  const UNDER_REVIEW = ["requested", "info_requested"];
  const PAST_REVIEW = [
    "approved",
    "pickup_scheduled",
    "received",
    "qc_passed",
    "qc_failed",
    "refund_pending",
    "replacement_pending",
    "completed",
  ];
  const PAST_APPROVAL = [
    "pickup_scheduled",
    "received",
    "qc_passed",
    "qc_failed",
    "refund_pending",
    "replacement_pending",
    "completed",
  ];
  const PAST_PICKUP = [
    "received",
    "qc_passed",
    "qc_failed",
    "refund_pending",
    "replacement_pending",
    "completed",
  ];
  const PAST_RECEIPT = [
    "qc_passed",
    "qc_failed",
    "refund_pending",
    "replacement_pending",
    "completed",
  ];
  const PAST_INSPECTION = ["refund_pending", "replacement_pending", "completed"];
  const SETTLED = ["refund_pending", "replacement_pending"];

  // Helper to extract event timestamp by status
  const findEventDate = (statusKey: string): string | null => {
    const ev = ret.events.find((e) => e.status === statusKey);
    return ev ? formatDate(ev.created_at) : null;
  };

  // Find latest staff note from events if any
  const latestStaffEvent = [...ret.events]
    .reverse()
    .find((e) => e.actor_type === "staff" && e.note);

  // Construct the exact 8 stages:
  // Request Submitted → Under Review → Approved → Pickup Scheduled → Product Received → Inspection Completed → Refund Initiated / Replacement Dispatched → Completed
  const timelineStages: TimelineStage[] = [
    {
      key: "requested",
      label: "Request Submitted",
      description: "Return request received",
      status: "completed",
      date: formatDate(ret.created_at),
      note: "Request logged in our system.",
    },
    {
      key: "under_review",
      label: "Under Review",
      description: "Support team reviewing claim",
      status:
        UNDER_REVIEW.includes(ret.status)
          ? "current"
          : PAST_REVIEW.includes(ret.status)
            ? "completed"
            : "pending",
      date:
        UNDER_REVIEW.includes(ret.status)
          ? "In progress"
          : findEventDate("under_review") || findEventDate("approved") || formatDate(ret.created_at),
      note:
        ret.status === "info_requested"
          ? ret.admin_notes || "Our support team has asked for more information."
          : UNDER_REVIEW.includes(ret.status)
            ? "Our support team is reviewing your claim and submitted photos."
            : "Claim verified by support team.",
    },
    {
      key: "approved",
      label: "Approved",
      description: "Request authorized for return",
      status:
        UNDER_REVIEW.includes(ret.status)
          ? "pending"
          : ret.status === "approved"
            ? "current"
            : PAST_APPROVAL.includes(ret.status)
              ? "completed"
              : "pending",
      date: findEventDate("approved"),
      note:
        ret.status === "info_requested"
          ? null
          : ret.admin_notes || (ret.status === "approved" ? "Pickup will be scheduled soon." : null),
    },
    {
      key: "pickup_scheduled",
      label: "Pickup Scheduled",
      description: "Courier pickup arranged",
      status:
        ["requested", "info_requested", "approved"].includes(ret.status)
          ? "pending"
          : ret.status === "pickup_scheduled"
            ? "current"
            : PAST_PICKUP.includes(ret.status)
              ? "completed"
              : "pending",
      date: ret.pickup_date || findEventDate("pickup_scheduled"),
      note: ret.pickup_courier ? `Courier: ${ret.pickup_courier}` : null,
    },
    {
      key: "received",
      label: "Product Received",
      description: "Arrived at inspection hub",
      status:
        ["requested", "info_requested", "approved", "pickup_scheduled"].includes(ret.status)
          ? "pending"
          : ret.status === "received"
            ? "current"
            : PAST_RECEIPT.includes(ret.status)
              ? "completed"
              : "pending",
      date: ret.received_at ? formatDate(ret.received_at) : findEventDate("received"),
      note: ret.status === "received" ? "Package received at warehouse. QC in queue." : null,
    },
    {
      key: "qc_passed",
      label: "Inspection Completed",
      description: "Quality & condition verified",
      status:
        ["requested", "info_requested", "approved", "pickup_scheduled", "received"].includes(
          ret.status
        )
          ? "pending"
          : ret.status === "qc_passed" || ret.status === "completed"
            ? "completed"
            : PAST_INSPECTION.includes(ret.status)
              ? "completed"
              : "pending",
      date: findEventDate("qc_passed") || (ret.status === "completed" ? findEventDate("completed") : null),
      note: ret.qc_notes || (ret.qc_status === "passed" ? "Device condition verified." : null),
    },
    {
      key: "settlement",
      label: ret.type === "replacement" ? "Replacement Dispatched" : "Refund Initiated",
      description:
        ret.type === "replacement"
          ? "New replacement shipped"
          : "Refund credited to source",
      status:
        ret.type === "replacement"
          ? // A replacement is only done when it has arrived. Writing the
            // courier number down is not the same as delivering it.
            ret.replacement_delivery_status === "delivered" ||
            ret.replacement_delivery_status === "returned" ||
            ret.status === "completed"
            ? "completed"
            : "current"
          : ret.status === "completed" || ret.refund_status === "processed"
            ? "completed"
            : ret.status === "qc_passed" || SETTLED.includes(ret.status)
              ? "current"
              : "pending",
      date:
        ret.type === "replacement"
          ? ret.replacement_delivered_at
            ? formatDate(ret.replacement_delivered_at)
            : findEventDate("replacement_pending") || findEventDate("completed")
          : ret.refund_processed_at
            ? formatDate(ret.refund_processed_at)
            : findEventDate("refund_pending") || findEventDate("completed"),
      note:
        ret.type === "replacement"
          ? ret.replacement_order_id
            ? `Shipment ${ret.replacement_order_id}${
                ret.replacement_courier ? ` via ${ret.replacement_courier}` : ""
              }${ret.replacement_tracking ? ` · ${ret.replacement_tracking}` : ""}.`
            : "The replacement is being prepared."
          : ret.refund_status === "processed"
            ? `Refund of ${money(ret.refund_amount)} has been credited to you.`
            : ret.refund_status === "failed"
              ? "The refund was refused. Our team will be in touch."
              : ret.refund_status === "pending"
                ? `Refund of ${money(ret.refund_amount)} has been approved and is on its way back to you.`
                : "Refund settlement pending.",
    },
    {
      key: "completed",
      label: "Completed",
      description: "Case closed successfully",
      status: ret.status === "completed" ? "completed" : "pending",
      date: ret.status === "completed" ? findEventDate("completed") : null,
      note: ret.status === "completed" ? "All steps finalized." : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header>
        <Link
          href="/account/returns"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to My Returns & Replacements
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="tnum text-[24px] font-bold text-ink">{ret.id}</h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold capitalize ${
                  RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {RETURN_STATUS_LABEL[ret.status]}
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[12px] font-semibold text-blue-700 border border-blue-200">
                {RETURN_TYPE_LABEL[ret.type]}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">
              {RETURN_TYPE_LABEL[ret.type]} for{" "}
              <Link
                href={`/order/${ret.order_id}`}
                className="font-medium text-brand hover:underline"
              >
                Order {ret.order_id}
              </Link>
              {" · "}
              Requested on {formatDate(ret.created_at)}
            </p>
          </div>

          {(ret.status === "requested" || ret.status === "approved") && user && (
            <CancelReturnButton returnId={ret.id} />
          )}
        </div>
      </header>

      {/* 8-Stage Status Timeline */}
      {!isTerminalNegative && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="border-b border-gray-100 pb-3 mb-5 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-ink">Request Timeline</h2>
            <span className="text-[12px] text-gray-500">
              Current stage: <strong className="text-brand capitalize">{RETURN_STATUS_LABEL[ret.status]}</strong>
            </span>
          </div>

          {/* Desktop & Tablet Stepper Grid (8 stages) */}
          <ol className="hidden lg:grid grid-cols-8 gap-2">
            {timelineStages.map((stage, idx) => {
              const isDone = stage.status === "completed";
              const isCurrent = stage.status === "current";

              return (
                <li key={stage.key} className="relative flex flex-col items-center text-center">
                  {/* Connector line */}
                  {idx < timelineStages.length - 1 && (
                    <div
                      className={`absolute top-4 left-1/2 w-full h-0.5 -z-0 ${
                        isDone ? "bg-emerald-600" : "bg-gray-200"
                      }`}
                    />
                  )}

                  {/* Stage Marker Circle */}
                  <span
                    className={`relative z-10 grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold transition-all shadow-xs ${
                      isDone
                        ? "bg-emerald-600 text-white ring-4 ring-emerald-50"
                        : isCurrent
                          ? "bg-brand text-white ring-4 ring-blue-50 animate-pulse"
                          : "border-2 border-gray-300 bg-white text-gray-400"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4 stroke-[3]" />
                    ) : (
                      idx + 1
                    )}
                  </span>

                  {/* Stage Label & Details */}
                  <p
                    className={`mt-2.5 text-[12px] font-bold leading-tight ${
                      isDone ? "text-ink" : isCurrent ? "text-brand" : "text-gray-400"
                    }`}
                  >
                    {stage.label}
                  </p>

                  <span
                    className={`mt-1 inline-block text-[10.5px] font-medium ${
                      isDone
                        ? "text-emerald-700"
                        : isCurrent
                          ? "text-brand font-semibold"
                          : "text-gray-400"
                    }`}
                  >
                    {isDone ? "Completed" : isCurrent ? "In Progress" : "Pending"}
                  </span>

                  {stage.date && stage.date !== "In progress" && (
                    <span className="mt-0.5 text-[10px] text-gray-400 truncate max-w-full">
                      {stage.date}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Mobile & Small Screens Stepper (Vertical track) */}
          <ol className="lg:hidden relative space-y-4 border-l-2 border-gray-200 pl-5 ml-3">
            {timelineStages.map((stage, idx) => {
              const isDone = stage.status === "completed";
              const isCurrent = stage.status === "current";

              return (
                <li key={stage.key} className="relative pb-1">
                  <span
                    className={`absolute -left-[27px] top-0 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                      isDone
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                          ? "bg-brand text-white ring-2 ring-blue-100"
                          : "border border-gray-300 bg-white text-gray-400"
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3 stroke-[3]" /> : idx + 1}
                  </span>

                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p
                      className={`text-[13px] font-bold ${
                        isDone ? "text-ink" : isCurrent ? "text-brand" : "text-gray-400"
                      }`}
                    >
                      {stage.label}
                    </p>
                    <span
                      className={`text-[11px] font-medium ${
                        isDone ? "text-emerald-700" : isCurrent ? "text-brand" : "text-gray-400"
                      }`}
                    >
                      {isDone ? "Completed" : isCurrent ? "In Progress" : "Pending"}
                    </span>
                  </div>

                  <p className="text-[12px] text-gray-500 mt-0.5">{stage.description}</p>
                  {stage.note && (
                    <p className="text-[11.5px] text-gray-600 mt-0.5 italic">{stage.note}</p>
                  )}
                  {stage.date && stage.date !== "In progress" && (
                    <p className="text-[10.5px] text-gray-400 mt-0.5">{stage.date}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Terminal Status Alerts (Rejected / Cancelled) */}
      {ret.status === "rejected" && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-[13.5px] text-red-800 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-bold text-red-900 text-[14.5px]">Return Request Rejected</p>
              <p className="mt-1 leading-relaxed">
                {ret.rejection_reason ||
                  "This request could not be approved according to our return policy guidelines."}
              </p>
              <p className="mt-2 text-[12.5px] text-red-700">
                If you have additional questions or want to submit further proof, please contact our support team via our{" "}
                <Link href="/contact" className="underline font-semibold text-red-900">
                  Contact Us
                </Link>{" "}
                page.
              </p>
            </div>
          </div>
        </section>
      )}

      {ret.status === "cancelled" && (
        <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-[13.5px] text-gray-600">
          <div className="flex items-start gap-3">
            <Ban className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div>
              <p className="font-bold text-ink text-[14.5px]">Request Cancelled</p>
              <p className="mt-1 leading-relaxed">
                This return request was cancelled by you. No courier pickup will occur, and your order status remains unchanged.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Admin Remarks Card (Prominently displayed) */}
      {(ret.admin_notes || ret.qc_notes || latestStaffEvent?.note) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-blue-200/70 pb-2.5">
            <MessageSquare className="h-4 w-4 text-brand" />
            <h2 className="text-[14px] font-bold text-ink">Admin Remarks & Support Updates</h2>
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
              ConsoleSeller Support
            </span>
          </div>

          <div className="mt-3.5 space-y-3 text-[13px]">
            {ret.admin_notes && (
              <div>
                <span className="font-semibold text-ink">Store Review Note:</span>
                <p className="mt-1 rounded-lg bg-white border border-blue-100 p-3 text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {ret.admin_notes}
                </p>
              </div>
            )}

            {ret.qc_notes && (
              <div>
                <span className="font-semibold text-ink">Quality Inspection (QC) Remarks:</span>
                <p className="mt-1 rounded-lg bg-white border border-blue-100 p-3 text-gray-800 leading-relaxed">
                  {ret.qc_notes}
                </p>
              </div>
            )}

            {!ret.admin_notes && !ret.qc_notes && latestStaffEvent?.note && (
              <div>
                <span className="font-semibold text-ink">Latest Staff Update:</span>
                <p className="mt-1 rounded-lg bg-white border border-blue-100 p-3 text-gray-800 leading-relaxed">
                  {latestStaffEvent.note}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Courier Pickup Details Card */}
      {ret.pickup_courier && ret.pickup_tracking && (
        <section className="rounded-xl border border-purple-200 bg-purple-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-purple-200/70 pb-2.5">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
              <Truck className="h-4 w-4 text-purple-700" />
              Reverse Courier Pickup Details
            </h2>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-purple-800">
              Pickup Scheduled
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3 text-[13px]">
            <div className="rounded-lg bg-white border border-purple-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-gray-500">
                Courier Partner
              </span>
              <span className="mt-1 block text-[14px] font-bold text-ink">
                {ret.pickup_courier}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-purple-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-gray-500">
                AWB / Tracking Number
              </span>
              <span className="mt-1 block tnum text-[14px] font-bold text-purple-700 tracking-wide">
                {ret.pickup_tracking}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-purple-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-gray-500">
                Scheduled Pickup Date
              </span>
              <span className="mt-1 block text-[14px] font-medium text-ink">
                {ret.pickup_date || "Within 24–48 business hours"}
              </span>
            </div>
          </div>

          <div className="mt-3.5 flex items-start gap-2 rounded-lg bg-white/80 border border-purple-100 p-3 text-[12px] text-gray-600">
            <Info className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
            <p>
              Please keep the returned product in its original retail packaging, along with all accessories, cables, manuals, and free gifts, ready for handover when the courier executive arrives.
            </p>
          </div>
        </section>
      )}

      {/* The refund has been approved but the money has not gone back yet. */}
      {ret.type === "return" && ret.refund_status === "pending" && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-200/70 pb-2.5">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-amber-950">
              <CreditCard className="h-4 w-4 text-amber-700" />
              Refund Approved
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-800">
              On its way
            </span>
          </div>
          <p className="mt-3 text-[13px] text-amber-900/80">
            We have approved a refund of{" "}
            <strong className="tnum">{money(ret.refund_amount)}</strong> to your{" "}
            {ret.refund_method || "original payment source"}. It is being sent now —
            this page updates as soon as the payment has gone through.
          </p>
        </section>
      )}

      {/* Refund Settlement Details Card — shown once the money has actually
          gone back, never on the strength of an approval alone. */}
      {ret.type === "return" && ret.refund_status === "processed" && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2.5">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-emerald-950">
              <CreditCard className="h-4 w-4 text-emerald-700" />
              Refund Settlement Details
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-800">
              Processed
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3 text-[13px]">
            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Refund Amount
              </span>
              <span className="mt-1 block tnum text-[17px] font-extrabold text-emerald-950">
                {money(ret.refund_amount)}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Payment Destination
              </span>
              <span className="mt-1 block text-[14px] font-semibold text-ink">
                {ret.refund_method || "Original Payment Source (Gateway/UPI)"}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Bank / UTR Reference
              </span>
              <span className="mt-1 block tnum text-[14px] font-bold text-emerald-900 tracking-wide">
                {ret.refund_reference || "Processed via Gateway"}
              </span>
            </div>
          </div>

          {ret.refund_processed_at && (
            <p className="mt-3 text-[12px] text-emerald-800">
              Processed on {formatDate(ret.refund_processed_at)}. Depending on your bank or card issuer, the funds reflect in 2–5 business days.
            </p>
          )}
        </section>
      )}

      {/* Replacement Tracking Details Card — shown when a replacement has
          actually been sent. It says what is on the record, and nothing
          more: a courier that was never chosen is not invented here. */}
      {ret.type === "replacement" && ret.replacement_order_id && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2.5">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-emerald-950">
              <Truck className="h-4 w-4 text-emerald-700" />
              Replacement Shipment Details
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                ret.replacement_delivery_status === "delivered"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {REPLACEMENT_DELIVERY_LABEL[
                ret.replacement_delivery_status ?? "dispatched"
              ]}
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 text-[13px]">
            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Replacement Shipment ID
              </span>
              <span className="mt-1 block tnum text-[14.5px] font-bold text-ink">
                {ret.replacement_order_id}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Courier Partner
              </span>
              <span className="mt-1 block text-[14px] font-bold text-ink">
                {ret.replacement_courier || "Not recorded yet"}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Tracking / AWB Number
              </span>
              <span className="mt-1 block tnum text-[14px] font-bold text-emerald-900 tracking-wide">
                {ret.replacement_tracking || "Not recorded yet"}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-emerald-100 p-3">
              <span className="block text-[11px] uppercase font-bold text-emerald-800">
                Dispatched On
              </span>
              <span className="mt-1 block text-[14px] font-bold text-ink">
                {ret.replacement_dispatch_date || "Not recorded yet"}
              </span>
            </div>
          </div>

          <p className="mt-3 text-[12px] text-emerald-800">
            {ret.replacement_delivery_status === "delivered"
              ? "The replacement has been delivered. We hope it is everything you needed."
              : "A brand new replacement unit has been packed and handed over to our courier partner. You will receive standard delivery updates via SMS and email."}
          </p>
        </section>
      )}

      {/* Requested Products Card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
        <h2 className="mb-4 text-[15px] font-bold text-ink">
          Product Details ({ret.items.length})
        </h2>
        <ul className="divide-y divide-gray-100">
          {itemsWithImages.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 py-3.5 text-[13.5px]"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {item.image ? (
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-contain p-1"
                    />
                  </div>
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-gray-100 bg-gray-50 text-gray-400">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${item.product_slug}`}
                    className="font-semibold text-ink hover:text-brand transition-colors line-clamp-1"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
                    <span>
                      Quantity: <strong className="text-ink">{item.quantity}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Unit Price: <strong className="text-ink">{money(item.price)}</strong>
                    </span>
                    {item.reason_detail && (
                      <>
                        <span>·</span>
                        <span className="text-gray-600 italic">“{item.reason_detail}”</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <span className="tnum shrink-0 text-[14px] font-bold text-ink">
                {money(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        {/* Claim Details */}
        <div className="mt-4 border-t border-gray-100 pt-4 text-[13px] space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-ink min-w-[90px]">Reason:</span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[12px] font-medium text-gray-700">
              {returnReasonLabel(ret.reason)}
            </span>
          </div>

          {ret.customer_notes && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Description:</span>
              <p className="text-gray-600 leading-relaxed">{ret.customer_notes}</p>
            </div>
          )}
        </div>

        {/* Uploaded Evidence Photos */}
        {ret.images.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <h3 className="mb-2.5 text-[13px] font-bold text-ink">
              Uploaded Evidence Photos ({ret.images.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {ret.images.map((img) => (
                <a
                  key={img.id}
                  href={img.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:border-brand transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.path}
                    alt="Return photo"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Activity Log / Status Change Updates Feed */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
        <div className="border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">Request Activity & Status Updates</h2>
          <span className="text-[12px] text-gray-500">Audit Log</span>
        </div>

        <ol className="relative space-y-4 border-l border-gray-200 pl-4 ml-2">
          {ret.events.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-bold text-ink">
                  {RETURN_STATUS_LABEL[ev.status as keyof typeof RETURN_STATUS_LABEL] ?? ev.status}
                </p>
                <span className="text-[11px] text-gray-400">{formatDate(ev.created_at)}</span>
              </div>
              {ev.note && (
                <p className="mt-1 text-[12.5px] text-gray-600 leading-relaxed">{ev.note}</p>
              )}
              <p className="mt-1 text-[11px] text-gray-400">
                {ev.actor_type === "staff"
                  ? "ConsoleSeller Support Team"
                  : ev.actor_type === "customer"
                    ? "Customer"
                    : "System Automation"}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
