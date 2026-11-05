import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  IndianRupee,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { STORE } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "ConsoleSeller is a console and controller retailer built on genuine stock, honest prices and support that answers — find out how we work, what we promise, and what we refuse to do.",
};

/**
 * The four things a shopper wants to check us against. Every one of them is
 * a promise the store already makes somewhere else — they are read out of
 * `store-info.ts` rather than written here, so the page cannot drift away
 * from what the shop actually does.
 */
const FACTS = [
  { value: "Same working day", label: "dispatch, before 4pm" },
  { value: `${STORE.replacementDays} days`, label: "to replace a faulty unit" },
  { value: "1 working day", label: "to reply to an enquiry" },
];

const PROMISES = [
  {
    Icon: ShieldCheck,
    title: "Genuine hardware only",
    body: "Authorised distributor units, sealed, with the full Indian warranty.",
  },
  {
    Icon: IndianRupee,
    title: "Honest prices",
    body: "The price you see is the price you pay. A real discount is marked against the manufacturer price.",
  },
  {
    Icon: PackageCheck,
    title: "Stock we actually have",
    body: "The number on the page is the number we counted.",
  },
  {
    Icon: MessageSquare,
    title: "Support that answers",
    body: "A person who can pull up your order and act on it, usually within a working day.",
  },
];

/**
 * The refusals. A shop that says what it will not do is worth more than one
 * that only lists what it will.
 */
const REFUSALS = [
  {
    title: "We won't sell refurbished as new",
    body: "Everything we sell is sealed, authorised stock.",
  },
  {
    title: "We won't list stock we don't have",
    body: "We would rather turn an order down than cancel it a fortnight later.",
  },
  {
    title: "We won't invent a was-price",
    body: "A struck-through price only appears when there is a real one behind it.",
  },
  {
    title: "We won't hide behind a bot",
    body: "Your enquiry goes to a person who can look up your order.",
  },
];

/**
 * Where the stock comes from. A warranty is only worth something if the unit
 * came from the manufacturer's own distribution chain, which is why the
 * chain is worth drawing out rather than describing in a sentence.
 */
const SUPPLY_CHAIN = [
  {
    title: "The manufacturer",
    body: "We buy from the authorised channel, so the warranty on the box is the warranty on the invoice.",
  },
  {
    title: "The distributor",
    body: "Sealed units with the full Indian warranty attached and a valid invoice behind them.",
  },
  {
    title: "Our shelf",
    body: "Stock we have counted ourselves. The number on the page is this number.",
  },
  {
    title: "Your door",
    body: `Orders placed before ${STORE.dispatchCutoff} go out ${STORE.dispatchWindow}.`,
  },
];

const POLICY_LINKS = [
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Refund & Return Policy", href: "/refund-policy" },
];

