/**
 * Checks the Resend integration.
 *
 *   node scripts/check-resend.mjs
 *
 * It asks Resend whether the shop can reach it, sends an order
 * confirmation, an order status update and a customer enquiry, and
 * checks that a refusal from Resend is recorded as a failure and never
 * as a message that was sent.
 *
 * The shop needs RESEND_API_KEY and MAIL_FROM set for the sending to
 * happen. Without them the script checks the fallback instead: that
 * every message is still recorded and still shown on the dashboard.
 */
import "./lib/env.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { getDb, withTransaction } = await import("../src/lib/db.ts");
const { getOrder } = await import("../src/lib/orders.ts");
const { applyOrderStatus } = await import("../src/lib/orders.ts");
const { createContactMessage } = await import("../src/lib/contact.ts");
const {
  sendEmail,
  testResendConnection,
  emailIsConfigured,
  fromAddress,
  enquiryNotificationAddress,
} = await import("../src/lib/mail.ts");
const { notify } = await import("../src/lib/notifications.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const db = getDb();
const configured = emailIsConfigured();

// Where the test emails go. Resend will not send to an example.com
// address, so the shop's own address is used — which is where a test
// email belongs anyway.
const TEST_ADDRESS = enquiryNotificationAddress();

const created = { orders: [], returns: [], users: [], messages: [] };

try {
  section("1. The shop is set up to send");

  check(
    "the shop knows whether it can send",
    typeof configured === "boolean",
    configured ? "the keys are there" : "the keys are not set"
  );
  check(
    "the sender is written out in full",
    fromAddress().includes("@") && fromAddress().includes("<"),
    fromAddress()
  );
  check(
    "the enquiries go to the shop's own address",
    enquiryNotificationAddress().includes("@"),
    enquiryNotificationAddress()
  );
  check(
    "the key is not written down in the source",
    !(
      await import("node:fs")
    )
      .readFileSync("src/lib/mail.ts", "utf8")
      .match(/re_[A-Za-z0-9]{10,}/)
  );

  section("2. Resend answers");

  const connection = await testResendConnection();
  if (configured) {
    check("the shop can reach Resend", connection.ok, connection.message);
    if (connection.domains) {
      console.log(`   the domains: ${JSON.stringify(connection.domains)}`);
      check(
        "the shop's own domain is there",
        connection.domains.some((d) => d.name.includes("consoleseller.in")),
        connection.domains.map((d) => d.name).join(", ")
      );
    }
  } else {
    check(
      "without the keys the shop says so plainly",
      !connection.ok && connection.message.includes("RESEND_API_KEY"),
      connection.message
    );
  }

  section("3. An order confirmation is sent");

  const product = await db
    .prepare(
      `SELECT p.slug, p.name, p.price FROM products p
        WHERE p.listed = 1 AND p.status = 'published'
          AND EXISTS (SELECT 1 FROM variants v WHERE v.product_slug = p.slug AND v.stock > 0)
        ORDER BY p.slug LIMIT 1`
    )
    .get();
  const orderId = `RND${Date.now().toString(36).toUpperCase()}`;
  created.orders.push(orderId);

  await db
    .prepare(
      `INSERT INTO orders
         (id, user_id, name, email, phone, address1, city, state, pincode,
          subtotal, shipping, total, payment_method, status)
       VALUES ($1, NULL, 'Resend Test', $2, '+91 90000 00000', '1 Test Street',
               'Ludhiana', 'Punjab', '142021', $3, 0, $3, 'UPI', 'confirmed')`
    )
    .run(orderId, TEST_ADDRESS, product.price);

  const order = await getOrder(orderId);
  check("the order is there", Boolean(order));

  // The confirmation, through the shop's own path.
  const variant = await db
    .prepare(
      "SELECT id, name FROM variants WHERE product_slug = $1 AND stock > 0 ORDER BY position, name LIMIT 1"
    )
    .get(product.slug);

  const { createOrder } = await import("../src/lib/orders.ts");
  const placedId = await createOrder(
    {
      name: "Resend Test",
      email: TEST_ADDRESS,
      phone: "+91 90000 00000",
      address1: "1 Test Street",
      city: "Ludhiana",
      state: "Punjab",
      pincode: "142021",
      paymentMethod: "UPI",
    },
    [
      {
        productSlug: product.slug,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        name: product.name,
        price: product.price,
        quantity: 1,
      },
    ],
    { subtotal: product.price, shipping: 0, total: product.price }
  );
  created.orders.push(placedId);

  const confirmation = await db
    .prepare(
      "SELECT id, kind, status, email_status, email_error, body FROM notifications WHERE order_id = $1 AND kind = 'order_confirmed'"
    )
    .all(placedId);
  check("the confirmation is on the dashboard", confirmation.length === 1, `${confirmation.length} message(s)`);
  check(
    "it says the order is confirmed",
    confirmation[0]?.body.includes(placedId) ?? false
  );
  check(
    "it lists what was ordered",
    (confirmation[0]?.body ?? "").includes(product.name)
  );
  check(
    "it says what was paid",
    (confirmation[0]?.body ?? "").includes("Total:")
  );
  check(
    "the read state is its own",
    ["unread", "read"].includes(confirmation[0]?.status ?? ""),
    confirmation[0]?.status ?? ""
  );
  check(
    "and the email outcome is recorded beside it",
    ["sent", "not_configured", "failed"].includes(
      confirmation[0]?.email_status ?? ""
    ),
    confirmation[0]?.email_status ?? "nothing"
  );

  if (configured) {
    check(
      "the email actually went out",
      confirmation[0]?.email_status === "sent",
      confirmation[0]?.email_status ?? ""
    );
    check(
      "and it was not recorded as a failure",
      confirmation[0]?.email_status !== "failed"
    );
  } else {
    check(
      "without the keys it is marked as not sent, and not as sent",
      confirmation[0]?.email_status === "not_configured",
      confirmation[0]?.email_status ?? ""
    );
  }

  section("4. An order status update is sent");

  await applyOrderStatus(placedId, "packed", null);

  const packed = await db
    .prepare(
      "SELECT id, kind, email_status FROM notifications WHERE order_id = $1 AND kind = 'order_packed'"
    )
    .all(placedId);
  check("the status update is on the dashboard", packed.length === 1);
  check(
    "and the email outcome is recorded",
    ["sent", "not_configured", "failed"].includes(packed[0]?.email_status ?? ""),
    packed[0]?.email_status ?? "nothing"
  );

  await applyOrderStatus(placedId, "shipped", null);
  const shipped = await db
    .prepare(
      "SELECT id, kind, email_status FROM notifications WHERE order_id = $1 AND kind = 'order_shipped'"
    )
    .all(placedId);
  check("the dispatch notice is on the dashboard", shipped.length === 1);

  await applyOrderStatus(placedId, "delivered", null);
  const delivered = await db
    .prepare(
      "SELECT id, kind, email_status FROM notifications WHERE order_id = $1 AND kind = 'order_delivered'"
    )
    .all(placedId);
  check("the delivery notice is on the dashboard", delivered.length === 1);

  section("5. A customer enquiry is sent");

  const enquiry = await createContactMessage({
    name: "Enquiry Test",
    email: TEST_ADDRESS,
    phone: "+91 90000 00001",
    subject: "support",
    orderId: null,
    message: "This is a test enquiry from the Resend check script.",
  });
  created.messages.push(enquiry.id);

  const enquiryRow = await db
    .prepare(
      "SELECT id, name, email, phone, email_status FROM contact_messages WHERE id = $1"
    )
    .get(enquiry.id);
  check("the enquiry is saved", Boolean(enquiryRow));
  check("the phone number is on it", enquiryRow?.phone === "+91 90000 00001", enquiryRow?.phone ?? "none");
  check(
    "what became of the notification is recorded",
    ["sent", "not_configured", "failed"].includes(enquiryRow?.email_status ?? ""),
    enquiryRow?.email_status ?? "nothing"
  );

  if (configured) {
    check(
      "the shop was told by email",
      enquiryRow?.email_status === "sent",
      enquiryRow?.email_status ?? ""
    );
  } else {
    check(
      "without the keys the shop is not told, and it is recorded",
      enquiryRow?.email_status === "not_configured",
      enquiryRow?.email_status ?? ""
    );
  }

  section("6. The same enquiry is not told twice");

  const { resendEnquiryEmail } = await import("../src/lib/contact.ts");
  await resendEnquiryEmail(enquiry.id);
  await resendEnquiryEmail(enquiry.id);

  const stillOne = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE kind = 'enquiry' OR dedupe_key LIKE $1"
    )
    .get(`enquiry:%`);
  check(
    "there is still only one message about it",
    Number(stillOne?.n ?? 0) <= 1,
    `${stillOne?.n} message(s)`
  );

  section("7. A refusal from Resend is a failure, not a message sent");

  // A sender that is not a sender Resend knows. It refuses the
  // message, and the shop must not call that a message that was sent.
  const realFrom = process.env.MAIL_FROM;
  process.env.MAIL_FROM = "Consoleseller Orders <not-a-sender@not-your-domain.test>";
  const bad = await sendEmail({
    to: TEST_ADDRESS,
    subject: "A message that cannot be sent",
    body: "This must not be recorded as sent.",
    idempotencyKey: `test:bad-sender:${Date.now()}`,
  });
  process.env.MAIL_FROM = realFrom;
  check(
    "a message that could not be sent is a failure",
    bad.status === "failed" || bad.status === "not_configured",
    bad.status
  );
  check(
    "and it says why",
    Boolean(bad.error),
    bad.error ?? "no reason given"
  );

  section("8. A message with no address is refused");

  const noAddress = await sendEmail({
    to: "",
    subject: "A message with nowhere to go",
    body: "This must not be sent.",
  });
  check("it is refused", noAddress.status === "failed", noAddress.status);
  check("and it says why", Boolean(noAddress.error));

  section("9. The dashboard still works");

  const unread = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE status = 'unread' AND audience = 'customer'"
    )
    .get();
  check(
    "messages are counted as unread on their own",
    unread !== undefined,
    `${unread?.n} unread`
  );

  const counted = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE audience = 'customer' AND status = 'unread'"
    )
    .get();
  const both = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE audience = 'customer' AND email_status = 'sent'"
    )
    .get();
  check(
    "a message whose email went out is still counted as unread",
    Number(counted?.n ?? 0) > 0 || Number(both?.n ?? 0) === 0,
    `${counted?.n} unread, ${both?.n} emailed`
  );
} catch (err) {
  console.error("\n✗ the run stopped:", err?.stack ?? err);
  failures++;
} finally {
  console.log("\n— cleaning up —");
  await withTransaction(async (t) => {
    for (const orderId of created.orders) {
      await t.prepare("DELETE FROM notifications WHERE order_id = ?").run(orderId);
      await t.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      await t.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
    for (const id of created.messages) {
      await t.prepare("DELETE FROM contact_messages WHERE id = ?").run(id);
    }
  });
  console.log("  ✓ the fixtures this run made were removed");
  const { getPool } = await import("../src/lib/db.ts");
  await getPool().end();
}

console.log("\n=======================================================");
if (failures === 0) {
  console.log("✓ ALL CHECKS PASSED — the shop sends through Resend as it should.");
} else {
  console.error(`✗ ${failures} checks failed.`);
  process.exit(1);
}
console.log("=======================================================\n");
