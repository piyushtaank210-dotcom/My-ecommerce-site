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
import { AddEvidencePanel } from "@/components/returns/AddEvidencePanel";
import { customerStageIndex, customerStagesFor } from "@/lib/return-stages";
import { evidenceMayBeAdded } from "@/lib/returns-records";

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
  const ret = (await getReturnRequest(id));

  if (!ret) notFound();

  // If user is logged in as a customer, ensure they own the return request
  if (user && ret.user_id && ret.user_id !== user.id && user.role === "member") {
    notFound();
  }

  // Enrich items with product thumbnail images
  const itemsWithImages = await Promise.all(
    ret.items.map(async (it) => {
      const product = (await getProduct(it.product_slug));
      return {
        ...it,
        image: product?.image ?? null,
      };
    })
  );

  const isTerminalNegative = ret.status === "rejected" || ret.status === "cancelled";

  // Where the request has got to on its journey, and the stages before
  // it. The stages are the statuses the request actually takes, so each
  // one can be dated from the request own history.
  const currentStage = customerStageIndex(ret.status);
  const stages = customerStagesFor(ret.type);

  /** The date a stage was reached, from the request own history. */
  const stageDate = (key: string): string | null => {
    const ev = ret.events.find((e) => e.status === key);
    return ev ? formatDate(ev.created_at) : null;
  };

  const timelineStages: TimelineStage[] = stages.map((stage, index) => {
    const isDone = currentStage > index;
    const isCurrent = currentStage === index;
    const date =
      stage.key === "requested"
        ? formatDate(ret.created_at)
        : stageDate(stage.key) ??
          (stage.key === "received" && ret.received_at
            ? formatDate(ret.received_at)
            : null);

    return {
      key: stage.key,
      label: stage.label,
      description: "",
      status: isDone ? "completed" : isCurrent ? "current" : "pending",
      date,
      note: null,
    };
  });

  // The note the shop left for the customer, when it has asked for more.
  // It is the message that was written for them — never an internal note.
  const latestStaffEvent = [...ret.events]
    .reverse()
    .find((e) => e.actor_type === "staff" && e.note);

  const customerMessage =
    ret.status === "info_requested"
      ? (latestStaffEvent?.note ?? "We have asked you for more information.")
      : null;

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

      {/* The request timeline. */}
      {!isTerminalNegative && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="border-b border-gray-100 pb-3 mb-5 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-ink">Request Timeline</h2>
            <span className="text-[12px] text-gray-500">
              Current stage: <strong className="text-brand capitalize">{RETURN_STATUS_LABEL[ret.status]}</strong>
            </span>
          </div>

          {/* Desktop & Tablet Stepper Grid (8 stages) */}
          <ol
            className="hidden gap-2 lg:grid"
            style={{
              gridTemplateColumns: `repeat(${timelineStages.length}, minmax(0, 1fr))`,
            }}
          >
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

      {/* What the shop has told the customer. */}
      {(customerMessage || latestStaffEvent?.note) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-blue-200/70 pb-2.5">
            <MessageSquare className="h-4 w-4 text-brand" />
            <h2 className="text-[14px] font-bold text-ink">
              {customerMessage ? "We need a little more" : "Latest update from the shop"}
            </h2>
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
              ConsoleSeller Support
            </span>
          </div>

          <div className="mt-3.5 space-y-3 text-[13px]">
            {customerMessage && (
              <div>
                <span className="font-semibold text-ink">What we need:</span>
                <p className="mt-1 rounded-lg bg-white border border-blue-100 p-3 text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {customerMessage}
                </p>
                <p className="mt-2 text-[12.5px] text-gray-600">
                  You can add what is missing on this page, under
                  &ldquo;Add more evidence&rdquo;.
                </p>
              </div>
            )}

            {!customerMessage && latestStaffEvent?.note && (
              <div>
                <p className="rounded-lg bg-white border border-blue-100 p-3 text-gray-800 leading-relaxed">
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
      {ret.type === "return" && ret.refund_status === "completed" && (
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

          {ret.delivery_date && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">
                Date of delivery:
              </span>
              <p className="text-gray-600 leading-relaxed">
                {formatDate(ret.delivery_date)}
              </p>
            </div>
          )}

          {ret.customer_email && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Contact:</span>
              <p className="text-gray-600 leading-relaxed">
                {ret.customer_name}
                {ret.customer_phone ? ` · ${ret.customer_phone}` : ""} ·{" "}
                {ret.customer_email}
              </p>
            </div>
          )}

          {ret.serial_number && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Serial:</span>
              <p className="tnum text-gray-600 leading-relaxed">{ret.serial_number}</p>
            </div>
          )}

          {ret.sealed_state && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Unit is:</span>
              <p className="text-gray-600 leading-relaxed">
                {ret.sealed_state === "sealed" ? "sealed and unused" : "opened"}
              </p>
            </div>
          )}

          {ret.missing_accessories && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Missing:</span>
              <p className="whitespace-pre-line text-gray-600 leading-relaxed">
                {ret.missing_accessories}
              </p>
            </div>
          )}

          {ret.accessories_tracking && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-ink min-w-[90px]">Sent:</span>
              <p className="text-gray-600 leading-relaxed">
                {ret.accessories_courier} — {ret.accessories_tracking}
              </p>
            </div>
          )}
        </div>

        {/* The evidence — photographs and unboxing videos. Each one is
            fetched through the route that checks who is asking, so a
            customer's evidence is theirs and the shop's alone. */}
        {ret.images.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <h3 className="mb-2.5 text-[13px] font-bold text-ink">
              Your Evidence ({ret.images.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {ret.images.map((img) => {
                const src = `/api/returns/${ret.id}/evidence/${img.id}`;
                return img.kind === "video" ? (
                  <a
                    key={img.id}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:border-brand transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <video
                      src={src}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      VIDEO
                    </span>
                  </a>
                ) : (
                  <a
                    key={img.id}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:border-brand transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt="Return photo"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <span className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11.5px] text-gray-500">
              Sent on {formatDate(ret.images[0].created_at)}
              {ret.images.length > 1 &&
                ` — the most recent on ${formatDate(
                  ret.images[ret.images.length - 1].created_at
                )}`}
              . Evidence cannot be changed once a request has been decided
              on.
            </p>
          </div>
        )}

        {/* More evidence, when the shop has asked for it. */}
        {evidenceMayBeAdded(ret.status) && (
          <AddEvidencePanel returnId={ret.id} askedFor={customerMessage} />
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
