import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { fail, json } from "@/lib/api";
import {
  claimCourierEvent,
  courierEventId,
  findOrderIdByAwb,
  recordCourierEvent,
  releaseCourierEvent,
  saveTrackingUpdate,
} from "@/lib/shipment-tracking";
import {
  courierDate,
  fetchShiprocketTracking,
  type ShiprocketTrackingEvent,
} from "@/lib/shiprocket";
import { shipmentStatusFromCourier } from "@/lib/shipment-status";

/**
 * POST /api/courier-events — the courier saying where a parcel is.
 *
 * The shop books its shipments by hand, in the courier's own panel, and
 * this endpoint is how the courier tells the shop what has happened to
 * one afterwards. It is a webhook: the courier posts to it whenever a
 * parcel moves, and the shop records it.
 *
 * The address is deliberately plain. The courier refuses to send to an
 * address that carries its own name, so this one says only what it does.
 *
 * The order of the work matters.
 *
 * First the key is checked. The courier is given a secret when the
 * address is registered, and it sends that secret in the `x-api-key`
 * header. A delivery without it is not acted on at all — it is not even
 * looked at, because looking at it is doing something with a message
 * that anybody could have sent.
 *
 * Then the delivery is claimed. The courier sends the same delivery again
 * when it does not hear back, so the same news can arrive two or three
 * times. The claim is a row whose key is the delivery's own: the first
 * delivery wins, and the later ones do nothing.
 *
 * Then the news is written down: the parcel, its journey, and the
 * order's own summary of both. The order's status is not touched by
 * this — where the parcel is and where the order is are two different
 * things, and a parcel moving does not confirm an order.
 *
 * The answer is 200 once the delivery has been dealt with. A delivery
 * that carries nothing the shop can act on is also 200: there is nothing
 * to retry, and retrying it for ever would be worse than saying so.
 */

/**
 * The secret the courier sends its deliveries with.
 *
 * It is read from the environment and never written down. Two names are
 * accepted so that the shop can call it either way.
 */
function webhookSecret(): string {
  return String(
    process.env.COURIER_WEBHOOK_SECRET ??
      process.env.SHIPROCKET_WEBHOOK_SECRET ??
      ""
  ).trim();
}

/**
 * Whether a delivery carries the shop's secret.
 *
 * The comparison takes the same time whatever the answer is, so that
 * somebody guessing the secret cannot learn it by timing how long the
 * shop took to say no.
 */
function secretMatches(given: string | null): boolean {
  const expected = webhookSecret();
  if (!expected) return false;
  const offered = String(given ?? "");
  if (!offered) return false;

  const a = Buffer.from(offered, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // The key first. Nothing else is looked at until it has been checked.
  const given = request.headers.get("x-api-key");
  if (!webhookSecret()) {
    return fail(
      "The shop has not been given its courier webhook secret, so deliveries are not being accepted.",
      503
    );
  }
  if (!secretMatches(given)) {
    return fail("The delivery was refused: the key did not match.", 401);
  }

  // The body, exactly as it arrived. It is the key of the delivery when
  // the courier sends no id of its own, so it cannot be read and put
  // back together.
  const body = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return fail("The delivery could not be read, so it was not acted on.", 400);
  }

  const eventId = courierEventId({
    headerId:
      request.headers.get("x-event-id") ??
      request.headers.get("x-webhook-id") ??
      request.headers.get("x-request-id"),
    body,
  });

  // The claim. A delivery that has already been dealt with does nothing
  // the second time.
  const claimed = await claimCourierEvent(eventId);
  if (!claimed) {
    return json({ ok: true, outcome: "already_applied", event_id: eventId });
  }

  try {
    const outcome = await handleDelivery(payload, body);
    await recordCourierEvent({
      eventId,
      awb: outcome.awb,
      outcome: outcome.outcome,
      payload: body,
    });
    return json({ ok: true, outcome: outcome.outcome, event_id: eventId });
  } catch (err) {
    // The delivery could not be dealt with. The claim is given back, so
    // that the courier's next attempt — which will be the same delivery
    // of the same news — is acted on rather than swallowed.
    await releaseCourierEvent(eventId);
    console.error(
      "[courier-events] the delivery could not be dealt with:",
      err
    );
    return fail("The delivery could not be dealt with.", 500);
  }
}

/**
 * What the shop does about a delivery.
 */
