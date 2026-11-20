/**
 * Where a parcel is.
 *
 * The order's own status says where the *order* is: pending, confirmed,
 * packed, shipped, delivered. This is the other thing — where the *parcel*
 * is, as the courier says. An order can be confirmed and its parcel can be
 * in transit; an order can be delivered and its parcel's last update can
 * still be "out for delivery".
 *
 * The courier's own words are kept as they are — the code, the label and
 * the sentence — because the shop's word and the courier's word are not
 * the same and pretending otherwise loses information. This module only
 * says which of the shop's own handful of states the courier's words fall
 * into, so that the back office can filter on it and the customer can be
 * told something plain.
 *
 * It holds no data and imports nothing, so a client component is free to
 * use it.
 */

/** Where a parcel can be. */
export const SHIPMENT_STATUSES = [
  "pending",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "cancelled",
  "unknown",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** What each of them is called, in the shop's own words. */
export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  pending: "Waiting to be picked up",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery exception",
  cancelled: "Cancelled",
  unknown: "Status unknown",
};

/**
 * A short line about each of them, for the customer.
 *
 * The customer is told what is going on, not what the courier's system
 * called it.
 */
export const SHIPMENT_STATUS_NOTE: Record<ShipmentStatus, string> = {
  pending: "The courier has been given the parcel and has not collected it yet.",
  picked_up: "The courier has collected the parcel.",
  in_transit: "The parcel is on its way.",
  out_for_delivery: "The parcel is out for delivery today.",
  delivered: "The parcel was delivered.",
  exception: "There is a problem with this delivery. We are looking into it.",
  cancelled: "This shipment was called off.",
  unknown: "The courier has not said where the parcel is yet.",
};

/**
 * Whether the parcel has arrived.
 *
 * It is the courier's word that says so, and only the courier's word: the
 * shop does not mark a parcel delivered because the order says so.
 */
export function shipmentIsDelivered(status: string | null | undefined): boolean {
  return String(status ?? "") === "delivered";
}

/**
 * Where the courier's own tracking page for a consignment is.
 *
 * The page is Shiprocket's, and it takes the tracking number in the
 * address — which is the courier's own business, and their choice of
 * shape for it.
 */
/**
 * The courier's tracking number, in the one form the shop matches on.
 *
 * The same consignment is written down in more than one way — with a
 * space in it, in lower case, with a dash — and the courier's webhook
 * does not always write it the way the back office did. So the number is
 * reduced to its letters and digits, in capitals, and that is what the
 * shop matches on.
 *
 * It is only ever used to find a parcel. What the shop shows the
 * customer is the number as it was given.
 */
export function normaliseAwb(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function shiprocketTrackingUrl(awb: string | null | undefined): string | null {
  const number = String(awb ?? "").trim();
  if (!number) return null;
  return `https://www.shiprocket.in/shipment-tracking/${encodeURIComponent(number)}`;
}

/**
 * The courier's words, read as one of the shop's own states.
 *
 * The courier's label is the plainer of the two words they give — "IN
 * TRANSIT" rather than "IT" — so it is read first, and the short code is
 * only used when the label is missing or says nothing useful.
 *
 * The order of the tests matters, and not only because a parcel that is
 * out for delivery has been in transit. A parcel that could *not* be
 * delivered has "DELIVERED" in its own words, so that is read first of
 * all.
 */
export function shipmentStatusFromCourier(input: {
  /** The courier's short code, such as `DLVD` or `OFD`. */
  code?: string | null;
  /** The courier's own label, such as `DELIVERED`. */
  label?: string | null;
  /** The courier's sentence, when they give one. */
  status?: string | null;
}): ShipmentStatus {
  const label = String(input.label ?? "").trim().toUpperCase();
  const code = String(input.code ?? "").trim().toUpperCase();
  const status = String(input.status ?? "").trim().toUpperCase();

  const words = [label, status].filter(Boolean).join(" ");

  // Something went wrong with the delivery: it was refused, it could not
  // be delivered, or it is coming back.
  //
  // This is checked first, and it has to be: a parcel that was *not*
  // delivered has "DELIVERED" in its own words, and reading that as
  // delivered would be the opposite of the truth.
  if (
    /NOT\s*DELIVERED|UNDELIVERED|\bNDR\b|\bRTO\b|RETURN\s*TO\s*ORIGIN|RETURNED|REFUSED|LOST|DAMAGED/.test(
      words
    ) ||
    code === "NDR" ||
    code === "RTO"
  ) {
    return "exception";
  }

  // Called off.
  if (/CANCEL|\bCN\b/.test(words) || code === "CN") {
    return "cancelled";
  }

  // Delivered.
  if (/DELIVERED|\bDLVD\b|\bDEL\b/.test(words) || code === "DLVD") {
    return "delivered";
  }

  // Out for delivery.
  if (/OUT\s*FOR\s*DELIVERY|\bOFD\b|\bIOD\b/.test(words) || code === "OFD") {
    return "out_for_delivery";
  }

  // The courier has it on its list but has not collected it.
  if (
    /AWAITING\s*PICKUP|PICKUP\s*PENDING|TO\s*BE\s*PICKED|NOT\s*PICKED/.test(words) ||
    code === "PKP"
  ) {
    return "pending";
  }

  // Picked up by the courier.
  if (/PICKED|\bPKD\b|\bPK\b/.test(words) || code === "PKD") {
    return "picked_up";
  }

  // Moving.
  if (/IN\s*TRANSIT|\bIT\b|DISPATCHED|REACHED|MOVING|ARRIVED/.test(words)) {
    return "in_transit";
  }

  // The courier said nothing the shop can read. The shop says so rather
  // than guessing.
  return "unknown";
}
