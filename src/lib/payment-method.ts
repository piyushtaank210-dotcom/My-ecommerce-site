/**
 * How a payment method is written for a person to read.
 *
 * This is deliberately its own module with no database import: client
 * components need these labels, and pulling the database into a browser
 * bundle is not something the bundler can do.
 *
 * The names come from the payment gateway itself — it says whether the
 * money went by UPI, by card, by netbanking and so on — so these are the
 * customer's own words for how they paid.
 */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  upi: "UPI",
  card: "Card",
  debit_card: "Debit card",
  credit_card: "Credit card",
  prepaid_card: "Prepaid card",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "No Cost EMI",
  cardless_emi: "No Cost EMI",
  paylater: "Pay later",
  razorpay: "Razorpay",
};

/**
 * The label for a payment method, whatever the gateway called it.
 */
export function paymentMethodLabel(method: string | null | undefined): string {
  const key = (method ?? "").trim().toLowerCase();
  if (!key) return "Not recorded";
  return PAYMENT_METHOD_LABEL[key] ?? key.toUpperCase();
}
