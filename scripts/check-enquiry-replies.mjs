/**
 * Checks the shop's replies to its enquiries.
 *
 *   node scripts/check-enquiry-replies.mjs
 *
 * It answers an enquiry, and checks that the reply is recorded, that it
 * reached the customer, that a reply that could not be sent is never
 * recorded as one that went out, that the same reply is not sent twice,
 * that only the staff who work the queue may send one, and that the
 * conversation is on the Enquiries page afterwards.
 *
 * The dev server must be running on port 3000 for the parts that talk
 * to it.
 */
import { randomBytes } from "node:crypto";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { shopDb, tokenForRole, deleteToken } = await import("./lib/session.mjs");
const { createContactMessage } = await import("../src/lib/contact.ts");
const {
  sendEnquiryReply,
  listReplies,
} = await import("../src/lib/enquiry-replies.ts");
const {
  emailIsConfigured,
  enquiryNotificationAddress,
} = await import("../src/lib/mail.ts");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const pool = shopDb();
const stamp = Date.now().toString(36);
const configured = emailIsConfigured();

// Where the reply goes. Resend will not send to an example.com
// address, so the shop's own address is used — which is where a test
// reply belongs anyway.
const TEST_ADDRESS = enquiryNotificationAddress();
const REPLY_TEXT = `Reply from the check script ${stamp}.`;

const created = { messages: [], users: [] };
let adminToken = "";
let supportToken = "";
let memberToken = "";

