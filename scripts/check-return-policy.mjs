/**
 * Checks the shop's return, refund and replacement rules.
 *
 * These are the rules the customer form, the back office and the
 * published policy all work to, so this checks the rules themselves and
 * the workflows that hang off them: what a customer may ask for, what
 * the back office may do about it, and what happens to the money.
 *
 *   node scripts/check-return-policy.mjs
 *
 * The test order it creates is removed again at the end.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTsResolver } from "./lib/ts-loader.mjs";
import "./lib/env.mjs";

// The app's modules import each other without their extensions, which
// plain Node cannot resolve. The hook adds them back.
registerTsResolver();

const { getDb } = await import("../src/lib/db.ts");
const { applyMigrations } = await import("../src/lib/migrations.ts");
const {
  RETURN_WINDOW_DAYS,
  checkRequestAllowed,
  mandatoryEvidenceFor,
  policyForReason,
  REASON_POLICIES,
} = await import("../src/lib/return-policy.ts");
const { calculateReturnDeadline } = await import("../src/lib/returns.ts");
const {
  approveCancellation,
  confirmCancellationRefund,
  createCancellationRequest,
  getCancellationForOrder,
  rejectCancellation,
} = await import("../src/lib/cancellations.ts");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The shop's own database handle. The shop runs on PostgreSQL, and this
// is the same handle the app uses — the placeholders and the clock are
// handled the same way.
const db = getDb();
await applyMigrations(db);

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const staff = { id: 1, name: "Policy check" };
const stamp = Date.now().toString().slice(-8);
const orderId = `POL-${stamp}`;

console.log("\n→ the window");
{
  check(RETURN_WINDOW_DAYS === 5, "the window is five calendar days");

  /**
   * The end of the day, in IST, that is `days` days after the day the
   * parcel arrived — worked out here the same way the shop works it out,
   * so the two can be compared exactly.
   */
  const expectedDeadline = (deliveredIso, days) => {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const ist = new Date(new Date(deliveredIso).getTime() + istOffsetMs);
    return (
      Date.UTC(
        ist.getUTCFullYear(),
        ist.getUTCMonth(),
        ist.getUTCDate() + days,
        23,
        59,
        59,
        999
      ) - istOffsetMs
    );
  };

  const delivered = new Date("2026-11-10T09:00:00.000Z");
  const deadline = await calculateReturnDeadline(delivered.toISOString());
  const day = deadline.deadlineIso.slice(0, 10);
  check(
    day === "2026-11-15",
    "a unit delivered on the 10th must be reported by the 15th",
    day
  );
  check(
    deadline.deadlineIso === new Date(expectedDeadline(delivered.toISOString(), 5)).toISOString(),
    "the deadline is the end of the day five days after delivery",
    deadline.deadlineIso
  );
  check(
    deadline.windowDays === 5,
    "the deadline is calculated on the published window",
    `${deadline.windowDays} days`
  );

  // The days are counted in IST, so the deadline does not move with the
  // clock of the machine the test runs on.
  const lateEvening = await calculateReturnDeadline(
    new Date("2026-11-10T18:30:00.000Z").toISOString()
  );
  check(
    lateEvening.deadlineIso === new Date(expectedDeadline("2026-11-10T18:30:00.000Z", 5)).toISOString(),
    "a parcel delivered late in the day still has the whole window",
    lateEvening.deadlineIso
  );

  // A parcel that arrived today has the whole window in front of it.
  const today = await calculateReturnDeadline(new Date().toISOString());
  check(
    !today.isExpired && today.daysRemaining === 5,
    "a unit delivered today has the whole window in front of it",
    `${today.daysRemaining} days`
  );

  // A parcel that arrived four days ago is still inside the window.
  const fourDaysAgo = await calculateReturnDeadline(
    new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  );
  check(!fourDaysAgo.isExpired, "a unit delivered four days ago is still inside the window");

  // A parcel that arrived five days ago is judged on the exact deadline:
  // the end of that fifth day. Nothing else.
  const fiveDaysAgoAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = await calculateReturnDeadline(fiveDaysAgoAt.toISOString());
  const deadlineInstant = expectedDeadline(fiveDaysAgoAt.toISOString(), 5);
  check(
    fiveDaysAgo.deadlineIso === new Date(deadlineInstant).toISOString(),
    "a unit delivered five days ago is judged on the end of that fifth day",
    fiveDaysAgo.deadlineIso
  );
  check(
    fiveDaysAgo.isExpired === Date.now() > deadlineInstant,
    "and it is inside the window only until that moment",
    fiveDaysAgo.isExpired ? "closed" : "open"
  );

  // Six days after delivery the window is shut.
  const sixDaysAgo = await calculateReturnDeadline(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  );
  check(sixDaysAgo.isExpired, "a unit delivered six days ago is outside the window");
  check(sixDaysAgo.daysRemaining === 0, "a closed window reads no days left");

  // A delivery with no date on it cannot be shown to be inside a window.
  const undated = await calculateReturnDeadline(null);
  check(undated.isExpired, "an order with no delivery date has no window");
}

