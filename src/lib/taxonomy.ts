/**
 * The questions a category asks its products.
 *
 * A category carries the list of specification fields its products are
 * described by: a console is asked about its model, its storage, what it
 * connects to and what is in the box; a controller is asked about its
 * colour, what it works with and how long its battery lasts. The back
 * office offers those fields when a product is put in that category, so
 * the same questions are asked of every console and every controller.
 *
 * A category may carry any fields the store wants, and the administrator
 * may add more.
 *
 * This module holds no data and imports nothing, so a client component is
 * free to use it.
 */

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
