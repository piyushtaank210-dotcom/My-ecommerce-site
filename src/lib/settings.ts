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

/* -------------------------------------------------------------------------
 * The shop's return policy.
 *
 * These are the switches the back office sets. They decide whether the
 * shop takes returns at all, how long the window is, what a customer has
 * to send with a claim, and what the customer is told.
 * ---------------------------------------------------------------------- */

/** Whether the shop takes returns and replacements at all. */
export const RETURNS_ENABLED_SETTING = "returns_enabled";

/** The policy the customer is shown on the request form and the policy page. */
export const RETURN_POLICY_DESCRIPTION_SETTING = "return_policy_description";

/** Whether a claim has to carry a photograph. */
export const RETURN_PHOTO_REQUIRED_SETTING = "return_photo_required";

/** Whether a return has to be collected rather than dropped off. */
export const RETURN_PICKUP_REQUIRED_SETTING = "return_pickup_required";

/** The default for the shop's own return policy. */
export const DEFAULT_RETURN_POLICY_DESCRIPTION =
  "Report a damaged, faulty, incorrect or incomplete product within the return window. We will send a replacement where we can, or refund the price you paid.";

/**
 * Whether the shop takes returns and replacements.
 *
 * With them off, the request form is not offered and the back office
 * cannot take a claim. The existing requests are left alone.
 */
export async function getReturnsEnabled(): Promise<boolean> {
  const value = (await getSetting(RETURNS_ENABLED_SETTING, "true")).trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

/** Turns returns and replacements on or off. */
export async function setReturnsEnabled(enabled: boolean): Promise<void> {
  await setSetting(RETURNS_ENABLED_SETTING, enabled ? "true" : "false");
}

/**
 * The policy the customer is shown.
 *
 * It is the shop's own words, and it is shown on the request form and
 * the published policy page.
 */
export async function getReturnPolicyDescription(): Promise<string> {
  return (
    (await getSetting(
      RETURN_POLICY_DESCRIPTION_SETTING,
      DEFAULT_RETURN_POLICY_DESCRIPTION
    )) || DEFAULT_RETURN_POLICY_DESCRIPTION
  );
}

/** Sets the policy the customer is shown. */
export async function setReturnPolicyDescription(text: string): Promise<void> {
  await setSetting(RETURN_POLICY_DESCRIPTION_SETTING, text.trim());
}

/**
 * Whether a claim has to carry a photograph.
 *
 * With it off, a customer may still send photographs and videos — they
 * are what settles a claim — but a claim is never refused for the want
 * of one.
 */
export async function getReturnPhotoRequired(): Promise<boolean> {
  const value = (await getSetting(RETURN_PHOTO_REQUIRED_SETTING, "true"))
    .trim()
    .toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

/** Turns the photograph requirement on or off. */
export async function setReturnPhotoRequired(required: boolean): Promise<void> {
  await setSetting(RETURN_PHOTO_REQUIRED_SETTING, required ? "true" : "false");
}

/**
 * Whether a return has to be collected.
 *
 * With it on, the back office arranges a pickup for every return. With
 * it off, the customer is asked to send the parcel back themselves.
 */
export async function getReturnPickupRequired(): Promise<boolean> {
  const value = (await getSetting(RETURN_PICKUP_REQUIRED_SETTING, "true"))
    .trim()
    .toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

/** Turns the pickup requirement on or off. */
export async function setReturnPickupRequired(required: boolean): Promise<void> {
  await setSetting(RETURN_PICKUP_REQUIRED_SETTING, required ? "true" : "false");
}

/**
 * The whole of the shop's return policy, in one read.
 */
export async function getReturnPolicy(): Promise<{
  enabled: boolean;
  windowDays: number;
  description: string;
  photoRequired: boolean;
  pickupRequired: boolean;
}> {
  const [enabled, windowDays, description, photoRequired, pickupRequired] =
    await Promise.all([
      getReturnsEnabled(),
      getReturnWindowDays(),
      getReturnPolicyDescription(),
      getReturnPhotoRequired(),
      getReturnPickupRequired(),
    ]);

  return {
    enabled,
    windowDays,
    description,
    photoRequired,
    pickupRequired,
  };
}

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
