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
            {/* The line under the heading is for the tablet and the
                desktop. A phone shows the heading and the link, and the
                promise it makes is made again, in full, a little further
                down the page — so the phone is not asked to read it
                twice. */}
            <p className="mt-1.5 hidden max-w-xl text-[13px] leading-relaxed text-gray-500 sm:block sm:text-[13.5px]">
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
          {/* Two cards side by side on a phone, and the same two side by
              side from the tablet up — the grid only changes its gap and
              the cards' own innards below the sm breakpoint. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:gap-6">
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
                  <div className="relative bg-gray-50 p-2 sm:p-4">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_28%_45%,rgba(0,113,197,0.10),transparent_70%)]"
                    />

                    {/* grid-rows-1 matters: with an auto row the cells size
                        to the photographs' own height and the pictures spill
                        out over the copy below.

                        On a phone the strip is shorter and the supporting
                        photograph sits underneath the hero one, across the
                        full width of the card, rather than in a narrow
                        column beside it — a column that narrow crops the
                        controllers in half.

                        The height of the strip is not written down on a
                        phone: each tile is given the shape it needs by its
                        own aspect ratio, so a card that is half as wide
                        carries a picture that is half as tall, and the
                        space around the pictures is only the space they
                        use. */}
                    <div className="relative grid gap-1.5 sm:h-[380px] sm:grid-cols-[1.35fr_1fr] sm:grid-rows-1 sm:gap-4 lg:h-[420px]">
                      {/* Hero */}
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-card sm:aspect-auto sm:p-4">
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
                            sizes="(min-width: 640px) 26vw, 40vw"
                            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        )}
                      </div>

                      {/* The supporting products.

                          A phone shows one of these, under the picture
                          that leads the category: two photographs in the
                          card, and no more. The rest of the strip belongs
                          to the tablet and the desktop, which have the
                          width to carry it — so the pictures after the
                          first are hidden there, and are never fetched. */}
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-1 sm:grid-rows-2 sm:gap-4">
                        {support.map((p, i) => (
                          <div
                            key={p.slug}
                            /* The first photograph is the one the phone
                               shows. The rest of the strip is kept for
                               the wider screens, so it is hidden there
                               and never painted — nor fetched. */
                            className={`${
                              i === 0 ? "flex" : "hidden sm:flex"
                            } aspect-[2/1] items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-card sm:aspect-auto sm:p-3`}
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
                              sizes="(min-width: 640px) 26vw, 40vw"
                              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.05]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* On a phone the card is half as wide as it was, so the
                      copy is set smaller and closer together: the same
                      words, at a size that fits the narrower column. */}
                  <div className="flex flex-1 flex-col p-3 sm:p-7">
                    {/* Two lines are reserved for the heading on a phone, so
                        the copy below it starts at the same height in every
                        card however long the name is. */}
                    <h3 className="max-sm:min-h-[2.35rem] text-[15px] font-bold leading-tight text-ink sm:text-[22px] sm:leading-[1.5]">
                      {copy?.title ?? cat.name}
                    </h3>
                    <p className="mt-1.5 text-[11.5px] leading-[1.45] text-gray-500 sm:mt-2 sm:max-w-[52ch] sm:text-[14px] sm:leading-relaxed">
                      {copy?.blurb ?? cat.blurb}
                    </p>

                    {/* The selling points. A phone leaves them out: four
                        lines in a card this narrow take the room the
                        photographs need, and every promise on this list is
                        made again, in full, in the trust panel further
                        down the page. */}
                    <ul className="mt-3 hidden gap-x-4 gap-y-1.5 sm:mt-5 sm:grid sm:gap-x-6 sm:gap-y-2.5 lg:grid-cols-2">
                      {(copy?.points ?? []).map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-1.5 text-[11px] leading-[1.4] text-gray-600 sm:items-center sm:gap-2 sm:text-[13.5px] sm:leading-[1.5]"
                        >
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand sm:mt-0 sm:h-4 sm:w-4" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>

                    {/* mt-auto keeps the button on the baseline of the card
                        when one category lists more products than the other. */}
                    <div className="mt-auto pt-3 sm:pt-6">
                      {/* The label is allowed to wrap on a phone: the card
                          is narrow enough that "Explore Consoles" will not
                          always fit on one line, and a label that spills
                          out of its button is a label that is cut off. */}
                      <span className="btn btn-primary w-full gap-1 whitespace-normal px-2 py-2.5 text-center text-[11px] leading-tight sm:w-auto sm:gap-2 sm:whitespace-nowrap sm:px-[1.1rem] sm:py-[0.7rem] sm:text-[14px] sm:leading-[1.1] sm:text-start">
                        {copy?.cta ?? `Shop ${cat.name}`}
                        <ArrowRight className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
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
