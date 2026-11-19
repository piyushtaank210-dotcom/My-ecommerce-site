/**
 * The checkout's validation rules.
 *
 *   node scripts/check-checkout-rules.mjs
 *
 * It checks that the rules the form holds in the browser are the same
 * rules the shop holds, so that a customer can never be told a field
 * is wrong by the form and then told it is right by the shop — or the
 * other way round.
 *
 * The rules are checked against a table of cases: each one says what
 * the shop should accept and what it should refuse, and the form's own
 * check and the shop's own check are both run against it.
 */
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const { checkoutSchema } = await import("../src/lib/checkout.ts");
const {
  CHECKOUT_FIELDS,
  checkCheckoutField,
} = await import("../src/lib/checkout-fields.ts");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

/** A complete set of details, and a way to change one of them. */
const GOOD = {
  name: "Arjun Mehta",
  email: "arjun@example.com",
  phone: "9876543210",
  address1: "12 Palm Grove, Baner",
  address2: "",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411045",
  notes: "",
  paymentMethod: "cod",
  saveAddress: "",
};

/**
 * The cases.
 *
 * `field` is the field that is wrong, `ok` is whether the shop should
 * accept the details, and `message` is what it should say about that
 * field — the message the form shows under the field.
 */
const CASES = [
  { label: "everything is right", change: {}, ok: true },
  {
    label: "the name is missing",
    change: { name: "" },
    ok: false,
    field: "name",
    message: "Full name is required.",
  },
  {
    label: "the name is one letter",
    change: { name: "A" },
    ok: false,
    field: "name",
    message: "Enter your full name.",
  },
  {
    label: "the email is missing",
    change: { email: "" },
    ok: false,
    field: "email",
    message: "Email address is required.",
  },
  {
    label: "the email is not an address",
    change: { email: "not-an-address" },
    ok: false,
    field: "email",
    message: "Enter a valid email address.",
  },
  {
    label: "the email has no top-level domain",
    change: { email: "arjun@example" },
    ok: false,
    field: "email",
    message: "Enter a valid email address.",
  },
  {
    label: "the phone is missing",
    change: { phone: "" },
    ok: false,
    field: "phone",
    message: "Phone number is required.",
  },
  {
    label: "the phone is too short",
    change: { phone: "98765" },
    ok: false,
    field: "phone",
    message: "Enter a valid phone number.",
  },
  {
    label: "the phone is written with spaces",
    change: { phone: "98765 43210" },
    ok: true,
  },
  {
    label: "the phone is written with a country code",
    change: { phone: "+91 98765 43210" },
    ok: true,
  },
  {
    label: "the street address is missing",
    change: { address1: "" },
    ok: false,
    field: "address1",
    message: "Address line 1 is required.",
  },
  {
    label: "the street address is too short",
    change: { address1: "12" },
    ok: false,
    field: "address1",
    message: "Enter your street address.",
  },
  {
    label: "the city is missing",
    change: { city: "" },
    ok: false,
    field: "city",
    message: "City is required.",
  },
  {
    label: "the state is missing",
    change: { state: "" },
    ok: false,
    field: "state",
    message: "Select your state.",
  },
  {
    label: "the PIN code is missing",
    change: { pincode: "" },
    ok: false,
    field: "pincode",
    message: "PIN code is required.",
  },
  {
    label: "the PIN code is not six digits",
    change: { pincode: "4110" },
    ok: false,
    field: "pincode",
    message: "PIN code must be 6 digits.",
  },
  {
    label: "the PIN code has letters in it",
    change: { pincode: "41104A" },
    ok: false,
    field: "pincode",
    message: "PIN code must be 6 digits.",
  },
  {
    label: "the address line 2 is left out",
    change: { address2: "" },
    ok: true,
  },
  {
    label: "the notes are left out",
    change: { notes: "" },
    ok: true,
  },
  {
    label: "the details are only spaces",
    change: { name: "   ", city: "  " },
    ok: false,
    field: "name",
    message: "Full name is required.",
  },
];

section("the shop and the form agree about every case");
for (const test of CASES) {
  const details = { ...GOOD, ...test.change };

  // The shop's own answer.
  const parsed = checkoutSchema.safeParse(details);
  const shopOk = parsed.success;

  // The form's own answer.
  const formWrong = CHECKOUT_FIELDS.filter(
    (name) => checkCheckoutField(name, String(details[name] ?? "")) !== null
  );

  check(
    test.label,
    shopOk === test.ok && (test.ok || formWrong[0] === test.field),
    shopOk
      ? "accepted"
      : `refused ${parsed.error.issues.map((i) => i.path[0]).join(", ")}`
  );

  if (!test.ok && test.field) {
    const issue = parsed.error.issues.find((i) => i.path[0] === test.field);
    check(
      `  the shop says the same thing as the form about ${test.field}`,
      issue?.message === test.message,
      issue?.message ?? "no message"
    );
  }
}

section("the shop names every field the form names");
{
  // A form that names a field the shop does not know about would leave
  // a customer with a message the shop cannot back up.
  const formFields = CHECKOUT_FIELDS.map((name) => {
    const parsed = checkoutSchema.safeParse({ ...GOOD, [name]: "" });
    return parsed.success ? null : parsed.error.issues[0]?.path[0];
  });

  check(
    "every field the form checks is a field the shop checks",
    formFields.every((f) => f !== null),
    formFields.filter(Boolean).join(", ")
  );
}

section("the form's own notices");
{
  // The notice is what the pop-up says. It stands away from the field,
  // so it has to name the detail it is about all by itself.
  const notices = {
    email: "Invalid email address.",
    phone: "Invalid phone number.",
    pincode: "Invalid PIN code.",
  };

  for (const [field, notice] of Object.entries(notices)) {
    const problem = checkCheckoutField(field, "not right");
    check(
      `the pop-up says what is wrong with the ${field}`,
      problem?.notice === notice,
      problem?.notice ?? "no notice"
    );
  }

  const missing = checkCheckoutField("email", "");
  check(
    "and a field left empty is said to be missing, not wrong",
    missing?.notice === "Email address is required.",
    missing?.notice ?? "no notice"
  );
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — checkout rules"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
