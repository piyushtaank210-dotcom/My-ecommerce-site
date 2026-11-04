/**
 * The store's public details, in one place.
 *
 * The homepage trust panel, the footer and the legal pages all describe the
 * same business, so the facts live here rather than being written out again
 * in each one — a promise that appears twice in two slightly different words
 * is exactly what makes a site feel like a template.
 *
 * The legal fields are blank until they are filled in. Any row whose value is
 * empty is left out of the page entirely, so a half-finished address is never
 * shown to a customer — fill the field in here and the row appears.
 */
export const STORE = {
  /** The trading name, used across the site. */
  name: "ConsoleSeller",

  /** What the business is, in a line. */
  tagline: "A console and controller retailer in India",

  /** The store's domain and URL. */
  domain: "consoleseller.com",
  url: "https://consoleseller.com",

  /** The address customers write to. */
  email: "piyushtaank210@gmail.com",

  /** When a real person is at the other end of the email. */
  hours: "Monday to Saturday, 9am – 7pm IST",

  /**
   * The legal identity of the business. These are optional — the homepage
   * leaves out whatever is still blank.
   */
  legalName: "Console Seller",
  address: "H.No. 193, Ranchi Colony, Tharike Threekey",
  city: "Ludhiana, Punjab - 142021",
  gstin: "",
  phone: "+91 98760 22697",

  /** The commercial promises, so the copy cannot contradict itself. */
  replacementDays: 5,
  dispatchCutoff: "4pm",
  dispatchWindow: "the same working day",
  deliveryWindow: "2–4 working days to metros, a little longer elsewhere",
};
