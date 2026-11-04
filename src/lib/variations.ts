/**
 * Variations, and the words the shop uses about them.
 *
 * A product's variations are described by its **attributes** — "Colour",
 * "Storage", "Edition", "Compatible models" — and each combination of their
 * values is one **option** that can be bought on its own. A console in
 * Midnight Blue with 2TB of storage is one option, not two.
 *
 * This module holds no data and imports nothing, so a client component is
 * free to use it.
 */

/** What a product varies by: the attribute, and the values it may take. */
export type ProductAttributes = Record<string, string[]>;

/** What one option is: the value of each attribute it has. */
export type VariantAttributes = Record<string, string>;

/** The attributes, in the order they were written down. */
export function attributeNames(attributes: ProductAttributes): string[] {
  return Object.keys(attributes).filter((name) => name.trim());
}

/**
 * The name of an option.
 *
 * An option with values is named after them — "Midnight Blue / 2TB" — so
 * the shopper can tell two of them apart. One with no values keeps the name
 * it was given.
 */
export function variantLabel(
  attributes: VariantAttributes,
  fallback: string
): string {
  const values = Object.entries(attributes)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([, value]) => String(value).trim());
  return values.length ? values.join(" / ") : fallback;
}

/**
 * The key two options of the same product may not share.
 *
 * Two options with the same values are the same thing twice, so the second
 * one is refused. An option with no values is identified by its name.
 */
export function combinationKey(
  attributes: VariantAttributes,
  fallbackName: string
): string {
  const pairs = Object.entries(attributes)
    .filter(([, value]) => String(value ?? "").trim())
    .map(([name, value]) => [name.trim().toLowerCase(), String(value).trim().toLowerCase()] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  if (!pairs.length) return `name:${fallbackName.trim().toLowerCase()}`;
  return pairs.map(([name, value]) => `${name}=${value}`).join("|");
}

/** True when an option has every one of the chosen values. */
export function variantMatches(
  attributes: VariantAttributes,
  chosen: VariantAttributes
): boolean {
  return Object.entries(chosen).every(
    ([name, value]) =>
      String(value ?? "").trim() === "" ||
      String(attributes[name] ?? "").trim().toLowerCase() ===
        String(value).trim().toLowerCase()
  );
}

/**
 * Works out an option's values from its name.
 *
 * The catalogue names an option after the value it is — "White", "1TB
 * Disc" — so an option whose name is one of an attribute's values takes
 * that attribute. A product with more than one attribute needs the values
 * spelled out, and the catalogue says so.
 */
export function inferVariantAttributes(
  attributes: ProductAttributes,
  name: string
): VariantAttributes {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return {};

  const out: VariantAttributes = {};
  for (const [attribute, values] of Object.entries(attributes)) {
    const hit = (values ?? []).find(
      (value) => String(value ?? "").trim().toLowerCase() === wanted
    );
    if (hit) out[attribute] = hit;
  }
  return out;
}

/**
 * Tidies an attribute list.
 *
 * Blank names and blank values are dropped, and a value that is repeated
 * is only kept once — so "Colour: White, White, Blue" becomes
 * "Colour: White, Blue".
 */
export function cleanAttributes(raw: unknown): ProductAttributes {
  const out: ProductAttributes = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = String(name ?? "").trim();
    if (!label) continue;

    const values = Array.isArray(value)
      ? value.map((v) => String(v ?? "").trim()).filter(Boolean)
      : String(value ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

    const unique = values.filter((v, i) => values.indexOf(v) === i);
    if (!unique.length) continue;
    out[label] = unique;
  }
  return out;
}

/* ------------------------------------------------------------- backorders */

/**
 * What the store does when a shopper wants something the shelf does not
 * have.
 *
 * `none` — the option cannot be bought. `allow` — it can, and the missing
 * units are recorded as a backorder for the warehouse to chase.
 */
export const BACKORDER_POLICIES = ["none", "allow"] as const;

export type BackorderPolicy = (typeof BACKORDER_POLICIES)[number];

export const BACKORDER_POLICY_LABEL: Record<BackorderPolicy, string> = {
  none: "No backorders",
  allow: "Backorders allowed",
};

/** Anything unrecognised is treated as no backorders. */
export function parseBackorderPolicy(value: unknown): BackorderPolicy {
  const s = String(value ?? "").trim().toLowerCase();
  return (BACKORDER_POLICIES as readonly string[]).includes(s)
    ? (s as BackorderPolicy)
    : "none";
}

/** True when the store takes orders for things it does not have. */
export function backordersAllowed(policy: unknown): boolean {
  return parseBackorderPolicy(policy) === "allow";
}
