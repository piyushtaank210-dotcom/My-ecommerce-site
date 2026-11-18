/**
 * The tags a product is found by.
 *
 * A tag is a short word: "gift", "new", "under-50000". They are not a
 * second title and not a place for a sentence — the shop uses them to narrow
 * a search down, so the shorter and plainer they are the better they work.
 *
 * The rules live here so that every place that reads or writes them agrees:
 * the catalogue, the back office form, the CSV import and the shop's own
 * search. A tag is trimmed, folded to a single space, cut to a sensible
 * length and kept only once, however many times it was typed.
 */

/** How many tags a product may carry. */
export const MAX_TAGS = 20;

/** How long a single tag may be. */
export const MAX_TAG_LENGTH = 40;

/** How many tags are offered as suggestions in the back office. */
export const TAG_SUGGESTIONS = [
  "new",
  "gift",
  "in-stock",
  "pre-order",
  "limited",
  "exclusive",
  "open-box",
  "refurbished",
  "accessory",
  "under-25000",
  "under-50000",
  "under-100000",
];

/**
 * Puts one tag into the shape the shop keeps.
 *
 * It is trimmed, its inner spaces are folded to one, and it is cut to the
 * longest a tag may be. A tag with nothing left in it is not a tag.
 */
export function normaliseTag(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH);
}

/**
 * The list of tags, tidy.
 *
 * The same tag written two ways — "Gift" and "gift" — is one tag, and it
 * keeps the spelling it was first given.
 */
export function normaliseTags(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normaliseTag(value);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * The tags as they are read out of a row.
 *
 * A row may hold them as JSON, and a row written before the column existed
 * holds nothing at all. Anything that is not a list of words is read as no
 * tags rather than as rubbish.
 */
export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return normaliseTags(raw.map(String));
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A column that was filled in by hand may hold plain words rather than
    // JSON. They are still tags, so they are read as a comma-separated list.
    return normaliseTags(raw.split(","));
  }
  if (Array.isArray(parsed)) return normaliseTags(parsed.map(String));
  if (typeof parsed === "string") return normaliseTags(parsed.split(","));
  return [];
}

/** The tags as they are written into a row. */
export function tagsToJson(values: readonly string[]): string {
  return JSON.stringify(normaliseTags(values));
}