export default function AboutPage() {
  return (
    <div>
      <div className="container-x pt-8">
        <Breadcrumbs items={[{ label: "About Us" }]} />
      </div>

      {/* Lead band */}
      <section className="bg-ink">
        <div className="container-x py-16 sm:py-20">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/50">
            About ConsoleSeller
          </p>
          <h1 className="mt-5 max-w-[16ch] text-[clamp(2.1rem,4.4vw,3.6rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-white">
            Every console and controller, from one store.
          </h1>
          <p className="mt-6 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
            We are a small team of enthusiasts who got tired of hunting for a
            console that was actually in stock. ConsoleSeller exists to make
            buying consoles and controllers straightforward: genuine units,
            honest prices, and a shop that tells you the truth about what is
            available.
          </p>

          {/* The four things we can be held to, in one line. */}
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-8">
            {FACTS.map((f) => (
              <span key={f.label} className="text-[13.5px] text-white/55">
                <span className="font-semibold text-white">{f.value}</span>{" "}
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The story, and the one rule it all comes back to. */}
      <section className="container-x py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <h2 className="text-[22px] font-bold text-ink">Why we started</h2>
            <div className="mt-5 space-y-5 text-[15px] leading-[1.75] text-gray-600">
              <p>
                Every console we wanted to buy came with the same problem. The
                listing said in stock, the payment page took the money, and two
                weeks later the order was cancelled because there was never a
                unit in the warehouse. It is a miserable way to spend a few
                thousand rupees, and it is not hard to fix.
              </p>
              <p>
                ConsoleSeller is a single, focused catalogue. We sell consoles and
                controllers — the hardware that matters to a gaming setup — and
                we publish the stock we have rather than the stock we wish we
                had. If a product is on the site, it is on the shelf, and it
                ships the same day.
              </p>
              <p>
                We are deliberately small. That means we know the hardware we
                sell, we can answer a question about it without checking a
                spreadsheet, and when something goes wrong with an order we can
                fix it rather than pass it around. It also means you can hold
                us to what is written on this page, because all of it is
                written into our terms as well.
              </p>
            </div>
          </div>

          <aside className="self-start rounded-2xl bg-ink p-5 sm:p-10">
            <span aria-hidden="true" className="block h-1 w-12 rounded-full bg-brand" />
            <blockquote className="mt-7 text-[20px] font-semibold leading-[1.4] tracking-[-0.02em] text-white sm:text-[22px]">
              If it is on the site, it is on the shelf, it is genuine, and it
              leaves our warehouse the same working day.
            </blockquote>
            <p className="mt-5 text-[13px] leading-relaxed text-white/45">
              The one rule the whole store is built around
            </p>
          </aside>
        </div>
      </section>

      {/* The promise and the refusal, side by side. What we will do, and
          what we will not, read better as a pair than as two separate
          sections. */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="container-x py-16 sm:py-20">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-0">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
                What we promise
              </p>
              <h2 className="mt-3 text-[clamp(1.4rem,2.3vw,1.8rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
                Four things you can hold us to.
              </h2>

              <ul className="mt-9 space-y-7">
                {PROMISES.map(({ Icon, title, body }) => (
                  <li key={title} className="flex gap-4 border-t border-gray-200 pt-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:border-l lg:border-gray-300 lg:pl-16">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-gray-400">
                What we will not do
              </p>
              <h2 className="mt-3 text-[clamp(1.4rem,2.3vw,1.8rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
                Four things we will not do.
              </h2>

              <ul className="mt-9 space-y-7">
                {REFUSALS.map((r) => (
                  <li key={r.title} className="flex gap-4 border-t border-gray-200 pt-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-200 text-gray-500">
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <div>
                      <h3 className="text-[14.5px] font-bold text-ink">{r.title}</h3>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
                        {r.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Where the stock comes from — the one diagram on the page. Each
          step carries a dot on a rule, and the four rules read as a single
          broken line across the row. */}
      <section className="container-x py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
            Where the stock comes from
          </p>
          <h2 className="mt-3 text-[clamp(1.4rem,2.3vw,1.8rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink">
            An authorised channel, end to end.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-gray-600">
            Every piece of hardware on this site came through the
            manufacturer&apos;s own distribution chain. That is what makes the
            warranty on a product page a real warranty.
          </p>
        </div>

        <div className="mt-12 grid gap-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
          {SUPPLY_CHAIN.map((node, i) => (
            <div key={node.title} className="relative border-t border-gray-200 pt-6">
              <span
                aria-hidden="true"
                className="absolute -top-[4px] left-0 h-2 w-2 rounded-full bg-brand"
              />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                Step {i + 1}
              </p>
              <h3 className="mt-2 text-[15px] font-bold text-ink">{node.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
                {node.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="container-x py-16 sm:py-20">
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-brand px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-10">
          <div>
            <h2 className="text-[22px] font-bold text-white sm:text-[26px]">
              Browse the full catalogue
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/80">
              Every console and controller we stock, in one place — filter by
              category, sort by price, and add anything you like to your cart.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
              {POLICY_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full border border-white/25 px-3 py-1.5 text-[12.5px] text-white/75 transition-colors hover:border-white/60 hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-5">
            <Link href="/shop" className="btn-invert">
              Shop now
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="text-[13.5px] font-semibold text-white/85 underline-offset-4 hover:underline"
            >
              Or ask us something
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
