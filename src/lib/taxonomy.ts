/**
 * The categories the store is likely to need, and what each one asks
 * about.
 *
 * A category carries the list of specification fields its products are
 * described by: a console is asked about its model, its storage, what it
 * connects to and what is in the box; a controller is asked about its
 * colour, what it works with and how long its battery lasts. The back
 * office offers those fields when a product is put in that category, so
 * the same questions are asked of every console and every controller.
 *
 * The list is a suggestion. A category may carry any fields the store
 * wants, and the administrator may add more.
 *
 * This module holds no data and imports nothing, so a client component is
 * free to use it.
 */

/** What a category is called, and what its products are asked about. */
export type SuggestedCategory = {
  slug: string;
  name: string;
  blurb: string;
  icon: string;
  specFields: string[];
};

/**
 * The categories a console shop usually needs.
 *
 * The first two are the ones the store already has; the other two are
 * there for when the business grows into them.
 */
export const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  {
    slug: "consoles",
    name: "Gaming Consoles",
    blurb:
      "Official console hardware — sealed, warranted, and ready to ship the same working day.",
    icon: "console",
    specFields: [
      "Model and edition",
      "Storage capacity",
      "Connectivity",
      "Included accessories",
      "Warranty",
    ],
  },
  {
    slug: "controllers",
    name: "Gaming Controllers",
    blurb:
      "Official controller hardware — sealed, warranted, and ready to ship the same working day.",
    icon: "controller",
    specFields: [
      "Model and colour",
      "Connectivity",
      "Compatibility",
      "Battery information",
      "Special features",
      "Warranty",
    ],
  },
  {
    slug: "accessories",
    name: "Gaming Accessories",
    blurb:
      "The things that go with the hardware — chargers, stands, headsets and the rest.",
    icon: "accessory",
    specFields: [
      "Accessory type",
      "Compatibility",
      "Connectivity",
      "Included items",
      "Warranty",
    ],
  },
  {
    slug: "bundles",
    name: "Gaming Bundles",
    blurb:
      "Consoles and controllers together, boxed and ready — one parcel, one price.",
    icon: "bundle",
    specFields: [],
  },
];

/**
 * Tidies a list of specification fields.
 *
 * Blank names go, and a name that is repeated is only kept once — so
 * "Storage, Storage, " becomes "Storage".
 */
export function cleanSpecFields(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const name = String(value ?? "").trim();
    if (!name) continue;
    if (out.some((f) => f.toLowerCase() === name.toLowerCase())) continue;
    out.push(name);
  }
  return out;
}

/**
 * The specifications of a product, in the order its category asks for them.
 *
 * The fields the category lists come first, in that order, and anything
 * else the administrator added follows. A field the category lists but the
 * product has no value for is left out — it is not a specification until
 * something has been said about it.
 */
export function orderSpecs(
  specs: Record<string, string>,
  specFields: string[]
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const taken = new Set<string>();

  for (const field of specFields) {
    const hit = Object.keys(specs).find(
      (label) => label.toLowerCase() === field.toLowerCase()
    );
    if (!hit) continue;
    const value = String(specs[hit] ?? "").trim();
    if (!value) continue;
    rows.push({ label: hit, value });
    taken.add(hit);
  }

  for (const [label, value] of Object.entries(specs)) {
    if (taken.has(label)) continue;
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    rows.push({ label, value: trimmed });
  }

  return rows;
}
