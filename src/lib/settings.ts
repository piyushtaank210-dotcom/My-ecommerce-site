import { getDb } from "./db";
import { parseBackorderPolicy, type BackorderPolicy } from "./variations";

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
export const RETURN_WINDOW_SETTING = "return_window_days";

export function getSetting(key: string, fallback = ""): string {
  const row = getDb()
    .prepare("SELECT value FROM store_settings WHERE key = ?")
    .get(key) as { value?: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO store_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

/** The default return window in calendar days from delivery. */
export const DEFAULT_RETURN_WINDOW_DAYS = 5;

/** Returns the configured return window duration in days (default 5). */
export function getReturnWindowDays(): number {
  const val = getSetting(RETURN_WINDOW_SETTING, String(DEFAULT_RETURN_WINDOW_DAYS));
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETURN_WINDOW_DAYS;
}

/** Sets the configured return window duration in days. */
export function setReturnWindowDays(days: number): void {
  const safe = Math.max(1, Math.min(60, Math.round(days)));
  setSetting(RETURN_WINDOW_SETTING, String(safe));
}

/** Whether the store takes orders for things it does not have. */
export function getBackorderPolicy(): BackorderPolicy {
  return parseBackorderPolicy(getSetting(BACKORDER_SETTING, "none"));
}

/** Sets the backorder policy. */
export function setBackorderPolicy(policy: BackorderPolicy): void {
  setSetting(BACKORDER_SETTING, policy);
}
