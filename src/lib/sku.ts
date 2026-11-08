/**
 * SKU helpers.
 *
 * A SKU is a short, human-typable code for a product — the thing a warehouse
 * scans and a support agent reads out. It is generated from the product's
 * slug so it never has to be asked for, and it stays editable afterwards so
 * it can be replaced with whatever the business actually uses.
 *
 * This module deliberately imports nothing. It is used by the migration, the
 * seed script and the admin panel, and a client component must never reach
 * the database.
 */

/**
 * Normalise any string into the SKU format: uppercase, dashes between
 * words, nothing else. `playstation 5 slim/1TB` becomes
 * `PLAYSTATION-5-SLIM-1TB`.
 */
export function normalizeSku(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The SKU a product gets when nobody has chosen one for it. Slugs are
 * already unique, so this is unique too — until somebody edits one by hand.
 */
export function skuFromSlug(slug: string): string {
  return normalizeSku(slug);
}

/**
 * A SKU nobody is using yet. When two products would land on the same code,
 * the second gets `-2`, then `-3`, rather than the write being rejected.
 *
 * `isTaken` is a callback so this works the same in the migration (which
 * checks the database) and in an admin action (which checks the database
 * before saving). The callback may wait for the answer — the database is
 * on the other side of a network — so this waits too.
 */
export async function uniqueSku(
  base: string,
  isTaken: (sku: string) => boolean | Promise<boolean>
): Promise<string> {
  const root = normalizeSku(base) || "PRODUCT";
  if (!(await isTaken(root))) return root;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Practically unreachable; the suffix keeps it unique regardless.
  return `${root}-${Date.now()}`;
}
