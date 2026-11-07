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
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RETURN_WINDOW_DAYS,
  checkRequestAllowed,
  policyForReason,
  REASON_POLICIES,
} from "../src/lib/return-policy.ts";
import { calculateReturnDeadline } from "../src/lib/returns.ts";
import {
  approveCancellation,
  confirmCancellationRefund,
  createCancellationRequest,
  getCancellationForOrder,
  rejectCancellation,
} from "../src/lib/cancellations.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(ROOT, "data", "store.db"));

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
  check(RETURN_WINDOW_DAYS === 7, "the window is seven calendar days");

  const delivered = new Date("2026-11-10T09:00:00.000Z");
  const deadline = calculateReturnDeadline(delivered.toISOString());
  const day = deadline.deadlineIso.slice(0, 10);
  check(
    day === "2026-11-17",
    "a unit delivered on the 10th must be reported by the 17th",
    day
  );
  check(
    deadline.windowDays === 7,
    "the deadline is calculated on the published window",
    `${deadline.windowDays} days`
  );
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
    video !== undefined && video.required === false,
    "the unboxing video is recommended, not required"
  );
  const photos = damage.evidence.find((e) => e.id === "product_photos");
  check(
    photos !== undefined && photos.required === true,
    "photographs of the damaged product are asked for"
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
  db.prepare(
    `INSERT INTO orders
      (id, user_id, created_at, name, email, phone, address1, city, state, pincode,
       subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES (?, NULL, datetime('now'), 'Policy Check', 'policy@example.com', '9999999999',
       '1 Test Street', 'Ludhiana', 'Punjab', '142021', 49999, 0, 49999, 'UPI', 'confirmed', NULL)`
  ).run(orderId);

  const request = createCancellationRequest({
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

  const stored = getCancellationForOrder(orderId);
  check(stored?.status === "requested", "the request waits for the back office");
  check(
    stored?.dispatch_state === "before_dispatch",
    "the request records where the order was"
  );

  const again = createCancellationRequest({
    orderId,
    userId: null,
    reason: "Asked again",
    dispatchState: "before_dispatch",
  });
  check(!again.ok, "the same order cannot be asked about twice at once");

  const approved = approveCancellation(request.id, staff, { notes: "Cancelled at the customer's request" });
  check(approved.ok, "the back office can approve a cancellation", approved.message);

  const order = db
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(orderId);
  check(order?.status === "cancelled", "the order itself is cancelled");

  const afterApproval = getCancellationForOrder(orderId);
  check(
    afterApproval?.refund_status === "pending",
    "the refund is raised, not claimed as paid"
  );
  check(
    afterApproval?.refund_amount === 49999,
    "the refund is for what was paid",
    String(afterApproval?.refund_amount)
  );

  const confirmed = confirmCancellationRefund(request.id, staff, "UTR-TEST-1");
  check(confirmed.ok, "the refund is confirmed once the provider says so", confirmed.message);
  const afterConfirm = getCancellationForOrder(orderId);
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
  db.prepare(
    `INSERT INTO orders
      (id, user_id, created_at, name, email, phone, address1, city, state, pincode,
       subtotal, shipping, total, payment_method, status, delivered_at)
     VALUES (?, NULL, datetime('now'), 'Policy Check', 'policy@example.com', '9999999999',
       '1 Test Street', 'Ludhiana', 'Punjab', '142021', 49999, 0, 49999, 'UPI', 'shipped', NULL)`
  ).run(secondId);

  const request = createCancellationRequest({
    orderId: secondId,
    userId: null,
    reason: "Changed my mind",
    dispatchState: "after_dispatch",
  });
  check(request.ok, "a shipped order can still be asked about");
  check(
    /subject to the shipping and return process/i.test(request.message ?? ""),
    "the customer is told what a shipped order means",
    request.message
  );

  const noReason = rejectCancellation(request.id, staff, "   ");
  check(!noReason.ok, "a decision has to carry a reason");

  const declined = rejectCancellation(request.id, staff, "It has already left the warehouse.");
  check(declined.ok, "the back office can decline a cancellation");
  const stored = getCancellationForOrder(secondId);
  check(stored?.status === "rejected", "the decision is on the record");
  check(
    stored?.rejection_reason === "It has already left the warehouse.",
    "the customer is told why"
  );

  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(secondId);
  check(
    order?.status === "shipped",
    "a declined cancellation leaves the order alone",
    order?.status
  );

  db.prepare("DELETE FROM orders WHERE id = ?").run(secondId);
}

console.log("\n→ tidying up");
{
  db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  const left = db
    .prepare("SELECT COUNT(*) AS c FROM order_cancellations WHERE order_id LIKE ?")
    .get(`POL-${stamp}%`);
  check(left.c === 0, "the test rows are removed", `${left.c} left`);
}

console.log(
  failures ? `\n✗ ${failures} check(s) failed` : "\n✓ every check passed"
);
if (failures) process.exit(1);
