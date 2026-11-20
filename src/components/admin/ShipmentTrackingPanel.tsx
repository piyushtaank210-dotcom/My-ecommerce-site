import { ExternalLink, MapPin, PackageSearch, Truck } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  SHIPMENT_STATUS_LABEL,
  type ShipmentStatus,
} from "@/lib/shipment-status";
import { SHIPMENT_STATUS_TONE } from "@/lib/status-tone";
import type { Shipment, TrackingEvent } from "@/lib/shipment-tracking";
import { Badge } from "@/components/admin/ui/Badge";
import { Panel } from "@/components/admin/ui/Panel";
import { TrackingRefreshButton } from "@/components/admin/TrackingRefreshButton";

/**
 * Where the parcel is, in the back office.
 *
 * The courier's own words are shown as they are — the code, the label and
 * the sentence — because the shop's word and the courier's word are not
 * the same, and the courier's is the one that is a fact. The shop's own
 * word is the badge beside it, so that the panel can be read at a
 * glance and the courier's account is still there to be read.
 *
 * It only reads. The shop books its shipments by hand, so the button in
 * this panel asks the courier what it knows and nothing more.
 */
export function ShipmentTrackingPanel({
  orderId,
  shipment,
  events,
  courierName,
  awb,
  canUpdate,
  trackingUrl,
}: {
  orderId: string;
  shipment: Shipment | null;
  events: TrackingEvent[];
  /** The courier the back office wrote down. */
  courierName: string | null;
  /** The tracking number the back office wrote down. */
  awb: string | null;
  /** Whether this person may change the order. */
  canUpdate: boolean;
  /** Where the parcel can be followed. */
  trackingUrl: string | null;
}) {
  const status = (shipment?.status ?? null) as ShipmentStatus | null;
  const latest = events[0] ?? null;

  return (
    <Panel
      title={
        <>
          <Truck className="h-4 w-4 text-brand" />
          Shipment tracking
        </>
      }
      description={
        shipment
          ? "What the courier has reported about this parcel."
          : "Nothing has been heard from the courier about this parcel yet."
      }
      actions={
        <TrackingRefreshButton orderId={orderId} canUpdate={canUpdate} />
      }
      bodyClass="admin-panel-body--tight"
    >
      <dl className="admin-facts">
        <div className="admin-fact">
          <dt>Dispatch status</dt>
          <dd>
            {status ? (
              <Badge
                tone={SHIPMENT_STATUS_TONE[status] ?? "neutral"}
                dot={status !== "delivered" && status !== "cancelled"}
              >
                {SHIPMENT_STATUS_LABEL[status]}
              </Badge>
            ) : (
              "Not known yet"
            )}
          </dd>
        </div>
        <div className="admin-fact">
          <dt>Courier company</dt>
          <dd>{shipment?.courierName ?? courierName ?? "—"}</dd>
        </div>
        <div className="admin-fact">
          <dt>AWB / Tracking ID</dt>
          <dd className="tnum min-w-0 break-all">{awb ?? shipment?.awb ?? "—"}</dd>
        </div>
        <div className="admin-fact">
          <dt>Shipment date</dt>
          <dd>
            {shipment?.shipmentDate
              ? formatDate(shipment.shipmentDate)
              : "Not recorded"}
          </dd>
        </div>
        <div className="admin-fact">
          <dt>Expected delivery</dt>
          <dd>
            {shipment?.estimatedDelivery
              ? formatDate(shipment.estimatedDelivery)
              : "Not known yet"}
          </dd>
        </div>
        <div className="admin-fact">
          <dt>Last update</dt>
          <dd>
            {shipment?.lastEventAt
              ? formatDateTime(shipment.lastEventAt)
              : "Nothing yet"}
          </dd>
        </div>
        {shipment?.statusCode && (
          <div className="admin-fact">
            <dt>Courier's status</dt>
            <dd className="tnum min-w-0 break-all text-[12px]">
              {shipment.statusLabel
                ? `${shipment.statusLabel} (${shipment.statusCode})`
                : shipment.statusCode}
            </dd>
          </div>
        )}
        {shipment?.location && (
          <div className="admin-fact">
            <dt>Last location</dt>
            <dd className="text-left">{shipment.location}</dd>
          </div>
        )}
      </dl>

      {trackingUrl && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-links"
          >
            Track this shipment
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* The latest thing the courier said, in their own words. */}
      {latest && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-[12px] font-semibold text-gray-700">
            Latest update from the courier
          </p>
          <p className="mt-1 text-[13px] text-ink">
            {latest.activity ?? latest.statusLabel ?? latest.status ?? "—"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
            {latest.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {latest.location}
              </span>
            )}
            {latest.occurredAt && <span>{formatDateTime(latest.occurredAt)}</span>}
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
              via {latest.source === "webhook" ? "webhook" : "the courier's API"}
            </span>
          </p>
        </div>
      )}

      {/* The journey. */}
      {events.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
            <PackageSearch className="h-3.5 w-3.5" />
            Tracking history ({events.length})
          </p>
          <ol className="mt-2 space-y-2">
            {events.slice(0, 12).map((event, index) => (
              <li
                key={`${event.id}-${index}`}
                className="flex gap-2.5 text-[12.5px]"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    index === 0 ? "bg-brand" : "bg-gray-300"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {event.statusLabel ?? event.status ?? "Update"}
                  </span>
                  {event.activity &&
                    event.activity !== (event.statusLabel ?? event.status) && (
                      <span className="mt-0.5 block text-gray-600">
                        {event.activity}
                      </span>
                    )}
                  <span className="mt-0.5 block text-[11.5px] text-gray-500">
                    {event.occurredAt ? formatDateTime(event.occurredAt) : "No date"}
                    {event.location ? ` — ${event.location}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {events.length > 12 && (
            <p className="mt-2 text-[11.5px] text-gray-500">
              Showing the twelve most recent of {events.length} events.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