async function handleDelivery(
  payload: unknown,
  body: string
): Promise<{ outcome: string; awb: string | null }> {
  const awb = readAwb(payload);
  if (!awb) {
    // There is nothing here the shop can act on. It is not a failure:
    // the same delivery would say the same thing next time.
    return { outcome: "ignored", awb: null };
  }

  const orderId = await findOrderIdByAwb(awb);
  if (!orderId) {
    // A parcel the shop has no order for. It may be a test, or a
    // consignment that belongs to somebody else. Either way, there is
    // nothing to record it against.
    return { outcome: "unmatched", awb };
  }

  const events = readEvents(payload);
  const code = readString(payload, [
    "current_status_code",
    "currentStatusCode",
    "status_code",
    "statusCode",
    "sr-status",
    "sr_status",
  ]);
  const label = readString(payload, [
    "current_status_label",
    "currentStatusLabel",
    "sr-status-label",
    "sr_status_label",
  ]);
  const text = readString(payload, [
    "current_status",
    "currentStatus",
    "shipment_status",
    "status_description",
    "activity",
    "remarks",
    "Remark",
    "status",
  ]);
  const location = readString(payload, ["location", "Location", "city", "hub"]);
  const occurredAt = courierDate(
    readString(payload, ["date", "Date", "occurred_at", "timestamp", "updated_at"])
  );

  const status = shipmentStatusFromCourier({ code, label, status: text });

  // A delivery that carries no journey of its own is a single event: the
  // one it is about.
  const journey: ShiprocketTrackingEvent[] =
    events.length > 0
      ? events
      : [
          {
            status: code,
            statusLabel: label,
            activity: text,
            location,
            occurredAt,
          },
        ];

  // When the courier sends only the one event, the shop asks the courier
  // for the whole journey so that the customer's timeline is complete.
  // It is best effort: a courier that cannot be reached does not stop
  // the news that *was* sent from being recorded.
  let full = journey;
  if (events.length === 0) {
    try {
      const tracking = await fetchShiprocketTracking(awb);
      if (tracking.events.length > 0) full = tracking.events;
    } catch {
      // The courier could not be reached. The event that was sent is
      // still worth having.
    }
  }

  const result = await saveTrackingUpdate({
    awb,
    courierName: readString(payload, ["courier_name", "courierName", "courier"]),
    status,
    statusCode: code,
    statusLabel: label,
    statusText: text,
    location,
    estimatedDelivery: readString(payload, [
      "estimated_delivery_date",
      "estimatedDeliveryDate",
      "edd",
      "estimated_delivery",
    ]),
    pickedUpAt: readString(payload, ["pickup_date", "picked_up_at"]),
    deliveredAt: readString(payload, ["delivered_date", "delivered_at"]),
    shipmentId: readString(payload, ["shipment_id", "shipmentId"]),
    events: full,
    source: "webhook",
  });

  if (!result.ok) {
    // The order could not be written to. It is a failure, and the
    // courier's next attempt is welcome.
    throw new Error(result.message);
  }

  // The customer's page is looked at again, so that the parcel's new
  // whereabouts are shown without waiting for the page to be reloaded.
  // A cache that will not be cleared is not a reason to fail a delivery:
  // the news has already been written down, which is what matters.
  try {
    revalidatePath(`/order/${orderId}`);
    revalidatePath("/account/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
  } catch {
    // The pages will be looked at again when they are next asked for.
  }

  return { outcome: result.newEvents ? "applied" : "already_applied", awb };
}

/* ------------------------------------------------------------- the payload */

/**
 * The tracking number a delivery is about.
 *
 * The courier has more than one name for it, and the name it uses has
 * changed over the years, so the body is searched for each of them.
 */
function readAwb(payload: unknown): string | null {
  return readString(payload, [
    "awb",
    "AWB",
    "awb_code",
    "awbCode",
    "awb_number",
    "awbNumber",
    "tracking_number",
    "trackingNumber",
    "consignment_number",
    "shipment_awb",
  ]);
}

/**
 * The journey a delivery carries, if it carries one.
 */
function readEvents(payload: unknown): ShiprocketTrackingEvent[] {
  const raw = readArray(payload, [
    "shipment_track",
    "shipmentTrack",
    "tracking_history",
    "trackingHistory",
    "shipment_track_activities",
    "activities",
    "events",
  ]);
  if (raw.length === 0) return [];

  const events: ShiprocketTrackingEvent[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const status = readString(r, ["status", "Status", "status_code"]);
    const statusLabel = readString(r, [
      "sr-status-label",
      "sr_status_label",
      "status_label",
      "statusLabel",
    ]);
    const activity = readString(r, [
      "activity",
      "Activity",
      "status_description",
      "remarks",
      "Remark",
      "current_status",
    ]);
    const location = readString(r, ["location", "Location", "city", "hub"]);
    const occurredAt = courierDate(
      readString(r, ["date", "Date", "occurred_at", "timestamp", "status_date"])
    );
    if (!status && !activity && !statusLabel) continue;

    events.push({ status, statusLabel, activity, location, occurredAt });
  }

  return events;
}

/**
 * A string from the body, looked for under any of the names given.
 *
 * The body is searched, not just its top level: the courier has put the
 * same facts in different places over the years, and a delivery that
 * carries the tracking number two levels down is still a delivery about
 * a parcel.
 */
function readString(payload: unknown, keys: string[]): string | null {
  const found = findValue(payload, keys, 0);
  if (found === null || found === undefined) return null;
  if (typeof found === "string") {
    const trimmed = found.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof found === "number" || typeof found === "boolean") {
    return String(found);
  }
  return null;
}

/**
 * A list from the body, looked for under any of the names given.
 */
function readArray(payload: unknown, keys: string[]): unknown[] {
  const found = findValue(payload, keys, 0);
  return Array.isArray(found) ? found : [];
}

/**
 * The first value in the body under any of the names given.
 *
 * The search is depth-limited: a body that nests its facts four levels
 * down is not one the shop is going to understand, and an endless walk
 * through it would be a slow way to learn nothing.
 */
function findValue(
  payload: unknown,
  keys: string[],
  depth: number
): unknown {
  if (depth > 4) return null;
  if (!payload || typeof payload !== "object") return null;

  if (Array.isArray(payload)) {
    for (const row of payload) {
      const found = findValue(row, keys, depth + 1);
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) {
      const value = record[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object") continue;
    const found = findValue(value, keys, depth + 1);
    if (found !== null && found !== undefined) return found;
  }

  return null;
}
