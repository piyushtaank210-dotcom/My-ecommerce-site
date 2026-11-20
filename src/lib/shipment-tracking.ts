/**
 * The shop's record of a parcel.
 *
 * The courier knows where the parcel is; this is where the shop keeps
 * what it has been told. Nothing here talks to the courier — that is the
 * Shiprocket module's business — and nothing here decides whether the
 * courier's word is true. It writes down what was said, and it writes it
 * down once.
 *
 * Three things live here:
 *
 *   · the parcel itself — where it is now, in the courier's own words
 *   · its journey — every event the courier has reported, in order
 *   · the courier's webhook — what it sent, and what became of it
 *
 * The order keeps a summary of all of it, so that the order's page can be
 * drawn without a second question. The summary is a summary: the courier's
 * own words are kept here, on the parcel and on its journey, and the
 * order carries the shop's own plain words alongside them.
 *
 * The shop books its shipments by hand. Nothing in this module creates a
 * shipment, assigns a courier or books a pickup.
 */

import { createHash, randomBytes } from "node:crypto";
import { getDb, withTransaction } from "./db";
import { getOrder } from "./orders";
import { notify } from "./notifications";
import {
  normaliseAwb,
  shiprocketTrackingUrl,
  shipmentStatusFromCourier,
  type ShipmentStatus,
} from "./shipment-status";
import {
  courierDate,
  fetchShiprocketTracking,
  type ShiprocketTrackingEvent,
} from "./shiprocket";

/* ------------------------------------------------------------- vocabulary */

/** Where a piece of news about a parcel came from. */
export type TrackingSource = "api" | "webhook";

/**
 * The parcel, as the shop knows it.
 */
export type Shipment = {
  id: string;
  orderId: string;
  awb: string;
  courierName: string | null;
  shipmentId: string | null;
  /** Where the parcel is, in the shop's own states. */
  status: ShipmentStatus;
  /** The courier's short code for it. */
  statusCode: string | null;
  /** The courier's own label for it. */
  statusLabel: string | null;
  /** The courier's sentence for it. */
  statusText: string | null;
  location: string | null;
  estimatedDelivery: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  /** When the parcel went out. */
  shipmentDate: string | null;
  /** Where the customer can follow it. */
  trackingUrl: string | null;
  source: TrackingSource;
  lastEventAt: string | null;
  updatedAt: string;
};

/**
 * One event in a parcel's journey.
 */
export type TrackingEvent = {
  id: number;
  status: string | null;
  statusCode: string | null;
  statusLabel: string | null;
  activity: string | null;
  location: string | null;
  occurredAt: string | null;
  source: TrackingSource;
};

/* --------------------------------------------------------------- reading */

/**
 * The parcel of an order, if it has one.
 *
 * The most recently updated one is the one that is shown: an order that
 * had a second consignment written against it keeps both, and the one
 * that was heard from last is the one that is going on.
 */
export async function getShipmentForOrder(orderId: string): Promise<Shipment | null> {
  const row = (await getDb()
    .prepare(
      "SELECT * FROM order_shipments WHERE order_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1"
    )
    .get(orderId)) as Record<string, unknown> | undefined;
  if (!row) return null;
  return readShipment(row);
}

/**
 * The journey of a parcel, newest first.
 */
export async function getTrackingEvents(orderId: string): Promise<TrackingEvent[]> {
  const rows = (await getDb()
    .prepare(
      `SELECT id, status, status_code, status_label, activity, location,
              occurred_at, source
         FROM shipment_tracking_events
        WHERE order_id = ?
        ORDER BY occurred_at DESC NULLS LAST, id DESC`
    )
    .all(orderId)) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: Number(row.id ?? 0),
    status: row.status === null ? null : String(row.status),
    statusCode: row.status_code === null ? null : String(row.status_code),
    statusLabel: row.status_label === null ? null : String(row.status_label),
    activity: row.activity === null ? null : String(row.activity),
    location: row.location === null ? null : String(row.location),
    occurredAt: row.occurred_at === null ? null : String(row.occurred_at),
    source: (String(row.source ?? "api") as TrackingSource),
  }));
}

/**
 * The order a tracking number belongs to.
 *
 * The number is matched on its letters and digits, so that the courier's
 * webhook finds the order even when it writes the number a slightly
 * different way from the way the back office did.
 */