console.log("\n→ what each reason allows");
{
  const damage = policyForReason("product_damaged");
  check(damage.kind === "damage", "a damaged unit is a damage claim");
  check(
    damage.preferredRemedy === "replacement",
    "a replacement is the first remedy for a damaged unit"
  );
  check(damage.allowReplacement, "a replacement may be given for a damaged unit");
  check(damage.allowRefund, "a refund is still possible if no replacement can be given");
  check(!damage.requiresSealed, "a damaged unit does not have to be sealed");

  const video = damage.evidence.find((e) => e.id === "unboxing_video");
  check(
    video !== undefined && video.required === true && video.mandatory === true,
    "the unboxing video is required for a unit that arrived damaged"
  );
  const photos = damage.evidence.find((e) => e.id === "product_photos");
  check(
    photos !== undefined && photos.required === true,
    "photographs of the damaged product are asked for"
  );

  // A unit that does not work is shown by the fault, not by the unboxing.
  const notWorking = policyForReason("product_not_working");
  const fault = notWorking.evidence.find((e) => e.id === "issue_video");
  check(
    fault !== undefined && fault.required === true && fault.mandatory === true,
    "a video of the fault is required for a unit that does not work"
  );
  const defect = policyForReason("defective_product");
  const defectFault = defect.evidence.find((e) => e.id === "issue_video");
  check(
    defectFault !== undefined && defectFault.mandatory === true,
    "a video of the fault is required for a defective unit"
  );
  const defectUnboxing = defect.evidence.find((e) => e.id === "unboxing_video");
  check(
    defectUnboxing !== undefined && defectUnboxing.mandatory !== true,
    "the unboxing video is only asked for on a unit that arrived intact"
  );

  // The evidence a claim cannot go ahead without.
  const nothingOnFile = {
    photographs: 0,
    videos: 0,
    description: false,
    serialNumber: false,
    missingList: false,
  };
  check(
    mandatoryEvidenceFor(damage, nothingOnFile).length > 0,
    "a damaged claim is blocked without its photographs and its video"
  );
  check(
    mandatoryEvidenceFor(policyForReason("other"), nothingOnFile).length === 0,
    "a claim the shop looks at by hand is not blocked by evidence"
  );
  check(
    mandatoryEvidenceFor(damage, {
      ...nothingOnFile,
      photographs: 2,
      videos: 1,
    }).length === 0,
    "a damaged claim with photographs and a video is not blocked"
  );

  const change = policyForReason("change_of_mind");
  check(change.kind === "change_of_mind", "a change of mind is its own claim");
  check(change.requiresSealed, "a voluntary return has to be on a sealed unit");
  check(!change.allowReplacement, "a replacement is not offered on a voluntary return");
  const sealedVideo = change.evidence.find((e) => e.id === "sealed_video");
  check(
    sealedVideo !== undefined && sealedVideo.required === true,
    "the continuous video of the sealed unit is asked for"
  );

  const missing = policyForReason("missing_parts");
  check(
    missing.preferredRemedy === "accessories",
    "missing parts are sent, not refunded"
  );
  check(!missing.allowRefund, "missing parts are not a refund claim");
  const list = missing.evidence.find((e) => e.id === "missing_list");
  check(
    list !== undefined && list.required === true,
    "the list of what is missing is asked for"
  );

  check(
    REASON_POLICIES.length >= 7,
    "every reason the shop offers has a rule behind it",
    `${REASON_POLICIES.length} reasons`
  );
}

console.log("\n→ what a customer may ask for");
{
  const damage = checkRequestAllowed({
    reason: "product_damaged",
    type: "replacement",
    sealedConfirmed: false,
  });
  check(damage.ok, "a replacement may be asked for on a damaged unit");

  const changeAsReplacement = checkRequestAllowed({
    reason: "change_of_mind",
    type: "replacement",
    sealedConfirmed: true,
  });
  check(
    !changeAsReplacement.ok,
    "a replacement may not be asked for on a voluntary return",
    changeAsReplacement.message?.slice(0, 60)
  );

  const changeUnsealed = checkRequestAllowed({
    reason: "change_of_mind",
    type: "return",
    sealedConfirmed: false,
  });
  check(
    !changeUnsealed.ok,
    "a voluntary return on a unit that is not sealed is refused",
    changeUnsealed.message?.slice(0, 60)
  );
  check(
    /sealed/i.test(changeUnsealed.message ?? ""),
    "the customer is told what the sealed rule is"
  );

  const changeSealed = checkRequestAllowed({
    reason: "change_of_mind",
    type: "return",
    sealedConfirmed: true,
  });
  check(changeSealed.ok, "a voluntary return on a sealed unit is allowed");

  const accessories = checkRequestAllowed({
    reason: "missing_parts",
    type: "accessories",
    sealedConfirmed: false,
  });
  check(accessories.ok, "missing parts may be asked for as a parts dispatch");

  const wrongRoute = checkRequestAllowed({
    reason: "missing_parts",
    type: "return",
    sealedConfirmed: false,
  });
  check(
    !wrongRoute.ok,
    "missing parts may not be asked for as a refund",
    wrongRoute.message?.slice(0, 60)
  );

  const unknown = checkRequestAllowed({
    reason: "something-nobody-thought-of",
    type: "return",
    sealedConfirmed: false,
  });
  check(unknown.ok, "a reason the shop has not thought of is not refused outright");
}