try {
  section("1. The shop is set up to answer");

  check(
    "the shop knows whether it can send",
    typeof configured === "boolean",
    configured ? "the keys are there" : "the keys are not set"
  );
  check(
    "there is an address for the replies to go to",
    TEST_ADDRESS.includes("@"),
    TEST_ADDRESS
  );

  section("2. An enquiry to answer");

  const enquiry = await createContactMessage({
    name: "Enquiry Reply Customer",
    email: TEST_ADDRESS,
    phone: "+91 90000 00002",
    subject: "product",
    orderId: null,
    message: `This is a test enquiry from the reply check script ${stamp}.`,
  });
  created.messages.push(enquiry.id);
  check("the enquiry is saved", enquiry.id > 0, `#${enquiry.id}`);

  section("3. A reply that cannot be sent is not recorded as one that went out");

  // A sender that is not a sender the mail service knows. It refuses
  // the message, and the shop must not call that a reply that was sent.
  const realFrom = process.env.MAIL_FROM;
  process.env.MAIL_FROM =
    "ConsoleSeller Orders <not-a-sender@not-your-domain.test>";
  const failed = await sendEnquiryReply({
    messageId: enquiry.id,
    body: "This reply must not be recorded as sent.",
    replyKey: `check-failed-${stamp}`,
    sentByName: "Reply Check",
  });
  process.env.MAIL_FROM = realFrom;

  check("the reply did not go out", !failed.ok, failed.status);
  check("and it says why", Boolean(failed.message), failed.message);

  const failedReplies = await listReplies(enquiry.id);
  const failedRow = failedReplies.find(
    (r) => r.reply_key === `check-failed-${stamp}`
  );
  check("the attempt is on record", Boolean(failedRow));
  check(
    "and it is recorded as one that did not go out",
    failedRow?.status === "failed",
    failedRow?.status ?? "nothing"
  );
  check(
    "with the reason against it",
    Boolean(failedRow?.error),
    failedRow?.error ?? "no reason given"
  );
  check(
    "and it was never marked as sent",
    failedRow?.sent_at === null
  );

  const afterFailure = (
    await pool.query(
      "SELECT status FROM contact_messages WHERE id = $1",
      [enquiry.id]
    )
  ).rows[0];
  check(
    "the enquiry was not marked as answered",
    afterFailure?.status !== "answered",
    afterFailure?.status ?? "nothing"
  );

  section("4. A reply that goes out is recorded, and the enquiry is answered");

  const sent = await sendEnquiryReply({
    messageId: enquiry.id,
    body: REPLY_TEXT,
    replyKey: `check-sent-${stamp}`,
    sentByName: "Reply Check",
  });

  if (configured) {
    check("the reply went out", sent.ok, sent.status);
  } else {
    check(
      "without the keys it says the shop has nowhere to send from",
      !sent.ok && sent.message.length > 0,
      sent.message
    );
  }

  const sentReplies = await listReplies(enquiry.id);
  const sentRow = sentReplies.find((r) => r.reply_key === `check-sent-${stamp}`);
  check("the reply is on record", Boolean(sentRow));
  check("what the shop wrote is on it", sentRow?.body === REPLY_TEXT);
  check(
    "where it went is on it",
    sentRow?.to_email === TEST_ADDRESS,
    sentRow?.to_email ?? "nothing"
  );
  check(
    "and who wrote it",
    sentRow?.sent_by_name === "Reply Check",
    sentRow?.sent_by_name ?? "nothing"
  );

  if (configured) {
    check("it is recorded as sent", sentRow?.status === "sent", sentRow?.status ?? "nothing");
    check("and it says when it went", Boolean(sentRow?.sent_at), sentRow?.sent_at ?? "nothing");

    const afterSuccess = (
      await pool.query(
        "SELECT status FROM contact_messages WHERE id = $1",
        [enquiry.id]
      )
    ).rows[0];
    check(
      "the enquiry is marked as answered",
      afterSuccess?.status === "answered",
      afterSuccess?.status ?? "nothing"
    );
  } else {
    check(
      "and it is recorded as one that did not go out",
      sentRow?.status === "failed",
      sentRow?.status ?? "nothing"
    );
  }

  section("5. The same reply is not sent twice");

  const again = await sendEnquiryReply({
    messageId: enquiry.id,
    body: REPLY_TEXT,
    replyKey: `check-sent-${stamp}`,
    sentByName: "Reply Check",
  });
  check("the second attempt is the same reply", again.status === "duplicate", again.status);

  const afterDuplicate = await listReplies(enquiry.id);
  check(
    "and there is still only one of it",
    afterDuplicate.filter((r) => r.reply_key === `check-sent-${stamp}`).length === 1,
    `${afterDuplicate.filter((r) => r.reply_key === `check-sent-${stamp}`).length} row(s)`
  );

  section("6. An empty reply is refused");

  const empty = await sendEnquiryReply({
    messageId: enquiry.id,
    body: "   ",
    replyKey: `check-empty-${stamp}`,
    sentByName: "Reply Check",
  });
  check("it is refused", !empty.ok, empty.message);
  check(
    "and nothing was written",
    (await listReplies(enquiry.id)).filter(
      (r) => r.reply_key === `check-empty-${stamp}`
    ).length === 0
  );

  section("7. Only the staff who work the queue may send a reply");

  // A customer, who is signed in but does not work the queue.
  const { rows: members } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Reply Check Customer', $1, 'x', 'member')
     RETURNING id`,
    [`enquiry-reply-customer-${stamp}@example.com`]
  );
  created.users.push(members[0].id);

  async function sessionFor(userId) {
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [token, userId, new Date(Date.now() + 3600_000).toISOString()]
    );
    return token;
  }

  memberToken = await sessionFor(members[0].id);
  adminToken = await tokenForRole("admin");
  supportToken = await tokenForRole("support");

  const body = JSON.stringify({
    body: `Reply over the wire ${stamp}.`,
    replyKey: `check-http-${stamp}`,
  });

  const nobody = await fetch(`${BASE}/api/admin/messages/${enquiry.id}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  check(
    "a stranger is turned away",
    nobody.status === 401 || nobody.status === 403,
    `status ${nobody.status}`
  );

  const member = await fetch(`${BASE}/api/admin/messages/${enquiry.id}/reply`, {
    method: "POST",
    headers: { cookie: `pf_auth=${memberToken}`, "content-type": "application/json" },
    body,
  });
  check(
    "a customer is turned away",
    member.status === 401 || member.status === 403,
    `status ${member.status}`
  );

  const support = await fetch(`${BASE}/api/admin/messages/${enquiry.id}/reply`, {
    method: "POST",
    headers: { cookie: `pf_auth=${supportToken}`, "content-type": "application/json" },
    body,
  });
  check(
    "support may send one",
    support.status === 200,
    `status ${support.status}`
  );

  const supportData = await support.json().catch(() => null);
  check(
    "and the shop is told what happened",
    Boolean(supportData?.message),
    supportData?.message ?? "nothing said"
  );

  const httpReplies = await listReplies(enquiry.id);
  check(
    "the reply is on record",
    httpReplies.some((r) => r.reply_key === `check-http-${stamp}`)
  );

  const noSuch = await fetch(`${BASE}/api/admin/messages/999999999/reply`, {
    method: "POST",
    headers: { cookie: `pf_auth=${adminToken}`, "content-type": "application/json" },
    body,
  });
  check(
    "an enquiry that is not there is refused",
    noSuch.status === 404 || noSuch.status === 400,
    `status ${noSuch.status}`
  );

  section("8. The conversation is on the Enquiries page");

  const page = await fetch(`${BASE}/admin/messages`, {
    headers: { cookie: `pf_auth=${adminToken}` },
  });
  const html = await page.text();
  check("the page is there", page.status === 200, `status ${page.status}`);
  check(
    "the reply is on it",
    html.includes("Reply over the wire"),
    "the reply the support sent"
  );
  check(
    "and the enquiry is marked as replied",
    html.includes("Replied"),
    "the badge"
  );
  check(
    "and the reply button is there",
    html.includes(">Reply<") || html.includes("Reply</"),
    "the button"
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err?.stack ?? err);
  failures++;
} finally {
  console.log("\n— cleaning up —");
  for (const id of created.messages) {
    await pool.query("DELETE FROM contact_messages WHERE id = $1", [id]);
  }
  for (const id of created.users) {
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
  }
  for (const token of [adminToken, supportToken, memberToken]) {
    if (token) await deleteToken(token);
  }
  console.log("  ✓ the fixtures this run made were removed");
  await pool.end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the shop answers its enquiries by email.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
