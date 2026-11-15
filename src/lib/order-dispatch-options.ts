/**
 * The choices the back office makes about an order.
 *
 * This is deliberately its own module with no database import: the
 * buttons that make these choices are client components, and a client
 * component cannot pull the database into a browser bundle.
 *
 * The courier's tracking pages are here too, for the same reason — the
 * customer's order page shows them, and it is a server component that
 * reads the order from the database.
 */

/**
 * How a parcel is going.
 *
 * The shop ships by surface and by air, and by other things it names
 * itself — a local rider, a hand delivery. That last one is why "other"
 * is here: the back office writes down what it actually is.
 */
export const SHIPPING_METHODS = ["surface", "air", "other"] as const;

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  surface: "Surface",
  air: "Air",
  other: "Other",
};

/**
 * Why an order is being cancelled.
 *
 * The reasons are the ones the back office actually reaches for. "Other"
 * carries a sentence of its own, so a reason that does not fit the list
 * is still written down rather than lost.
 */
export const CANCELLATION_REASON_CODES = [
  "customer_requested",
  "out_of_stock",
  "payment_issue",
  "incorrect_address",
  "courier_issue",
  "other",
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

export const CANCELLATION_REASON_LABEL: Record<CancellationReasonCode, string> = {
  customer_requested: "Customer requested cancellation.",
  out_of_stock: "Product out of stock.",
  payment_issue: "Payment issue.",
  incorrect_address: "Incorrect delivery address.",
  courier_issue: "Courier/shipping issue.",
  other: "Other",
};

/**
 * Where a courier's own tracking page is.
 *
 * These are the couriers' own pages — the page the courier asks the
 * customer to use, where the tracking number is typed in. No address is
 * made up and no number is put into a link that was not built for it:
 * a courier that is not on this list is simply given no link, and the
 * customer is shown the courier's name and the tracking number instead.
 */
const COURIER_TRACKING: { match: string; url: string }[] = [
  { match: "delhivery", url: "https://www.delhivery.com/track/" },
  { match: "bluedart", url: "https://www.bluedart.com/track/" },
  { match: "blue dart", url: "https://www.bluedart.com/track/" },
  { match: "dtdc", url: "https://www.dtdc.in/tracking.asp" },
  { match: "xpressbees", url: "https://www.xpressbees.com/track/" },
  {
    match: "indiapost",
    url: "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx",
  },
  {
    match: "india post",
    url: "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx",
  },
  {
    match: "speed post",
    url: "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx",
  },
  { match: "ecom express", url: "https://ecomexpress.com/tracking/" },
  { match: "ecom", url: "https://ecomexpress.com/tracking/" },
  { match: "shadowfax", url: "https://www.shadowfax.com/track/" },
  { match: "ekart", url: "https://ekart.in/shipment/track" },
  { match: "amazon shipping", url: "https://ship.amazon.in/track" },
  { match: "amazon", url: "https://ship.amazon.in/track" },
  { match: "trackon", url: "https://www.trackon.in/track" },
  { match: "gatikwe", url: "https://gatikwe.com/track-consignment" },
  { match: "gati", url: "https://gatikwe.com/track-consignment" },
  { match: "safexpress", url: "https://www.safexpress.in/track/" },
  { match: "vrl", url: "https://www.vrl.in/track-shipment" },
  { match: "rivigo", url: "https://www.rivigo.com/track" },
  { match: "city courier", url: "https://www.citycourier.in/track-your-shipment" },
  { match: "franchiseeexpress", url: "https://www.franchiseexpress.com/track/" },
  { match: "shivam", url: "https://www.shivamcourier.com/track-order" },
  { match: "agg", url: "https://www.aggconline.com/track/" },
];

/**
 * The courier's own tracking page, when the shop knows the courier.
 *
 * It is the courier's landing page rather than a link with the tracking
 * number in it: a courier's own address for a single consignment is
 * their business and changes from time to time, and the number belongs
 * to the customer to type in.
 */
export function courierTrackingUrl(courier: string | null | undefined): string | null {
  const name = String(courier ?? "").trim().toLowerCase();
  if (!name) return null;
  for (const entry of COURIER_TRACKING) {
    if (name.includes(entry.match)) return entry.url;
  }
  return null;
}
