/**
 * What the checkout asks of each field.
 *
 * These rules live here, apart from the rest of the checkout, because
 * two places need them: the form in the browser, which tells the
 * customer what is wrong with a field as soon as they have finished
 * with it, and the shop's own endpoint, which decides what an order
 * is. One set of rules means the form can never disagree with the shop
 * about what is acceptable.
 *
 * Nothing here reaches the database, so the browser can carry these
 * rules without dragging the shop's connections along with them.
 */

/** The fields the customer fills in, in the order they appear on the page. */
export const CHECKOUT_FIELDS = [
  "name",
  "email",
  "phone",
  "address1",
  "city",
  "state",
  "pincode",
] as const;

/** The name of one of those fields. */
export type CheckoutFieldName = (typeof CHECKOUT_FIELDS)[number];

/**
 * What one field is held to.
 *
 * Three things are said about a field, because they are said in
 * different places:
 *
 *   · `required` — the field has been left empty.
 *   · `invalid` — what is in the field will not do. This is the line
 *     under the field, where the customer is looking at the field and
 *     can read what would make it right.
 *   · `notice` — the same fault said in one line, for the little
 *     pop-up, which stands away from the field and so has to name the
 *     detail it is about all by itself.
 */
export type CheckoutFieldRule = {
  /** Said when the field has been left empty. */
  required: string;
  /** Said under the field when what is in it will not do. */
  invalid: string;
  /** Said in the pop-up. */
  notice: string;
  /** Whether what is in the field is acceptable. */
  accepts: (value: string) => boolean;
};

/**
 * An email address, held to the shape an address really has: something
 * before the @, a domain after it, and a top-level domain of letters.
 *
 * This is the same shape the shop's own validator accepts — the same
 * pattern, down to the last full stop — so that an address the form is
 * happy with is an address the shop is happy with, and the other way
 * round.
 */
const EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

/**
 * A phone number: digits, with the spaces, dashes and country code a
 * person may write.
 */
const PHONE = /^[0-9+\-\s]{10,15}$/;

/** A PIN code: six digits, and nothing else. */
const PIN = /^[0-9]{6}$/;

/**
 * The rules themselves.
 *
 * Each field is written out on its own, with the two things that can
 * be wrong with it — that it was left empty, or that what was put in
 * it will not do.
 */
export const CHECKOUT_FIELD_RULES: Record<CheckoutFieldName, CheckoutFieldRule> = {
  name: {
    required: "Full name is required.",
    invalid: "Enter your full name.",
    notice: "Invalid full name.",
    accepts: (value) => value.length >= 2,
  },
  email: {
    required: "Email address is required.",
    invalid: "Enter a valid email address.",
    notice: "Invalid email address.",
    accepts: (value) => EMAIL.test(value),
  },
  phone: {
    required: "Phone number is required.",
    invalid: "Enter a valid phone number.",
    notice: "Invalid phone number.",
    accepts: (value) => PHONE.test(value),
  },
  address1: {
    required: "Address line 1 is required.",
    invalid: "Enter your street address.",
    notice: "Invalid street address.",
    accepts: (value) => value.length >= 5,
  },
  city: {
    required: "City is required.",
    invalid: "Enter your city.",
    notice: "Invalid city.",
    accepts: (value) => value.length >= 2,
  },
  state: {
    required: "Select your state.",
    invalid: "Select your state.",
    notice: "Select your state.",
    accepts: (value) => value.length >= 2,
  },
  pincode: {
    required: "PIN code is required.",
    invalid: "PIN code must be 6 digits.",
    notice: "Invalid PIN code.",
    accepts: (value) => PIN.test(value),
  },
};

/**
 * What is wrong with a field, and how it is to be said.
 *
 * The message goes under the field, where the customer is looking at
 * it. The notice is what the little pop-up says: it stands away from
 * the field, so it has to name the detail it is about all by itself.
 */
export type FieldProblem = {
  /** The line shown under the field. */
  message: string;
  /** The line shown in the pop-up. */
  notice: string;
};

/**
 * What is wrong with what the customer has typed into a field.
 *
 * A field that has been left empty is said to be missing, and a field
 * that has been filled in wrongly is said to be wrong. They are
 * different mistakes, and the customer is told which one they have
 * made.
 */
export function checkCheckoutField(
  name: CheckoutFieldName,
  value: string
): FieldProblem | null {
  const rule = CHECKOUT_FIELD_RULES[name];
  const trimmed = value.trim();

  if (trimmed === "") {
    return { message: rule.required, notice: rule.required };
  }

  if (!rule.accepts(trimmed)) {
    return { message: rule.invalid, notice: rule.notice };
  }

  return null;
}