export async function findOrderIdByAwb(awb: string): Promise<string | null> {
  const key = normaliseAwb(awb);
  if (!key) return null;

  const row = (await getDb()
    .prepare(
      "SELECT id FROM orders WHERE awb_key = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(key)) as { id?: string } | undefined;
  if (row?.id) return String(row.id);

  // An order dispatched before the key column existed has no key yet.
  // The numbers are matched by hand here, which is only ever a short
  // list: an order with no tracking number is not in it.
  const rows = (await getDb()
    .prepare(
      "SELECT id, tracking_id FROM orders WHERE tracking_id IS NOT NULL AND tracking_id <> ''"
    )
    .all()) as { id?: string; tracking_id?: string }[];

  for (const row of rows) {
    if (normaliseAwb(row.tracking_id) === key) return String(row.id);
  }

  return null;
}

/* --------------------------------------------------------------- writing */

/**
 * What the courier has said about a parcel, ready to be written down.
 */
export type TrackingUpdate = {
  /** The tracking number, as it was given. */
  awb: string;
  /**
   * The order it is about.
   *
   * It is worked out from the tracking number when it is not given. The
   * back office knows which order it is asking about; the courier's
   * webhook does not, and has to be told by the number.
   */
  orderId?: string | null;
  /** The courier carrying it. */
  courierName?: string | null;
  /** Where the parcel is, in the shop's own states. */
  status?: ShipmentStatus | null;
  /** The courier's short code for it. */
  statusCode?: string | null;
  /** The courier's own label for it. */
  statusLabel?: string | null;
  /** The courier's sentence for it. */
  statusText?: string | null;
  location?: string | null;
  estimatedDelivery?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  /** Shiprocket's own reference for the shipment. */
  shipmentId?: string | null;
  /** The journey, as the courier gave it. */
  events?: ShiprocketTrackingEvent[];
  /** Where this came from. */
  source?: TrackingSource;
};

/**
 * What happened when a piece of news about a parcel was written down.
 */
export type SaveTrackingResult = {
  ok: boolean;
  message: string;
  /** The order it was about, when it was about one. */
  orderId?: string;
  /** How many events were new. */
  newEvents?: number;
  /** Whether the parcel has moved on since the last word. */
  statusChanged?: boolean;
};

/**
 * Writes down what the courier has said.
 *
 * The parcel is written, the journey is added to, and the order's
 * summary is brought up to date — all in one transaction, so that an
 * order can never carry a status its own journey does not have.
 *
 * An event that has already been written is not written again. The key
 * of an event is what it is made of, so the same event arriving twice —
 * once through the courier's webhook and once when somebody asks for the
 * tracking again — is still one event.
 */
export async function saveTrackingUpdate(
  update: TrackingUpdate
): Promise<SaveTrackingResult> {
  const awb = String(update.awb ?? "").trim();
  const awbKey = normaliseAwb(awb);
  if (!awbKey) {
    return { ok: false, message: "There is no tracking number in that." };
  }

  const orderId = update.orderId ?? (await findOrderIdByAwb(awbKey));
  if (!orderId) {
    return {
      ok: false,
      message: "No order in the shop carries that tracking number.",
    };
  }

  const source: TrackingSource = update.source === "webhook" ? "webhook" : "api";
  const events = update.events ?? [];

  const status =
    update.status ??
    shipmentStatusFromCourier({
      code: update.statusCode ?? events[0]?.status ?? null,
      label: update.statusLabel ?? events[0]?.statusLabel ?? null,
      status: update.statusText ?? events[0]?.activity ?? null,
    });

  // The first thing the courier said that means the parcel has gone.
  const shipmentDate =
    update.pickedUpAt ??
    firstMovementDate(events) ??
    null;

  const lastEventAt =
    events.find((e) => e.occurredAt)?.occurredAt ??
    update.deliveredAt ??
    update.pickedUpAt ??
    null;

  const trackingUrl = shiprocketTrackingUrl(awb);
  const now = new Date().toISOString();

  const written = await withTransaction(async (tx) => {
    // The parcel.
    const shipmentId = `SHP${randomBytes(5).toString("hex").toUpperCase()}`;
    await tx
      .prepare(
        `INSERT INTO order_shipments
           (id, order_id, awb, awb_key, courier_name, shipment_id, status,
            status_code, status_label, status_text, location,
            estimated_delivery, picked_up_at, delivered_at, shipment_date,
            tracking_url, source, last_event_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (order_id, awb_key) DO UPDATE
           SET courier_name = COALESCE(EXCLUDED.courier_name, order_shipments.courier_name),
               shipment_id = COALESCE(EXCLUDED.shipment_id, order_shipments.shipment_id),
               status = EXCLUDED.status,
               status_code = COALESCE(EXCLUDED.status_code, order_shipments.status_code),
               status_label = COALESCE(EXCLUDED.status_label, order_shipments.status_label),
               status_text = COALESCE(EXCLUDED.status_text, order_shipments.status_text),
               location = COALESCE(EXCLUDED.location, order_shipments.location),
               estimated_delivery = COALESCE(EXCLUDED.estimated_delivery, order_shipments.estimated_delivery),
               picked_up_at = COALESCE(EXCLUDED.picked_up_at, order_shipments.picked_up_at),
               delivered_at = COALESCE(EXCLUDED.delivered_at, order_shipments.delivered_at),
               shipment_date = COALESCE(EXCLUDED.shipment_date, order_shipments.shipment_date),
               tracking_url = COALESCE(EXCLUDED.tracking_url, order_shipments.tracking_url),
               source = EXCLUDED.source,
               last_event_at = COALESCE(EXCLUDED.last_event_at, order_shipments.last_event_at),
               updated_at = EXCLUDED.updated_at`
      )
      .run(
        shipmentId,
        orderId,
        awb,
        awbKey,
        update.courierName ?? null,
        update.shipmentId ?? null,
        status,
        update.statusCode ?? null,
        update.statusLabel ?? null,
        update.statusText ?? null,
        update.location ?? null,
        update.estimatedDelivery ?? null,
        update.pickedUpAt ?? null,
        update.deliveredAt ?? null,
        shipmentDate,
        trackingUrl,
        source,
        lastEventAt,
        now,
        now
      );

    const row = (await tx
      .prepare(
        "SELECT id FROM order_shipments WHERE order_id = ? AND awb_key = ?"
      )
      .get(orderId, awbKey)) as { id?: string } | undefined;
    const parcelId = String(row?.id ?? shipmentId);

    // The journey. An event that is already there is left alone.
    const insertEvent = tx.prepare(
      `INSERT INTO shipment_tracking_events
         (shipment_id, order_id, awb, status, status_code, status_label,
          activity, location, occurred_at, source, event_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (event_key) DO NOTHING`
    );

    let newEvents = 0;
    for (const event of events) {
      const key = eventKey({
        awbKey,
        status: event.status ?? null,
        occurredAt: event.occurredAt ?? null,
        activity: event.activity ?? null,
        location: event.location ?? null,
      });
      if (!key) continue;
      const writtenEvent = await insertEvent.run(
        parcelId,
        orderId,
        awb,
        event.status ?? null,
        event.status ?? null,
        event.statusLabel ?? null,
        event.activity ?? null,
        event.location ?? null,
        event.occurredAt ?? null,
        source,
        key,
        now
      );
      if (writtenEvent.changes > 0) newEvents++;
    }

    // The order's summary of it all.
    const before = (await tx
      .prepare("SELECT shipment_status FROM orders WHERE id = ?")
      .get(orderId)) as { shipment_status?: string | null } | undefined;

    await tx
      .prepare(
        `UPDATE orders
            SET shipment_status = ?,
                shipment_date = COALESCE(?, shipment_date),
                shipment_updated_at = ?,
                estimated_delivery = COALESCE(?, estimated_delivery),
                tracking_url = COALESCE(?, tracking_url)
          WHERE id = ?`
      )
      .run(
        status,
        shipmentDate,
        lastEventAt ?? now,
        update.estimatedDelivery ?? null,
        trackingUrl,
        orderId
      );

    return {
      newEvents,
      statusChanged: String(before?.shipment_status ?? "") !== status,
    };
  });

  // The customer is told when the parcel has moved on. It is sent after
  // the change is recorded, so that a mail that cannot go out never
  // stops the tracking being written down.
  if (written.statusChanged) {
    await notifyCustomerAboutShipment({ orderId, status, awb });
  }

  return {
    ok: true,
    message:
      written.newEvents > 0
        ? `The tracking for ${awb} was recorded (${written.newEvents} new ${
            written.newEvents === 1 ? "event" : "events"
          }).`
        : `The tracking for ${awb} is already up to date.`,
    orderId,
    newEvents: written.newEvents,
    statusChanged: written.statusChanged,
  };
}

/**
 * The date the parcel first went out.
 *
 * It is the day the courier collected it, and the day the first event
 * that means it is moving happened. When neither is known, the shop does
 * not guess: the date stays empty.
 */
function firstMovementDate(
  events: ShiprocketTrackingEvent[]
): string | null {
  for (const event of events) {
    const status = shipmentStatusFromCourier({
      code: event.status ?? null,
      label: event.statusLabel ?? null,
      status: event.activity ?? null,
    });
    if (status === "picked_up" || status === "in_transit") {
      if (event.occurredAt) return event.occurredAt;
    }
  }
  return null;
}

/**
 * What makes an event that event.
 *
 * It is made of the parcel it is about, the courier's code for it, when
 * it happened and what the courier said. Two deliveries of the same event
 * make the same key, and the key is unique — so the same event lands
 * once.
 */
export function eventKey(input: {
  awbKey: string;
  status: string | null;
  occurredAt: string | null;
  activity: string | null;
  location: string | null;
}): string {
  const parts = [
    input.awbKey,
    input.status ?? "",
    input.occurredAt ?? "",
    input.activity ?? "",
    input.location ?? "",
  ];
  if (!parts[0]) return "";
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/* -------------------------------------------------------- the courier's webhook */

/**
 * Claims a delivery of the courier's webhook.
 *
 * The key is the delivery's own. A webhook that is delivered twice — the
 * courier does that when it does not hear back — is acted on once: the
 * first delivery wins the claim, and the second one is told that it has
 * already been dealt with.
 *
 * It never throws. A claim that cannot be written is a claim that is
 * refused, and the caller decides what to do about it.
 */
export async function claimCourierEvent(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    const claimed = await getDb()
      .prepare(
        `INSERT INTO courier_webhook_events (event_id, outcome, received_at)
         VALUES (?,'claimed',?)
         ON CONFLICT (event_id) DO NOTHING`
      )
      .run(eventId, new Date().toISOString());
    return claimed.changes > 0;
  } catch (err) {
    console.warn(
      "[courier-events] the delivery could not be claimed:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Gives a claim back, so that the same delivery can be acted on again.
 *
 * It is used when the delivery could not be carried out — the database
 * was unreachable, or the write failed. The courier sends the delivery
 * again when it does not hear back, and the second time it is the same
 * delivery of the same news, so the news should be acted on then.
 */
export async function releaseCourierEvent(eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    await getDb()
      .prepare("DELETE FROM courier_webhook_events WHERE event_id = ?")
      .run(eventId);
  } catch (err) {
    console.warn(
      "[courier-events] the delivery could not be given back:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Writes down what became of a delivery of the courier's webhook.
 */
export async function recordCourierEvent(input: {
  eventId: string;
  awb?: string | null;
  outcome: string;
  payload?: string | null;
}): Promise<void> {
  try {
    await getDb()
      .prepare(
        `UPDATE courier_webhook_events
            SET outcome = ?, awb = ?, payload = ?
          WHERE event_id = ?`
      )
      .run(input.outcome, input.awb ?? null, input.payload ?? null, input.eventId);
  } catch (err) {
    console.warn(
      "[courier-events] the delivery could not be written down:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * The key a delivery of the courier's webhook is known by.
 *
 * The courier's own delivery id is used when it sends one. When it does
 * not, the body itself is the key: the same delivery is the same bytes,
 * so the same delivery is the same key.
 */
export function courierEventId(input: {
  headerId?: string | null;
  body: string;
}): string {
  const header = String(input.headerId ?? "").trim();
  if (header) return `hdr:${header}`;
  return `body:${createHash("sha256").update(input.body).digest("hex")}`;
}

/* -------------------------------------------------------------- refreshing */

/**
 * Asks the courier where the parcel is, and writes down the answer.
 *
 * It is the back office's way of keeping up with a parcel without
 * waiting for the courier's webhook: the same tracking number is looked
 * up, the same journey is written, and the same event is not written
 * twice.
 *
 * It only reads. Nothing here books a shipment, assigns a courier or
 * asks for a pickup — the booking is the shop's own work, done by hand.
 */
export async function refreshShipmentTracking(input: {
  orderId: string;
  userId?: number | null;
}): Promise<{ ok: boolean; message: string; statusChanged?: boolean }> {
  const order = await getOrder(input.orderId);
  if (!order) {
    return { ok: false, message: "That order no longer exists." };
  }

  const awb = String(order.tracking_id ?? "").trim();
  if (!awb) {
    return {
      ok: false,
      message:
        "This order has no tracking number yet, so there is nothing to look up.",
    };
  }

  let tracking;
  try {
    tracking = await fetchShiprocketTracking(awb);
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "The courier could not be reached, so the tracking was not updated.",
    };
  }

  const current = tracking.events[0] ?? null;
  const status = shipmentStatusFromCourier({
    code: current?.status ?? null,
    label: current?.statusLabel ?? null,
    status: tracking.currentStatus ?? current?.activity ?? null,
  });

  const result = await saveTrackingUpdate({
    awb,
    orderId: order.id,
    courierName: tracking.courierName,
    status,
    statusCode: current?.status ?? null,
    statusLabel: current?.statusLabel ?? null,
    statusText: tracking.currentStatus ?? current?.activity ?? null,
    location: current?.location ?? tracking.location ?? null,
    estimatedDelivery: courierDate(tracking.estimatedDelivery),
    pickedUpAt: courierDate(tracking.pickedUpAt),
    deliveredAt: courierDate(tracking.deliveredAt),
    shipmentId: tracking.shipmentId ?? null,
    events: tracking.events,
    source: "api",
  });

  return {
    ok: result.ok,
    message: result.ok
      ? result.message
      : (result.message ?? "The tracking could not be written down."),
    statusChanged: result.statusChanged,
  };
}

/* -------------------------------------------------------------- notifying */

/**
 * Tells the customer where their parcel is.
 *
 * One message for each state the parcel is in, so that the same news
 * twice is one message, and a parcel that has moved on is told again.
 */
async function notifyCustomerAboutShipment(input: {
  orderId: string;
  status: ShipmentStatus;
  awb: string;
}): Promise<void> {
  try {
    const order = await getOrder(input.orderId);
    if (!order) return;
    const email = order.email.trim();
    if (!email) return;

    const shipment = await getShipmentForOrder(input.orderId);
    const location = shipment?.location ?? null;

    await notify({
      audience: "customer",
      userId: order.user_id ?? null,
      email,
      orderId: order.id,
      kind: "order_tracking_update",
      title: `Order ${order.id} — ${shipmentStatusLabel(input.status)}`,
      body: [
        `Your order ${order.id} is on its way, and we have news about it.`,
        "",
        `Courier: ${shipment?.courierName ?? order.courier_partner ?? "—"}`,
        `Tracking number: ${input.awb}`,
        `Status: ${shipmentStatusLabel(input.status)}`,
        ...(location ? [`Where: ${location}`] : []),
        ...(shipment?.estimatedDelivery
          ? [`Expected by: ${shipment.estimatedDelivery}`]
          : []),
        "",
        "You can follow your parcel from your account.",
      ].join("\n"),
      dedupeKey: `order:${order.id}:shipment:${input.status}`,
    });
  } catch (err) {
    console.warn(
      "[shipment] the customer could not be told about the tracking:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * The shop's own words for a parcel's state.
 */
function shipmentStatusLabel(status: ShipmentStatus): string {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "out_for_delivery":
      return "Out for delivery";
    case "in_transit":
      return "In transit";
    case "picked_up":
      return "Picked up";
    case "exception":
      return "A problem with the delivery";
    case "cancelled":
      return "Cancelled";
    case "pending":
      return "Waiting to be picked up";
    default:
      return "On its way";
  }
}

/**
 * A parcel row, read.
 */
function readShipment(row: Record<string, unknown>): Shipment {
  const status = String(row.status ?? "pending") as ShipmentStatus;
  return {
    id: String(row.id ?? ""),
    orderId: String(row.order_id ?? ""),
    awb: String(row.awb ?? ""),
    courierName: row.courier_name === null ? null : String(row.courier_name),
    shipmentId: row.shipment_id === null ? null : String(row.shipment_id),
    status,
    statusCode: row.status_code === null ? null : String(row.status_code),
    statusLabel: row.status_label === null ? null : String(row.status_label),
    statusText: row.status_text === null ? null : String(row.status_text),
    location: row.location === null ? null : String(row.location),
    estimatedDelivery:
      row.estimated_delivery === null ? null : String(row.estimated_delivery),
    pickedUpAt: row.picked_up_at === null ? null : String(row.picked_up_at),
    deliveredAt: row.delivered_at === null ? null : String(row.delivered_at),
    shipmentDate: row.shipment_date === null ? null : String(row.shipment_date),
    trackingUrl: row.tracking_url === null ? null : String(row.tracking_url),
    source: String(row.source ?? "api") as TrackingSource,
    lastEventAt: row.last_event_at === null ? null : String(row.last_event_at),
    updatedAt: String(row.updated_at ?? ""),
  };
}
