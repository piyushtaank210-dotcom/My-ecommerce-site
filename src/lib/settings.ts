import { getDb } from "./db";
import { parseBackorderPolicy, type BackorderPolicy } from "./variations";
import { RETURN_WINDOW_DAYS, RETURN_WINDOW_SETTING } from "./return-policy";

/**
 * The store's own settings.
 *
 * One row per setting, in a table of its own, so a new one is a new key
 * rather than a new column. The backorder policy is the first of them: it
 * decides whether a shopper may buy something the shelf does not have.
 */

/** The key the backorder policy is stored under. */
export const BACKORDER_SETTING = "backorder_policy";

/** The key the return window duration (in days) is stored under. */
export { RETURN_WINDOW_SETTING };

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = (await getDb()
    .prepare("SELECT value FROM store_settings WHERE key = ?")
    .get(key)) as { value?: string } | undefined;
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  (await getDb()
    .prepare(
      `INSERT INTO store_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value));
}

/**
 * The default return window in calendar days from delivery.
 *
 * Seven days, and it is the same seven days for every kind of claim: a
 * damaged or faulty unit, a wrong item, a missing accessory, and a
 * voluntary return on a sealed unit.
 */
export const DEFAULT_RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;

/** Returns the configured return window duration in days (default 7). */
export async function getReturnWindowDays(): Promise<number> {
  const val = (await getSetting(RETURN_WINDOW_SETTING, String(DEFAULT_RETURN_WINDOW_DAYS)));
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETURN_WINDOW_DAYS;
}

/** Sets the configured return window duration in days. */
export async function setReturnWindowDays(days: number): Promise<void> {
  const safe = Math.max(1, Math.min(60, Math.round(days)));
  (await setSetting(RETURN_WINDOW_SETTING, String(safe)));
}

/** Whether the store takes orders for things it does not have. */
export async function getBackorderPolicy(): Promise<BackorderPolicy> {
  return parseBackorderPolicy((await getSetting(BACKORDER_SETTING, "none")));
}

/** Sets the backorder policy. */
export async function setBackorderPolicy(policy: BackorderPolicy): Promise<void> {
  (await setSetting(BACKORDER_SETTING, policy));
}
