import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { getCategories, getProducts, getHeroSlides } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { ProductGrid } from "@/components/ProductGrid";
import { HeroCarousel } from "@/components/HeroCarousel";
import { BestSellerCard } from "@/components/BestSellerCard";
import { TrustSection } from "@/components/TrustSection";

/**
 * The card copy. The heading, the paragraph, the list of selling points and
 * the button label are all written here rather than derived from the
 * catalogue, because they read as marketing rather than as a field in a
 * table.
 *
 * The copy deliberately does not name product types — no "Slim", no "Disc",
 * no "Digital", no "Edge", no storage size. A tile that spells out the
 * variants reads as a spec sheet and makes the shopper compare editions
 * before they have decided they want one. Each card instead says what the
 * category is and why it is worth buying from us: what the hardware does
 * for you, and what we promise on top of it.
 */
const CARD_COPY: Record<
  string,
  { title: string; blurb: string; points: string[]; cta: string }
> = {
  consoles: {
    title: "Gaming Consoles",
    blurb:
      "Official console hardware — sealed, checked and ready to play the day it arrives.",
    points: [
      "Every game you own, on one machine",
      "Fast loading, smooth frame rates",
      "Official hardware, fully warranted",
      "Dispatched the same day you order",
    ],
    cta: "Explore Consoles",
  },
  controllers: {
    title: "Gaming Controllers",
    blurb:
      "Official controller hardware — sealed, and ready to pair the day it arrives.",
    points: [
      "Haptic feedback you can feel",
      "Adaptive triggers, where supported",
      "Long battery life for long sessions",
      "Official hardware, fully warranted",
    ],
    cta: "Shop Controllers",
  },
};

/**
 * The photographs in each category card: one hero in the tall cell and two
 * supporting products beside it. These are the ones a shopper looks for
 * first — the flag consoles, the standard controller and the pro pad —
 * rather than the first three rows of the catalogue.
 */
const CARD_ART: Record<string, { hero: string; support: string[] }> = {
  consoles: {
    hero: "playstation-5-pro-2tb",
    support: [
      "playstation-5-slim-disc-1tb",
      "playstation-4-slim-500gb",
    ],
  },
  controllers: {
    hero: "dualsense-edge",
    support: ["dualsense-white", "dualsense-charging-station"],
  },
};