console.log("\n→ cancelling an order");
{
  await db.prepare(
    `INSERT INTO orders
      (id, user_id, created_at, name, email, phone, address1, city, state, pincode,
       subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES (?, NULL, datetime('now'), 'Policy Check', 'policy@example.com', '9999999999',
       '1 Test Street', 'Ludhiana', 'Punjab', '142021', 49999, 0, 49999, 'UPI', 'confirmed', NULL)`
  ).run(orderId);

  const request = await createCancellationRequest({
    orderId,
    userId: null,
    reason: "Ordered by mistake",
    dispatchState: "before_dispatch",
  });
  check(request.ok, "a customer may ask for an order to be cancelled", request.message);
  check(
    Boolean(request.id && request.id.startsWith("CAN-")),
    "the request is given a reference",
    request.id
  );

  const stored = await getCancellationForOrder(orderId);
  check(stored?.status === "requested", "the request waits for the back office");
  check(
    stored?.dispatch_state === "before_dispatch",
    "the request records where the order was"
  );

  const again = await createCancellationRequest({
    orderId,
    userId: null,
    reason: "Asked again",
    dispatchState: "before_dispatch",
  });
  check(!again.ok, "the same order cannot be asked about twice at once");

  const approved = await approveCancellation(request.id, staff, { notes: "Cancelled at the customer's request" });
  check(approved.ok, "the back office can approve a cancellation", approved.message);

  const order = await db
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(orderId);
  check(order?.status === "cancelled", "the order itself is cancelled");

  const afterApproval = await getCancellationForOrder(orderId);
  check(
    afterApproval?.refund_status === "pending",
    "the refund is raised, not claimed as paid"
  );
  check(
    afterApproval?.refund_amount === 49999,
    "the refund is for what was paid",
    String(afterApproval?.refund_amount)
  );

  const confirmed = await confirmCancellationRefund(request.id, staff, "UTR-TEST-1");
  check(confirmed.ok, "the refund is confirmed once the provider says so", confirmed.message);
  const afterConfirm = await getCancellationForOrder(orderId);
  check(
    afterConfirm?.refund_status === "processed",
    "the refund is a fact once it is confirmed"
  );
  check(
    afterConfirm?.refund_reference === "UTR-TEST-1",
    "the payment reference is kept"
  );
}

console.log("\n→ declining a cancellation");
{
  const secondId = `POL-${stamp}-B`;
  await db.prepare(
    `INSERT INTO orders
      (id, user_id, created_at, name, email, phone, address1, city, state, pincode,
       subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES (?, NULL, datetime('now'), 'Policy Check', 'policy@example.com', '9999999999',
       '1 Test Street', 'Ludhiana', 'Punjab', '142021', 49999, 0, 49999, 'UPI', 'shipped', NULL)`
  ).run(secondId);

  const request = await createCancellationRequest({
    orderId: secondId,
    userId: null,
    reason: "Changed my mind",
    dispatchState: "after_dispatch",
  });
  check(request.ok, "a shipped order can still be asked about");
  check(
    /already shipped|shipping and return process/i.test(request.message ?? ""),
    "the customer is told what a shipped order means",
    request.message
  );

  const noReason = await rejectCancellation(request.id, staff, "   ");
  check(!noReason.ok, "a decision has to carry a reason");

  const declined = await rejectCancellation(request.id, staff, "It has already left the warehouse.");
  check(declined.ok, "the back office can decline a cancellation");
  const stored = await getCancellationForOrder(secondId);
  check(stored?.status === "rejected", "the decision is on the record");
  check(
    stored?.rejection_reason === "It has already left the warehouse.",
    "the customer is told why"
  );

  const order = await db.prepare("SELECT status FROM orders WHERE id = ?").get(secondId);
  check(
    order?.status === "shipped",
    "a declined cancellation leaves the order alone",
    order?.status
  );

  await db.prepare("DELETE FROM orders WHERE id = ?").run(secondId);
}

console.log("\n→ tidying up");
{
  await db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  const left = await db
    .prepare("SELECT COUNT(*) AS c FROM order_cancellations WHERE order_id LIKE ?")
    .get(`POL-${stamp}%`);
  check(Number(left?.c) === 0, "the test rows are removed", `${left?.c} left`);
}

console.log(
  failures ? `\n✗ ${failures} check(s) failed` : "\n✓ every check passed"
);
if (failures) process.exit(1);
