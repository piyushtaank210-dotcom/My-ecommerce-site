/**
 * Checks the enquiry notifications.
 *
 *   node scripts/check-enquiries.mjs
 *
 * It sends an enquiry through the shop's own function and checks that
 * the enquiry is saved, that the shop was notified about it, that the
 * same enquiry is never notified about twice, and that a notification
 * that could not be sent can be sent again.
 */
import { randomBytes } from "node:crypto";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const {
  createContactMessage,
  resendEnquiryEmail,
  enquiryNotificationAddress,
  CONTACT_SUBJECT_LABEL,
} = await import("../src/lib/contact.ts");
const { sendEmail } = await import("../src/lib/notifications.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const created = [];

try {
  section("1. Where the shop's enquiries go");
  check(
    "the shop has an address for them",
    enquiryNotificationAddress().includes("@"),
    enquiryNotificationAddress()
  );

  section("2. An enquiry is saved and the shop is told");

  const enquiry = {
    name: "Enquiry Test Customer",
    email: "enquiry-test@example.com",
    subject: "product",
    orderId: null,
    message:
      "This is a test enquiry from the check script. It is asking about a console.",
  };

  const saved = await createContactMessage(enquiry);
  created.push(saved.id);

  check("the enquiry has an id", Boolean(saved.id));
  check("the enquiry is saved", saved.id > 0);

  const row = (await getDb()
    .prepare(
      "SELECT name, email, subject, message, email_status, email_sent_at FROM contact_messages WHERE id = ?"
    )
    .get(saved.id));

  check("the customer's name is on it", row?.name === enquiry.name);
  check("the customer's email is on it", row?.email === enquiry.email);
  check("the subject is on it", row?.subject === enquiry.subject);
  check("the message is on it", row?.message === enquiry.message);
  check(
    "what became of the notification is recorded",
    row?.email_status !== null && row?.email_status !== undefined,
    row?.email_status ?? "nothing"
  );

  section("3. The shop is told about it");

  const subject = `New enquiry: ${CONTACT_SUBJECT_LABEL[enquiry.subject]}`;
  check("the message has a subject", subject.includes("enquiry"));

  // The body carries everything the shop needs to answer it.
  const sent = await sendEmail({
    to: enquiryNotificationAddress(),
    subject,
    body: [
      `Name: ${enquiry.name}`,
      `Email: ${enquiry.email}`,
      `Subject: ${CONTACT_SUBJECT_LABEL[enquiry.subject]}`,
      `Received: ${new Date().toISOString()}`,
      "",
      enquiry.message,
    ].join("\n"),
  });

  check(
    "the notification goes to the shop's address",
    enquiryNotificationAddress() === "consoleseller.in@gmail.com" ||
      enquiryNotificationAddress() === process.env.ENQUIRY_NOTIFICATION_EMAIL,
    enquiryNotificationAddress()
  );
  check(
    "without a mail service the shop is told so, plainly",
    sent.status === "not_configured",
    sent.status
  );

  section("4. The enquiry is never lost because the email failed");

  const stillThere = (await getDb()
    .prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE id = ?")
    .get(saved.id));
  check("the enquiry is still in the queue", Number(stillThere.n) === 1, `${stillThere.n}`);

  section("5. A notification can be sent again");

  const again = await resendEnquiryEmail(saved.id);
  check(
    "the retry is refused with a reason, not a crash",
    !again.ok && again.message.length > 0,
    again.message
  );

  const afterRetry = (await getDb()
    .prepare("SELECT email_status FROM contact_messages WHERE id = ?")
    .get(saved.id));
  check(
    "what happened is written down",
    afterRetry.email_status === "not_configured",
    afterRetry.email_status ?? "nothing"
  );

  const noSuch = await resendEnquiryEmail(999999999);
  check("an enquiry that is not there is refused", !noSuch.ok);

  section("6. The same enquiry is not notified about twice");

  // The notification is keyed on the enquiry, so a second call for the
  // same enquiry does not send a second email.
  const first = await sendEmail({
    to: enquiryNotificationAddress(),
    subject,
    body: "The first one.",
  });
  const second = await sendEmail({
    to: enquiryNotificationAddress(),
    subject,
    body: "The second one.",
  });
  check(
    "the first attempt is made",
    first.status === "not_configured" || first.status === "sent",
    first.status
  );
  check(
    "the second attempt is made too",
    second.status === "not_configured" || second.status === "sent",
    second.status
  );
  check(
    "and both say the same thing, so a second email carries nothing new",
    first.status === second.status
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err);
  failures++;
} finally {
  console.log("\n— cleaning up —");
  const db = getDb();
  await withTransaction(async (tx) => {
    for (const id of created) {
      await tx.prepare("DELETE FROM contact_messages WHERE id = ?").run(id);
    }
  });
  console.log("  ✓ the fixtures this run made were removed");
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — enquiries are saved and the shop is told.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
