import Link from "next/link";
import type { Product } from "@/lib/types";
import { money, discountPct } from "@/lib/format";
import { sellingPrice } from "@/lib/pricing";
import { sellableStock } from "@/lib/stock";
import { ProductCardAction } from "./ProductCardAction";

/**
 * The tile used in the homepage "Best sellers" row.
 *
 * It is deliberately not the catalogue card: no border, no card background
 * and no rounded panel — the photograph sits straight on the page, with the
 * name, the price and a full-width button underneath it. Five of these in a
 * row read as a shop window rather than a spreadsheet.
 */
export function BestSellerCard({ product }: { product: Product }) {
  const now = sellingPrice(product);
  const off = discountPct(product.mrp, now);
  // What the shop can really sell: the options' stock added up, or the
  // product's own count when it has no options.
  const outOfStock = sellableStock(product) <= 0;

  return (
    <article className="group flex h-full flex-col">
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-white"
      >
        {product.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2.5 transition-transform duration-300 group-hover:scale-[1.05] sm:p-3"
          />
        ) : null}

        {off > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white sm:left-2 sm:top-2 sm:px-2.5 sm:py-1 sm:text-[11.5px]">
            {off}% off
          </span>
        )}

        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <span className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 sm:px-3 sm:py-1.5 sm:text-[12px]">
              Out of stock
            </span>
          </div>
        )}
      </Link>

      {/* Two lines are reserved for the name so the prices and the buttons
          line up across the row however long the product names are. */}
      <h3 className="mt-3 line-clamp-2 min-h-[2.1rem] text-[12.5px] font-bold uppercase leading-snug tracking-[0.005em] text-ink sm:mt-4 sm:min-h-[2.35rem] sm:text-[13.5px]">
        <Link href={`/product/${product.slug}`}>{product.name}</Link>
      </h3>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="tnum text-[15px] font-bold text-ink sm:text-[16px]">
          {money(now)}
        </span>
        {now < product.price && (
          <span className="price-strike tnum text-[11.5px] sm:text-[12.5px]">
            {money(product.price)}
          </span>
        )}
        {product.mrp > now && (
          <span className="price-strike tnum text-[11.5px] sm:text-[12.5px]">
            {money(product.mrp)}
          </span>
        )}
      </div>

      <div className="mt-auto pt-3 sm:pt-4">
        <ProductCardAction
          product={product}
          className="btn btn-primary w-full whitespace-normal px-2 text-center text-[12px] leading-tight sm:px-3 sm:text-[13px]"
        />
      </div>
    </article>
  );
}