export default async function HomePage() {
  // The three are asked for together: the database is a long way off, and
  // asking one at a time makes the page as slow as the sum of them.
  const [allProducts, heroSlides, allCategories] = await Promise.all([
    getProducts(),
    getHeroSlides(),
    getCategories(),
  ]);

  // Only the categories the shop has something in. A category the store is
  // getting ready for — accessories, bundles — is not a tile until there is
  // something in it.
  const stocked = new Set(
    allProducts.map((p) => p.category_slug).filter(Boolean)
  );
  const categories = allCategories.filter((c) => stocked.has(c.slug));

  // The best sellers are the first of the same list, so they are taken from
  // it rather than asked for a second time.
  const featured = allProducts.slice(0, 5);

  const productBySlug: Record<string, Product> = {};
  for (const p of allProducts) productBySlug[p.slug] = p;

  return (
    <>
      {/* Hero */}
      <HeroCarousel slides={heroSlides} />

      {/* Categories */}
      <section className="container-x py-12 sm:py-14">
        {/* The heading sits in the site's own gutter, not inside the card
            grid's width cap — otherwise it drifts hundreds of pixels to the
            right of "Best sellers" below it on a wide screen. The cards keep
            their cap; only this row follows the site width. */}
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6 sm:gap-6">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-ink sm:text-[24px]">
              Shop by Category
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-gray-500 sm:text-[13.5px]">
              Everything we sell, by what it is — genuine stock, warranted,
              and dispatched the same working day.
            </p>
          </div>
          <Link
            href="/shop"
            className="shrink-0 py-1.5 text-[13.5px] font-medium text-brand hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mx-auto max-w-[1600px]">
          <div className="grid gap-5 sm:grid-cols-2 lg:gap-6">
            {categories.map((cat) => {
              const copy = CARD_COPY[cat.slug];
              const art = CARD_ART[cat.slug];
              const hero = art ? productBySlug[art.hero] : undefined;
              const support = (art?.support ?? [])
                .map((slug) => productBySlug[slug])
                .filter((p): p is Product & { image: string } => Boolean(p?.image));

              return (
                <Link
                  key={cat.slug}
                  href={`/category/${cat.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card transition-shadow duration-200 hover:shadow-pop"
                >
                  {/* The products sit on white tiles over a soft field, with
                      a wash of the brand blue behind them. Every photograph
                      is contained inside its tile: the sources range from a
                      studio shot on white to a photograph of a console
                      standing in a room, and cropping them to a common
                      frame is what makes a strip of them look accidental. */}
                  <div className="relative bg-gray-50 p-2.5 sm:p-4">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_28%_45%,rgba(0,113,197,0.10),transparent_70%)]"
                    />

                    {/* grid-rows-1 matters: with an auto row the cells size
                        to the photographs' own height and the pictures spill
                        out over the copy below.

                        On a phone the strip is shorter and the supporting
                        photographs sit side by side underneath the hero one,
                        rather than in a narrow column beside it — a column
                        that narrow crops the controllers in half. */}
                    <div className="relative grid h-[210px] grid-cols-1 grid-rows-[1.35fr_1fr] gap-2 sm:h-[380px] sm:grid-cols-[1.35fr_1fr] sm:grid-rows-1 sm:gap-4 lg:h-[420px]">
                      {/* Hero */}
                      <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-white p-3 shadow-card sm:p-4">
                        {hero?.image && (
                          /*
                            Served at the size it is shown at. These are
                            full-size catalogue photographs, and the tile
                            they sit in is a fraction of that — a phone
                            was downloading megabytes for a thumbnail.
                          */
                          <Image
                            src={hero.image}
                            alt=""
                            loading="lazy"
                            width={1200}
                            height={1200}
                            sizes="(min-width: 640px) 26vw, 46vw"
                            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        )}
                      </div>

                      {/* The two supporting products */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:grid-rows-2 sm:gap-4">
                        {support.map((p) => (
                          <div
                            key={p.slug}
                            className="flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2.5 shadow-card sm:p-3"
                          >
                            {/*
                              Served at the size it is shown at — see the
                              note on the photograph above.
                            */}
                            <Image
                              src={p.image}
                              alt=""
                              loading="lazy"
                              width={1200}
                              height={1200}
                              sizes="(min-width: 640px) 26vw, 46vw"
                              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.05]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5 sm:p-7">
                    <h3 className="text-[19px] font-bold text-ink sm:text-[22px]">
                      {copy?.title ?? cat.name}
                    </h3>
                    <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-gray-500 sm:text-[14px]">
                      {copy?.blurb ?? cat.blurb}
                    </p>

                    <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:mt-5 lg:grid-cols-2">
                      {(copy?.points ?? []).map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-2 text-[13px] text-gray-600 sm:items-center sm:text-[13.5px]"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand sm:mt-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>

                    {/* mt-auto keeps the button on the baseline of the card
                        when one category lists more products than the other. */}
                    <div className="mt-auto pt-5 sm:pt-6">
                      <span className="btn btn-primary gap-2">
                        {copy?.cta ?? `Shop ${cat.name}`}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="border-y border-gray-200">
        {/* The same container as every other section, so the row lines up
            with the categories above it and the trust section below. */}
        <div className="container-x py-11 sm:py-14">
          <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8 sm:gap-6">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold text-ink sm:text-[22px]">
                Best sellers
              </h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-gray-500 sm:text-[13.5px]">
                The hardware our customers keep coming back for — all
                genuine, all in stock, all ready to go out.
              </p>
            </div>
            <Link
              href="/shop"
              className="shrink-0 py-1.5 text-[13.5px] font-medium text-brand hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9 lg:grid-cols-5">
            {featured.map((p) => (
              <BestSellerCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <TrustSection />
    </>
  );
}
