import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  IndianRupee,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STORE } from "@/lib/store-info";

/**
 * The trust section at the foot of the homepage.
 *
 * It replaced a "biggest discounts" strip. A page that opens with what is on
 * sale and ends with a second list of products reads like a clearance
 * counter; a page that ends with the terms the shop stands behind reads like
 * a shop. Every claim here is also made somewhere else on the site — the
 * footer, the about page or the legal pages — so the promises line up.
 */
const PROMISES = [
  {
    Icon: ShieldCheck,
    title: "Genuine hardware only",
    body: "Authorised distributor units, still sealed, carrying the full Indian manufacturer warranty. No grey imports and no refurbished units sold as new.",
  },
  {
    Icon: IndianRupee,
    title: "Honest pricing",
    body: "The price you see is the price you pay. Where there is a real discount against the manufacturer price we show the original struck through — we never invent a “was” price to make a discount look bigger.",
  },
  {
    Icon: Truck,
    title: "Same-day dispatch",
    body: `Orders placed before ${STORE.dispatchCutoff} leave the warehouse ${STORE.dispatchWindow}, and you get a tracking link as soon as the courier has the parcel.`,
  },
  {
    Icon: RotateCcw,
    title: `${STORE.replacementDays}-day replacement`,
    body: "Dead on arrival, damaged in transit, or simply not what you ordered? Tell us within seven days of delivery and we replace it — no restocking fee and no argument.",
  },
  {
    Icon: CreditCard,
    title: "Secure payments",
    body: "Card, UPI and net banking are handled on your payment provider's own secure page. Your card details never reach our servers, and we never store them.",
  },
  {
    Icon: MessageSquare,
    title: "Support that answers",
    body: "A real person replies, usually within one working day. Quote your order ID and we can pull the order up and act on it while you wait.",
  },
];

/**
 * The awkward cases. This is the part of the page that does the most work —
 * a shop that says what it will do when something has gone wrong is worth
 * more than one that only lists what it sells.
 */
const WHEN_IT_GOES_WRONG = [
  {
    title: "If an order has to be cancelled",
    body: "You get the full amount back, including any delivery charge you paid, before we ask you to try again. We do not hold the money while we look for a replacement.",
  },
  {
    title: "If a price on the page is wrong",
    body: "We contact you before dispatch. You choose: cancel for a full refund, or accept the correct price. Nothing is shipped in the meantime.",
  },
  {
    title: "If a unit arrives faulty or damaged",
    body: "We arrange the replacement and cover the return shipping. You should not be out of pocket because we packed the box.",
  },
  {
    title: "If you change your mind",
    body: "You can raise a return within seven days of delivery. Send it back with the original box and every accessory, and we process the refund within 7–15 days of approving it.",
  },
  {
    title: "If you need a warranty claim",
    body: "We raise it with the manufacturer on your behalf, so you have one person to deal with instead of a call centre, and we keep you posted until it is settled.",
  },
];

/** The links to the legal pages, in the order a customer might want them. */
const POLICY_LINKS = [
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Refund & Return Policy", href: "/refund-policy" },
];

/** One row of the store details panel. */
type Detail = {
  Icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
};

export function TrustSection() {
  const details: Detail[] = [
    {
      Icon: Mail,
      label: "Email",
      value: STORE.email,
      href: `mailto:${STORE.email}`,
    },
    {
      Icon: Package,
      label: "Support hours",
      value: STORE.hours,
    },
    {
      Icon: Truck,
      label: "Dispatch",
      value: `Orders placed before ${STORE.dispatchCutoff} go out ${STORE.dispatchWindow}.`,
    },
    {
      Icon: MapPin,
      label: "Delivery",
      value: `Delivered in ${STORE.deliveryWindow}.`,
    },
    {
      Icon: RotateCcw,
      label: "Returns",
      value: `${STORE.replacementDays} days from delivery — replacement, not store credit.`,
    },
    {
      Icon: CreditCard,
      label: "Checkout",
      value: "No account needed. Guest checkout is always available.",
    },
    // The legal details are optional: a row appears only once it has been
    // filled in, so nothing half-finished reaches the page.
    ...(STORE.phone
      ? [{ Icon: Phone, label: "Phone", value: STORE.phone, href: `tel:${STORE.phone.replace(/\s+/g, "")}` }]
      : []),
    ...(STORE.address
      ? [{ Icon: MapPin, label: "Address", value: [STORE.address, STORE.city].filter(Boolean).join(", ") }]
      : []),
    ...(STORE.gstin
      ? [{ Icon: ScrollText, label: "GSTIN", value: STORE.gstin }]
      : []),
  ];

  return (
    <section className="container-x py-14 sm:py-16">
      {/* Why buy from us */}
      <div className="max-w-3xl">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
          Why buy from us
        </p>
        <h2 className="mt-4 text-[clamp(1.55rem,2.6vw,2.2rem)] font-extrabold leading-[1.12] tracking-[-0.03em] text-ink">
          A small shop that would rather earn your trust than your order.
        </h2>
        <div className="mt-5 space-y-4 text-[14.5px] leading-relaxed text-gray-600">
          <p>
            ConsoleSeller is a focused retailer for console hardware —
            consoles, controllers and the accessories that make a
            setup work. We are not a marketplace, and we do not list products
            we cannot ship. If it is on this site, it is on the shelf, it is
            genuine, and it leaves our warehouse the same working day.
          </p>
          <p>
            Everything below is a commitment rather than a slogan. Each one is
            written into our terms, and each one is something you can hold us
            to. Where we get something wrong — a price, a delivery estimate, a
            faulty unit — we would rather you heard it from us first than found
            out afterwards.
          </p>
        </div>
      </div>

      {/* The promises */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROMISES.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-card"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-tint text-brand">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-3 text-[15px] font-bold text-ink">{title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
              {body}
            </p>
          </div>
        ))}
      </div>

      {/* The awkward cases, and the details to check us against */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-8">
          <h3 className="text-[19px] font-bold text-ink">When something goes wrong</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-gray-500">
            Buying a console is a big decision, and most of the anxiety is
            about what happens afterwards. Here is the short version.
          </p>
          <ul className="mt-6 space-y-5">
            {WHEN_IT_GOES_WRONG.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div>
                  <h4 className="text-[14.5px] font-semibold text-ink">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-gray-500">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="rounded-2xl bg-ink p-6 text-white sm:p-8">
          <h3 className="text-[19px] font-bold text-white">Store details</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/65">
            {STORE.tagline}. Everything below is something you can check us
            against before you order.
          </p>

          <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {details.map(({ Icon, label, value, href }) => (
              <div key={label} className="flex items-start gap-3 py-3">
                <Icon className="mt-0.5 h-[17px] w-[17px] shrink-0 text-white/45" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.13em] text-white/45">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[13.5px] leading-relaxed text-white/85">
                    {href ? (
                      <a href={href} className="hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            {POLICY_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full border border-white/20 px-3 py-1.5 text-[12.5px] text-white/75 transition-colors hover:border-white/45 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <Link href="/contact" className="btn-invert mt-6">
            Talk to us
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
