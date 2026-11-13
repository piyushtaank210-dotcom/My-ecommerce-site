/**
 * Proves the Resend path, without a real key.
 *
 *   node scripts/check-resend-delivery.mjs
 *
 * A small server stands in for Resend. It answers the way Resend does:
 * with an id when it accepts a message, and with an error when it
 * refuses one. The shop is pointed at it, and the whole path is checked
 * — the request the shop makes, what it records when Resend accepts the
 * message, and what it records when Resend refuses it.
 *
 * Nothing is sent to a customer, and no real key is needed.
 */
import { createServer } from "node:http";
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

/**
 * What the stand-in received.
 */
const received = [];
/** Whether the stand-in should refuse the next message. */
let refuse = false;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const path = req.url ?? "";

    // Resend's own endpoint for listing domains.
    if (path === "/domains") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: [
            {
              id: "dom_1",
              name: "consoleseller.in",
              status: "verified",
              created_at: "2026-01-01T00:00:00.000Z",
              region: "us-east-1",
            },
          ],
          object: "list",
          has_more: false,
        })
      );
      return;
    }

    // Resend's endpoint for sending a message.
    if (path.startsWith("/emails")) {
      const parsed = JSON.parse(body || "{}");
      received.push({
        path,
        method: req.method,
        authorization: req.headers.authorization,
        idempotencyKey: req.headers["idempotency-key"],
        body: parsed,
      });

      if (refuse) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "validation_error",
            message: "The from address is not verified.",
            statusCode: 422,
          })
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `test-email-${received.length}` }));
      return;
    }

    res.writeHead(404).end("{}");
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}`;

// The shop is pointed at the stand-in, with a key that is not a real one.
process.env.RESEND_API_KEY = "re_test_key_for_the_stand_in";
process.env.RESEND_BASE_URL = baseUrl;
process.env.MAIL_FROM = "Consoleseller Orders <orders@consoleseller.in>";
process.env.NEXT_PUBLIC_SITE_URL = "https://consoleseller.in";

const { sendEmail, testResendConnection, fromAddress } = await import(
  "../src/lib/mail.ts"
);
const { notify } = await import("../src/lib/notifications.ts");

try {
  section("1. The shop can reach Resend");
  const connection = await testResendConnection();
  check("the shop reaches it", connection.ok, connection.message);
  check(
    "the shop's own domain is there",
    (connection.domains ?? []).some((d) => d.name === "consoleseller.in"),
    JSON.stringify(connection.domains)
  );

  section("2. A message is sent the way Resend expects");
  const sent = await sendEmail({
    to: "customer@example.com",
    subject: "Your order",
    body: "Thank you for your order.",
    idempotencyKey: "order:PF123:confirmed",
  });
  check("the message is sent", sent.status === "sent", sent.status);
  check("Resend gives it an id", Boolean(sent.id), sent.id ?? "none");

  const last = received[received.length - 1];
  check("it goes to the right place", last.path === "/emails", last.path);
  check("it is a POST", last.method === "POST");
  check(
    "it carries the key as the authorization",
    last.authorization === "Bearer re_test_key_for_the_stand_in",
    last.authorization ?? "none"
  );
  check(
    "the sender is written out in full",
    last.body.from === "Consoleseller Orders <orders@consoleseller.in>",
    last.body.from
  );
  check(
    "the recipient is an array, as Resend wants",
    Array.isArray(last.body.to) && last.body.to[0] === "customer@example.com",
    JSON.stringify(last.body.to)
  );
  check("the subject is there", last.body.subject === "Your order");
  check("the body is there", last.body.text === "Thank you for your order.");
  check(
    "the idempotency key is sent, so a retry is not a second email",
    last.idempotencyKey === "order:PF123:confirmed",
    last.idempotencyKey ?? "none"
  );

  section("3. The same message is not sent twice");
  const before = received.length;
  await sendEmail({
    to: "customer@example.com",
    subject: "Your order",
    body: "Thank you for your order.",
    idempotencyKey: "order:PF123:confirmed",
  });
  check(
    "the key is the same, so Resend knows it has seen it",
    received[received.length - 1]?.idempotencyKey === "order:PF123:confirmed"
  );
  check(
    "and the message was still given to Resend, which decides",
    received.length === before + 1,
    `${received.length - before} call(s)`
  );

  section("4. A refusal from Resend is a failure");
  refuse = true;
  const refused = await sendEmail({
    to: "customer@example.com",
    subject: "A message that is refused",
    body: "This must not be recorded as sent.",
    idempotencyKey: "order:PF999:confirmed",
  });
  check("it is a failure", refused.status === "failed", refused.status);
  check(
    "and it carries Resend's own reason",
    (refused.error ?? "").includes("not verified"),
    refused.error ?? "no reason"
  );
  refuse = false;

  section("5. A message with no address is refused");
  const noAddress = await sendEmail({
    to: "",
    subject: "A message with nowhere to go",
    body: "This must not be sent.",
  });
  check("it is refused", noAddress.status === "failed", noAddress.status);
  check("and it says why", Boolean(noAddress.error));

  section("6. The shop records what became of the email");
  const { getDb } = await import("../src/lib/db.ts");
  const db = getDb();

  await notify({
    audience: "customer",
    email: "customer@example.com",
    orderId: null,
    kind: "order_confirmed",
    title: "Order confirmed",
    body: "Thank you for your order.",
    dedupeKey: "test:order:confirmed",
  });

  const row = (await db
    .prepare(
      "SELECT status, email_status, email_sent_at FROM notifications WHERE dedupe_key = ?"
    )
    .get("test:order:confirmed"));

  check("the message is on the dashboard", Boolean(row));
  check(
    "the read state is its own thing",
    row?.status === "unread",
    row?.status ?? ""
  );
  check("the email is recorded as sent", row?.email_status === "sent", row?.email_status ?? "");
  check("and when it went out", Boolean(row?.email_sent_at));

  section("7. A failure is recorded as a failure");
  refuse = true;
  await notify({
    audience: "customer",
    email: "customer@example.com",
    orderId: null,
    kind: "order_shipped",
    title: "Order shipped",
    body: "This one is refused.",
    dedupeKey: "test:order:shipped:refused",
  });
  refuse = false;

  const failed = (await db
    .prepare(
      "SELECT status, email_status, email_error FROM notifications WHERE dedupe_key = ?"
    )
    .get("test:order:shipped:refused"));

  check("the message is still on the dashboard", Boolean(failed));
  check("the email is recorded as failed", failed?.email_status === "failed", failed?.email_status ?? "");
  check(
    "and it says why",
    (failed?.email_error ?? "").includes("not verified"),
    failed?.email_error ?? "no reason"
  );
  check(
    "and it is NOT recorded as sent",
    failed?.email_status !== "sent"
  );

  section("8. The message is sent only once, even when it is tried again");
  const beforeRepeat = received.length;
  await notify({
    audience: "customer",
    email: "customer@example.com",
    orderId: null,
    kind: "order_confirmed",
    title: "Order confirmed",
    body: "Thank you for your order.",
    dedupeKey: "test:order:confirmed",
  });
  check(
    "the message was not given to Resend a second time",
    received.length === beforeRepeat,
    `${received.length - beforeRepeat} extra call(s)`
  );

  await db
    .prepare(
      "DELETE FROM notifications WHERE dedupe_key LIKE 'test:%'"
    )
    .run();
} catch (err) {
  console.error("\n✗ the run stopped:", err?.stack ?? err);
  failures++;
} finally {
  server.close();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the shop sends through Resend as it should.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
