import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ContactForm } from "@/components/ContactForm";
import { STORE } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Questions about a console, an order or your warranty? Send our team a message — a real person replies, usually within one working day.",
};

const CHANNELS = [
  {
    Icon: Mail,
    title: "Email",
    body: STORE.email,
    note: "The fastest way to reach us.",
    href: `mailto:${STORE.email}`,
  },
  ...(STORE.phone
    ? [
        {
          Icon: Phone,
          title: "Phone",
          body: STORE.phone,
          note: "Direct telephone support.",
          href: `tel:${STORE.phone.replace(/\s+/g, "")}`,
        },
      ]
    : []),
  {
    Icon: MapPin,
    title: "Address",
    body: [STORE.address, STORE.city].filter(Boolean).join(", "),
    note: "Registered business office.",
  },
  {
    Icon: Clock,
    title: "Support hours",
    body: STORE.hours,
    note: "Enquiries sent outside these hours are answered the next working day.",
  },
  {
    Icon: Package,
    title: "Order enquiries",
    body: "Quote your order ID",
    note: "Add the order ID to the form and we can pull up your order straight away.",
  },
];

const TOPICS = [
  {
    Icon: MessageSquare,
    title: "Product questions",
    body: "Stock, variants, specifications, or whether a console is the right one for you.",
  },
  {
    Icon: Truck,
    title: "Orders and delivery",
    body: "Where an order is, changing an address, or what happens after checkout.",
  },
  {
    Icon: ShieldCheck,
    title: "Warranty and returns",
    body: `${STORE.replacementDays}-day replacement, a faulty unit, or a return you need to start.`,
  },
  {
    Icon: Search,
    title: "Something else",
    body: "Account questions, a bulk order, or anything that does not fit neatly into the three above.",
  },
];

/**
 * The questions that arrive most often, answered here so that a shopper who
 * only needs the answer does not have to wait for a reply to get it.
 */
const ALREADY_ANSWERED = [
  {
    q: "Is the price on the page the price I pay?",
    a: "Yes. Where the price is genuinely reduced against the manufacturer price we show the original struck through — we never make up a higher price to make a discount look bigger.",
  },
  {
    q: "When will my order arrive?",
    a: `Orders placed before ${STORE.dispatchCutoff} go out ${STORE.dispatchWindow}. Delivery is ${STORE.deliveryWindow}.`,
  },
  {
    q: "What if it arrives broken or faulty?",
    a: `Tell us within ${STORE.replacementDays} days of delivery. We arrange the replacement and cover the return shipping — there is no restocking fee and no argument.`,
  },
  {
    q: "Do I need an account to order?",
    a: "No. Guest checkout is always available. An account only adds order history and a saved address book.",
  },
];

/** What happens to a message once it is sent. */
const AFTER_YOU_SEND = [
  {
    title: "We read it",
    body: "Your message lands in our enquiry queue, in order. If you have an order ID, it is on the message already, so we can pull it up straight away.",
  },
  {
    title: "We check it",
    body: "We look up the order, count the stock, or read the policy that applies to the question. Nothing is answered from memory.",
  },
  {
    title: "We reply",
    body: "A person writes back, usually within one working day. If something needs checking off first, we tell you when to expect it rather than going quiet.",
  },
];

/** Where each kind of question goes, so the form is not the only route. */
const ROUTES = [
  {
    need: "Whether a product is in stock, or which variant suits you",
    where: "The form",
    then: "A reply within one working day, from a person",
  },
  {
    need: "Where your order is",
    where: "The form, with your order ID",
    then: "We pull the order up and tell you where it is",
  },
  {
    need: "A return, a replacement or a warranty claim",
    where: `The form, within ${STORE.replacementDays} days of delivery`,
    then: "We arrange the replacement and cover the return shipping",
  },
  {
    need: "The legal detail of a purchase",
    where: "The policy pages",
    then: "Written into our terms — read them before you buy",
    href: "/terms-of-service",
  },
];

