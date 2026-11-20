import { Clock, ExternalLink, MapPin, PackageCheck, Truck } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_NOTE,
  type ShipmentStatus,
} from "@/lib/shipment-status";
import type { Shipment, TrackingEvent } from "@/lib/shipment-tracking";

/**
 * Where the customer's parcel is.
 *
 * The customer is told what is going on, not what the courier's system
 * called it. The courier's own words are kept for the line they belong
 * on — the place, the remark — and everything else is said in the shop's
 * own words.
 *
 * It is a server component: it reads what the shop has already written
 * down, and it never asks the courier for anything itself.
 */
export function ShipmentTracking({
  shipment,
  events,
  courierName,
  awb,
  shippingMethod,
  trackingUrl,
  courierUrl,
}: {
  shipment: Shipment | null;
  events: TrackingEvent[];
  /** The courier the back office wrote down. */
  courierName: string | null;
  /** The tracking number the back office wrote down. */
  awb: string | null;
  /** How the parcel is going. */
  shippingMethod?: string | null;
  /** Where the customer can follow the parcel. */
  trackingUrl: string | null;
  /** The courier's own tracking page, when the shop knows it. */
  courierUrl?: string | null;
}) {
  // Nothing has been heard from the courier yet: the shop knows who is
  // carrying the parcel and by what number, and that is all it can say.
  const status = (shipment?.status ?? null) as ShipmentStatus | null;
  const latest = events[0] ?? null;

  return (
    <section className="mt-8 rounded-xl border border-brand/20 bg-brand-tint/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Truck className="h-4 w-4 text-brand" />
          Your parcel is on its way
        </h2>
        {status && (
          <span className="rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-brand">
            {SHIPMENT_STATUS_LABEL[status]}
          </span>
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[12px] text-gray-500">Courier partner</dt>
          <dd className="mt-0.5 text-[13.5px] font-semibold text-ink">
            {shipment?.courierName ?? courierName ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-gray-500">Shipping method</dt>
          <dd className="mt-0.5 text-[13.5px] font-semibold text-ink">
            {shippingMethod || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-gray-500">Tracking / AWB number</dt>
          <dd className="tnum mt-0.5 break-all text-[13.5px] font-semibold text-ink">
            {awb ?? shipment?.awb ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-gray-500">
            {status === "delivered" ? "Delivered on" : "Expected by"}
          </dt>
          <dd className="mt-0.5 text-[13.5px] font-semibold text-ink">
            {status === "delivered" && shipment?.deliveredAt
              ? formatDate(shipment.deliveredAt)
              : shipment?.estimatedDelivery
                ? formatDate(shipment.estimatedDelivery)
                : "Not known yet"}
          </dd>
        </div>
      </dl>

      {/* The latest thing the courier said. */}
      {latest ? (
        <div className="mt-4 rounded-lg border border-brand/15 bg-white/70 p-3.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
            <PackageCheck className="h-3.5 w-3.5" />
            Latest update
          </p>
          <p className="mt-1 text-[13px] text-ink">
            {latest.activity ?? latest.statusLabel ?? latest.status ?? "Update received"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
            {latest.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {latest.location}
              </span>
            )}
            {latest.occurredAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDateTime(latest.occurredAt)}
              </span>
            )}
          </p>
        </div>
      ) : (
        status && (
          <p className="mt-4 rounded-lg border border-brand/15 bg-white/70 p-3.5 text-[12.5px] text-gray-600">
            {SHIPMENT_STATUS_NOTE[status]}
          </p>
        )
      )}

      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm mt-4"
        >
          Track your order
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {!trackingUrl && courierUrl && (
        <a
          href={courierUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm mt-4"
        >
          Track your order
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {trackingUrl && courierUrl && courierUrl !== trackingUrl && (
        <a
          href={courierUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
        >
          Track with {courierName ?? "the courier"} directly
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* The journey so far. */}
      {events.length > 0 && (
        <div className="mt-5 border-t border-brand/15 pt-4">
          <h3 className="text-[13px] font-bold text-ink">Tracking history</h3>
          <ol className="mt-3 space-y-0">
            {events.map((event, index) => (
              <li key={`${event.id}-${index}`} className="flex gap-3">
                <span className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      index === 0 ? "bg-brand" : "bg-gray-300"
                    }`}
                    aria-hidden="true"
                  />
                  {index < events.length - 1 && (
                    <span className="w-px flex-1 bg-brand/20" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 pb-4">
                  <span className="block text-[13px] font-semibold text-ink">
                    {event.statusLabel ?? event.status ?? "Update"}
                  </span>
                  {event.activity && event.activity !== (event.statusLabel ?? event.status) && (
                    <span className="mt-0.5 block text-[12.5px] text-gray-600">
                      {event.activity}
                    </span>
                  )}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-gray-500">
                    {event.occurredAt && <span>{formatDateTime(event.occurredAt)}</span>}
                    {event.location && <span>{event.location}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
