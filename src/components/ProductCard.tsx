import Link from "next/link";
import { Star } from "lucide-react";
import type { Product } from "@/lib/types";
import { money, discountPct } from "@/lib/format";
import { sellingPrice } from "@/lib/pricing";
import { sellableStock } from "@/lib/stock";
import { ProductCardAction } from "./ProductCardAction";

export function ProductCard({ product }: { product: Product }) {
  // A product on a sale price shows the sale price, with the price it
  // normally sells for struck through beside it.
  const now = sellingPrice(product);
  const off = discountPct(product.mrp, now);
  // What the shop can really sell: the options' stock added up, or the
  // product's own count when it has no options.
  const outOfStock = sellableStock(product) <= 0;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-card">
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-gray-50"
      >
        {product.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : null}

        {off > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
            {off}% off
          </span>
        )}

        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-white/75">
            <span className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600">
              Out of stock
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {product.brand && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">
            {product.brand}
          </p>
        )}

        <h3 className="mb-2 line-clamp-2 text-[14px] font-semibold leading-snug text-ink">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>

        <div className="mb-3 flex items-center gap-1.5 text-[12px] text-gray-500">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="tnum font-semibold text-ink">
            {product.rating.toFixed(1)}
          </span>
          <span>({product.reviews.toLocaleString("en-IN")})</span>
        </div>

        <div className="mt-auto">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="tnum text-[19px] font-bold leading-none text-ink">
              {money(now)}
            </span>
            {now < product.price && (
              <span className="price-strike tnum text-[12.5px]">
                {money(product.price)}
              </span>
            )}
            {product.mrp > now && (
              <span className="price-strike tnum text-[12.5px]">
                {money(product.mrp)}
              </span>
            )}
          </div>

          <ProductCardAction
            product={product}
            className="btn btn-outline btn-sm mt-3 w-full"
          />
        </div>
      </div>
    </article>
  );
}
