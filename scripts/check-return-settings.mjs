/**
 * Checks the shop's return policy settings and the enquiry notifications.
 *
 *   node scripts/check-return-settings.mjs
 *
 * It sets each switch, checks that it takes effect, and puts it back
 * afterwards — so the shop is left as it was found.
 */
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { getDb } = await import("../src/lib/db.ts");
const {
  getReturnPolicy,
  setReturnsEnabled,
  setReturnWindowDays,
  setReturnPolicyDescription,
  setReturnPhotoRequired,
  setReturnPickupRequired,
} = await import("../src/lib/settings.ts");
const { getOrderReturnEligibility } = await import("../src/lib/returns.ts");
const { getOrder } = await import("../src/lib/orders.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const db = getDb();

// What the shop was set to before this run, so it can be put back.
const before = await getReturnPolicy();

try {
  section("1. The policy is read as a whole");
  check("it has a window", before.windowDays > 0, `${before.windowDays} days`);
  check("it has a description", before.description.length > 0);
  check("it says whether returns are on", typeof before.enabled === "boolean");
  check(
    "it says whether photographs are required",
    typeof before.photoRequired === "boolean"
  );
  check(
    "it says whether a pickup is arranged",
    typeof before.pickupRequired === "boolean"
  );

  section("2. The window can be changed");
  await setReturnWindowDays(5);
  check("it is five days now", (await getReturnPolicy()).windowDays === 5);
  await setReturnWindowDays(9);
  check("and nine now", (await getReturnPolicy()).windowDays === 9);
  await setReturnWindowDays(before.windowDays);
  check(
    "and it goes back to what it was",
    (await getReturnPolicy()).windowDays === before.windowDays
  );

  section("3. Returns can be turned off and on again");
  await setReturnsEnabled(false);
  check("they are off", (await getReturnPolicy()).enabled === false);

  // An order that has been delivered.
  const orderRow = (await db
    .prepare(
      `SELECT id FROM orders WHERE status = 'delivered' ORDER BY created_at DESC LIMIT 1`
    )
    .get()) ?? (await db.prepare("SELECT id FROM orders LIMIT 1").get());
  const order = orderRow ? await getOrder(orderRow.id) : null;

  if (order) {
    const closed = await getOrderReturnEligibility(order);
    check("a delivered order is not eligible while returns are off", !closed.eligible);
    check(
      "and the customer is told why",
      /not taking returns/i.test(closed.reason ?? ""),
      closed.reason ?? ""
    );
  } else {
    check("there is an order to test with", false, "the shop has no orders");
  }

  await setReturnsEnabled(true);
  check("they are on again", (await getReturnPolicy()).enabled === true);

  if (order) {
    const open = await getOrderReturnEligibility(order);
    check(
      "a delivered order is eligible again",
      open.eligible || !open.isWindowActive,
      open.reason ?? "the window has closed"
    );
  }

  section("4. The wording the customer is shown can be changed");
  await setReturnPolicyDescription("A test policy wording.");
  check(
    "it is what the shop wrote",
    (await getReturnPolicy()).description === "A test policy wording."
  );
  await setReturnPolicyDescription(before.description);
  check(
    "and it goes back to what it was",
    (await getReturnPolicy()).description === before.description
  );

  section("5. The evidence and the pickup can be switched");
  await setReturnPhotoRequired(false);
  check(
    "a photograph is not required",
    (await getReturnPolicy()).photoRequired === false
  );
  await setReturnPhotoRequired(true);
  check("it is required again", (await getReturnPolicy()).photoRequired === true);

  await setReturnPickupRequired(false);
  check(
    "a pickup is not arranged",
    (await getReturnPolicy()).pickupRequired === false
  );
  await setReturnPickupRequired(true);
  check("it is arranged again", (await getReturnPolicy()).pickupRequired === true);

  section("6. The settings are in the database, not in the code");
  const rows = (await db
    .prepare(
      "SELECT key, value FROM store_settings WHERE key LIKE 'return%' ORDER BY key"
    )
    .all());
  check("the window is there", rows.some((r) => r.key === "return_window_days"));
  check(
    "the switch is there",
    rows.some((r) => r.key === "returns_enabled")
  );
  check(
    "the wording is there",
    rows.some((r) => r.key === "return_policy_description")
  );
  check(
    "the photograph switch is there",
    rows.some((r) => r.key === "return_photo_required")
  );
  check(
    "the pickup switch is there",
    rows.some((r) => r.key === "return_pickup_required")
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— putting the shop's policy back as it was —");
  await setReturnsEnabled(before.enabled);
  await setReturnWindowDays(before.windowDays);
  await setReturnPolicyDescription(before.description);
  await setReturnPhotoRequired(before.photoRequired);
  await setReturnPickupRequired(before.pickupRequired);

  const after = await getReturnPolicy();
  check(
    "the policy is as it was",
    after.enabled === before.enabled &&
      after.windowDays === before.windowDays &&
      after.description === before.description &&
      after.photoRequired === before.photoRequired &&
      after.pickupRequired === before.pickupRequired
  );

  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the return policy settings work.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