const POLICY_LINKS = [
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Refund & Return Policy", href: "/refund-policy" },
];

export default function ContactPage() {
  return (
    <div>
      <div className="container-x pt-8">
        <Breadcrumbs items={[{ label: "Contact Us" }]} />
      </div>

      {/* Lead band — the same dark band the About page opens with, so the
          two pages read as part of the same shop. */}
      <section className="border-b border-gray-200 bg-ink">
        <div className="container-x py-14 sm:py-16">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/60">
            We are listening
          </p>
          <h1 className="mt-4 max-w-[16ch] text-[clamp(2rem,4vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
            How can we help?
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/70 sm:text-[16px]">
            Whether you are weighing up a console, checking on an order, or
            need help with a warranty, tell us what is going on and a real
            person on our team will pick it up. Most messages are answered
            within a working day.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {[
              { Icon: Clock, label: STORE.hours },
              { Icon: ShieldCheck, label: "Replies within one working day" },
              { Icon: Package, label: "Quote your order ID for a faster answer" },
            ].map(({ Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[12.5px] text-white/75"
              >
                <Icon className="h-[15px] w-[15px] text-white/50" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The ways to reach us, and the form. */}
      <section className="container-x py-12 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
          {/* Left — the ways to reach us. */}
          <div>
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {CHANNELS.map(({ Icon, title, body, note, href }) => (
                <div key={title} className="border-t border-gray-200 pt-5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-tint text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h2 className="mt-3 text-[14px] font-semibold text-ink">{title}</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-700">
                    {href ? (
                      <a
                        href={href}
                        className="font-medium text-brand hover:underline"
                      >
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
                    {note}
                  </p>
                </div>
              ))}
            </div>

            <h2 className="mt-12 text-[18px] font-bold text-ink">
              What we can help with
            </h2>
            <ul className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {TOPICS.map(({ Icon, title, body }) => (
                <li key={title} className="flex gap-3.5 border-t border-gray-200 pt-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-500">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — the form. */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
              <h2 className="text-[17px] font-bold text-ink">Send us a message</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                Tell us what you need and we will reply by email. The more
                detail you give, the less we have to ask you back.
              </p>
              <div className="mt-5">
                <ContactForm />
              </div>
            </div>

            {/* What a reply looks like, so the wait is not a mystery. */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-[14px] font-semibold text-ink">
                What a reply looks like
              </h3>
              <ul className="mt-3 space-y-2.5">
                {[
                  "Most enquiries are answered within one working day.",
                  "Messages sent outside support hours are answered the next working day.",
                  "An order ID in the message means we can act on it without a second round trip.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="text-[13px] leading-relaxed text-gray-600">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The answers that do not need an email at all. */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="container-x py-14 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
              Before you write
            </p>
            <h2 className="mt-3 text-[clamp(1.35rem,2.2vw,1.75rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
              Four questions that come up more than anything else.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-gray-600">
              These arrive more often than anything else, so here they are
              rather than in a reply to you.
            </p>
          </div>

          <dl className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2">
            {ALREADY_ANSWERED.map((item) => (
              <div key={item.q} className="border-t border-gray-200 pt-5">
                <dt className="text-[14.5px] font-semibold text-ink">{item.q}</dt>
                <dd className="mt-2 text-[13.5px] leading-relaxed text-gray-500">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* What happens once the message is sent. The diagram is the same one
          the About page uses for the supply chain — a dot on a rule per
          step — so the two pages read as one piece of design. */}
      <section className="bg-ink">
        <div className="container-x py-14 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/50">
              After you press send
            </p>
            <h2 className="mt-3 text-[clamp(1.35rem,2.2vw,1.75rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">
              What happens to your message.
            </h2>
          </div>

          <div className="mt-10 grid gap-9 sm:grid-cols-3 lg:gap-7">
            {AFTER_YOU_SEND.map((step, i) => (
              <div
                key={step.title}
                className="relative border-t border-white/15 pt-6"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-[4px] left-0 h-2 w-2 rounded-full bg-brand"
                />
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
                  Step {i + 1}
                </p>
                <h3 className="mt-2 text-[15px] font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Where each kind of question goes. */}
      <section className="container-x py-14 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
            Picking the right route
          </p>
          <h2 className="mt-3 text-[clamp(1.35rem,2.2vw,1.75rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
            Not everything needs an email.
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-gray-600">
            Some questions have a faster answer than a reply from us, and one
            of them is the law.
          </p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 pr-4 text-[11px] font-bold uppercase tracking-[0.13em] text-gray-400">
                  If you need
                </th>
                <th className="pb-3 pr-4 text-[11px] font-bold uppercase tracking-[0.13em] text-gray-400">
                  Go to
                </th>
                <th className="pb-3 text-[11px] font-bold uppercase tracking-[0.13em] text-gray-400">
                  What happens next
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ROUTES.map((r) => (
                <tr key={r.need} className="align-top">
                  <td className="py-4 pr-4 text-[13.5px] font-medium text-ink">
                    {r.need}
                  </td>
                  <td className="py-4 pr-4 text-[13.5px] text-gray-600">
                    {r.href ? (
                      <Link
                        href={r.href}
                        className="font-medium text-brand hover:underline"
                      >
                        {r.where}
                      </Link>
                    ) : (
                      r.where
                    )}
                  </td>
                  <td className="py-4 text-[13.5px] text-gray-500">{r.then}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The details you can check us against, and the policies. */}
      <section className="bg-ink">
        <div className="container-x py-14 sm:py-16">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/50">
                Store details
              </p>
              <h2 className="mt-3 text-[clamp(1.35rem,2.2vw,1.75rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">
                Everything you might want to check us against.
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-white/65">
                {STORE.tagline}. These are the same terms the homepage makes,
                written out so you can hold us to them before you order rather
                than afterwards.
              </p>

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

              <Link href="/shop" className="btn-invert mt-7">
                Browse the catalogue
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <dl className="divide-y divide-white/10 border-y border-white/10">
              {[
                {
                  label: "Email",
                  value: STORE.email,
                  href: `mailto:${STORE.email}`,
                },
                ...(STORE.phone
                  ? [
                      {
                        label: "Phone",
                        value: STORE.phone,
                        href: `tel:${STORE.phone.replace(/\s+/g, "")}`,
                      },
                    ]
                  : []),
                ...(STORE.address
                  ? [
                      {
                        label: "Address",
                        value: [STORE.address, STORE.city]
                          .filter(Boolean)
                          .join(", "),
                      },
                    ]
                  : []),
                {
                  label: "Support hours",
                  value: `${STORE.hours}. Messages sent outside these hours are answered the next working day.`,
                },
                {
                  label: "Dispatch",
                  value: `Orders placed before ${STORE.dispatchCutoff} go out ${STORE.dispatchWindow}.`,
                },
                {
                  label: "Delivery",
                  value: `Delivered in ${STORE.deliveryWindow}.`,
                },
                {
                  label: "Returns",
                  value: `${STORE.replacementDays} days from delivery — replacement, not store credit.`,
                },
                {
                  label: "Checkout",
                  value: "No account needed. Guest checkout is always available.",
                },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-3 py-4 sm:gap-4">
                  <dt className="w-[84px] shrink-0 text-[11px] font-bold uppercase tracking-[0.13em] text-white/45 sm:w-[110px]">
                    {d.label}
                  </dt>
                  {/* min-w-0 lets the value shrink inside the flex row, and
                      break-words stops a long unbroken string — the email
                      address — pushing the panel past the edge of a narrow
                      screen. */}
                  <dd className="min-w-0 break-words text-[13.5px] leading-relaxed text-white/85">
                    {d.href ? (
                      <a href={d.href} className="hover:underline">
                        {d.value}
                      </a>
                    ) : (
                      d.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
