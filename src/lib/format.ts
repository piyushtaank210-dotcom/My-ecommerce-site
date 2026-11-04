const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function money(amount: number): string {
  return inr.format(Math.round(amount));
}

/** Percentage saved off the MRP, rounded. */
export function discountPct(mrp: number, price: number): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

/**
 * Delivery costs nothing on every order. There is no minimum order value and
 * no threshold anywhere on the site — the old over-₹999 rule has been
 * removed, along with the cart nudge that advertised it.
 */
export function shippingFor(_subtotal: number): number {
  return 0;
}

export function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
