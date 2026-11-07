import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  User,
  MapPin,
  Package,
  CreditCard,
  RotateCcw,
  CalendarClock,
  Banknote,
  StickyNote,
} from "lucide-react";
import { requirePermission } from "@/lib/guard";
import {
  getReturnRequest,
  calculateReturnDeadline,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_TYPE_LABEL,
  returnReasonLabel,
  replacementCandidates,
} from "@/lib/returns";
import { getOrder } from "@/lib/orders";
import { money, formatDate } from "@/lib/format";
import { evidenceSatisfied, policyForReason } from "@/lib/return-policy";
import { ReturnAdminActions } from "@/components/admin/returns/ReturnAdminActions";

export const metadata: Metadata = { title: "Manage Return" };

export default async function AdminReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("returns.view");
  const { id } = await params;
  const ret = getReturnRequest(id);
  if (!ret) notFound();

  const order = getOrder(ret.order_id);

  // When the product was delivered decides the last day a return could
  // have been asked for, and whether that day has gone.
  const deadline = calculateReturnDeadline(order?.delivered_at ?? null);
  const itemValue = ret.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  // What could be sent in place of what came back, and what is on the shelf.
  const candidates =
    ret.type === "replacement" ? replacementCandidates(ret.id) : [];

  // The rules this claim is judged against, and what has arrived against
  // them. A claim is never turned away only because a photograph or an
  // unboxing video is missing, so this is a prompt to ask — not a bar.
  const policy = policyForReason(ret.reason);
  const onFile = {
    photographs: ret.images.filter((i) => i.kind === "photo").length,
    videos: ret.images.filter((i) => i.kind === "video").length,
    description: Boolean(ret.customer_notes),
    serialNumber: Boolean(ret.serial_number),
    missingList: Boolean(ret.missing_accessories),
  };
  const missingRequired = policy.evidence
    .filter((e) => e.required && !evidenceSatisfied(e, onFile))
    .map((e) => e.label);

  return (
    <div className="mx-auto max-w-[1300px]">
      <header className="mb-6">
        <Link
          href="/admin/returns"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Returns & Refunds
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="tnum text-[26px] font-bold text-ink">{ret.id}</h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold capitalize ${
                RETURN_STATUS_TONE[ret.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {RETURN_STATUS_LABEL[ret.status]}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] font-medium text-gray-600">
              {RETURN_TYPE_LABEL[ret.type]}
            </span>
          </div>

          <Link
            href={`/admin/orders/${ret.order_id}`}
            className="btn btn-outline btn-sm"
          >
            View Order {ret.order_id}
          </Link>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">
          Requested on {formatDate(ret.created_at)} by{" "}
          <strong className="text-ink">{ret.customer_name ?? "Customer"}</strong>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left Column: Claim details, Items, Photos, Timeline */}
        <div className="space-y-6">
          {/* Claim Overview */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="border-b border-gray-100 pb-3 text-[15px] font-bold text-ink">
              Customer Claim Details
            </h2>
            <div className="mt-4 space-y-3 text-[13.5px]">
              <div>
                <span className="font-semibold text-ink">Reason: </span>
                <span className="text-gray-700">{returnReasonLabel(ret.reason)}</span>
              </div>
              <div>
                <span className="font-semibold text-ink">What the rules say: </span>
                <p className="mt-1 text-[13px] text-gray-600">{policy.summary}</p>
              </div>
              {ret.serial_number && (
                <div>
                  <span className="font-semibold text-ink">Serial number: </span>
                  <span className="tnum text-gray-700">{ret.serial_number}</span>
                </div>
              )}
              {ret.sealed_state && (
                <div>
                  <span className="font-semibold text-ink">Customer says the unit is: </span>
                  <span className="text-gray-700">
                    {ret.sealed_state === "sealed" ? "sealed and unused" : "opened"}
                  </span>
                </div>
              )}
              {ret.missing_accessories && (
                <div>
                  <span className="font-semibold text-ink">What is missing: </span>
                  <p className="mt-1 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-[13px] text-gray-700">
                    {ret.missing_accessories}
                  </p>
                </div>
              )}
              {ret.customer_notes && (
                <div>
                  <span className="font-semibold text-ink">Customer Comments: </span>
                  <p className="mt-1 rounded-lg bg-gray-50 p-3 text-[13px] text-gray-700">
                    {ret.customer_notes}
                  </p>
                </div>
              )}
              {ret.admin_notes && (
                <div>
                  <span className="font-semibold text-ink">Admin Remarks: </span>
                  <p className="mt-1 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-[13px] text-gray-700">
                    {ret.admin_notes}
                  </p>
                </div>
              )}
              {ret.rejection_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
                  <span className="font-bold">Rejection Note: </span>
                  {ret.rejection_reason}
                </div>
              )}
            </div>

            {/* The evidence: photographs and unboxing videos, and what
                the rules say we still need. */}
            {(ret.images.length > 0 || policy.evidence.length > 0) && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="mb-3 text-[13px] font-semibold text-ink">
                  Evidence ({ret.images.length})
                </h3>

                {ret.images.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {ret.images.map((img) =>
                      img.kind === "video" ? (
                        <a
                          key={img.id}
                          href={img.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <video
                            src={img.path}
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
                          href={img.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.path}
                            alt="Evidence"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </a>
                      )
                    )}
                  </div>
                )}

                {/* What the rules ask for, and what has arrived. */}
                <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                  {policy.evidence.map((e) => {
                    const has = evidenceSatisfied(e, {
                      photographs: ret.images.filter((i) => i.kind === "photo").length,
                      videos: ret.images.filter((i) => i.kind === "video").length,
                      description: Boolean(ret.customer_notes),
                      serialNumber: Boolean(ret.serial_number),
                      missingList: Boolean(ret.missing_accessories),
                    });
                    return (
                      <li key={e.id} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
                            has
                              ? "bg-green-50 text-green-700"
                              : e.required
                                ? "bg-red-50 text-red-700"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {has ? "On file" : e.required ? "Needed" : "Helpful"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-ink">
                            {e.label}
                          </span>
                          <span className="block text-[11.5px] text-gray-500">
                            {e.hint}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {missingRequired.length > 0 && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                    {missingRequired.join(" and ")}{" "}
                    {missingRequired.length === 1 ? "is" : "are"} still missing.
                    Ask the customer for it, or go on with the claim on what
                    you have — a claim is never turned away only because a
                    photograph or an unboxing video is missing.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Items Table */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink">
                Requested Items ({ret.items.length})
              </h2>
            </header>
            <ul className="divide-y divide-gray-200">
              {ret.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${item.product_slug}`}
                      className="font-semibold text-ink hover:text-brand"
                    >
                      {item.name}
                    </Link>
                    <div className="mt-0.5 text-[12px] text-gray-500">
                      Quantity: <span className="tnum font-medium text-ink">{item.quantity}</span>
                      {" · "}
                      Unit Price: <span className="tnum font-medium text-ink">{money(item.price)}</span>
                      {item.qc_decision && item.qc_decision !== "pending" && (
                        <>
                          {" · "}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              item.qc_decision === "restock"
                                ? "bg-green-50 text-green-700"
                                : item.qc_decision === "write_off"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            QC: {item.qc_decision}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="tnum shrink-0 text-[14px] font-bold text-ink">
                    {money(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Audit Event Timeline */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="border-b border-gray-100 pb-3 text-[15px] font-bold text-ink">
              Activity & Audit History
            </h2>
            <ol className="relative mt-4 space-y-4 border-l border-gray-200 pl-4 ml-2">
              {ret.events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-ink">
                      {RETURN_STATUS_LABEL[ev.status as keyof typeof RETURN_STATUS_LABEL] ??
                        ev.status}
                    </p>
                    <span className="text-[11px] text-gray-400">
                      {formatDate(ev.created_at)}
                    </span>
                  </div>
                  {ev.note && <p className="mt-0.5 text-[12.5px] text-gray-600">{ev.note}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">
                    By {ev.actor_name ? `${ev.actor_name} (${ev.actor_type})` : ev.actor_type}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right Column: Customer Info & Interactive Actions */}
        <div className="space-y-6">
          {/* The purchase the request is about */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
              <Package className="h-4 w-4 text-brand" />
              Purchase &amp; Eligibility
            </h2>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-500">Delivered on</dt>
                <dd className="font-medium text-ink">
                  {order?.delivered_at ? formatDate(order.delivered_at) : "Not delivered yet"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-500">Return deadline</dt>
                <dd
                  className={`font-medium ${
                    deadline.isExpired ? "text-red-600" : "text-ink"
                  }`}
                >
                  {deadline.isExpired
                    ? "Passed"
                    : `${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? "" : "s"} left`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-500">Original price</dt>
                <dd className="tnum font-medium text-ink">{money(itemValue)}</dd>
              </div>
              {ret.refund_amount > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-500">Refund</dt>
                  <dd className="tnum font-medium text-ink">
                    {money(ret.refund_amount)}
                    {ret.refund_status === "pending" && (
                      <span className="ml-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        Pending
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-500">
              The window for this return is {deadline.windowDays} days from delivery
              {deadline.formattedDeadline ? ` — it closed on ${deadline.formattedDeadline}` : ""}.
            </p>
          </section>

          {/* Customer & Address Details */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-ink">
              <User className="h-4 w-4 text-brand" />
              Customer Details
            </h2>
            <p className="text-[13.5px] font-semibold text-ink">{ret.customer_name}</p>
            <p className="text-[12.5px] text-gray-500">{ret.customer_email}</p>
            {ret.customer_phone && (
              <p className="text-[12.5px] text-gray-500">{ret.customer_phone}</p>
            )}

            {order && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700">
                  <MapPin className="h-3.5 w-3.5 text-brand" />
                  Pickup / Delivery Address
                </h3>
                <address className="text-[12.5px] not-italic leading-relaxed text-gray-600">
                  {order.address1}
                  {order.address2 && <>, {order.address2}</>}
                  <br />
                  {order.city}, {order.state} — {order.pincode}
                </address>
              </div>
            )}
          </section>

          {/* Interactive Management Actions */}
          <ReturnAdminActions ret={ret} candidates={candidates} />
        </div>
      </div>
    </div>
  );
}

