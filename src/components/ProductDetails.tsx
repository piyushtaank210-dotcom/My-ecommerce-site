"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import type { GalleryImage, ProductWithVariants } from "@/lib/types";
import { money, discountPct } from "@/lib/format";
import { sellingPrice } from "@/lib/pricing";
import { PRODUCT_CONDITION_LABEL } from "@/lib/types";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchase } from "./ProductPurchase";
import {
  attributeNames,
  backordersAllowed,
  variantMatches,
  type BackorderPolicy,
  type VariantAttributes,
} from "@/lib/variations";

/**
 * The product page, with the variations.
 *
 * A product that varies by colour, storage or edition shows what it can be
 * bought as. Choosing one changes the price, the photograph and what is
 * available — and an option that is not on the shelf cannot be bought,
 * unless the store takes backorders.
 */
export function ProductDetails({
  product,
  images,
  backorderPolicy,
  children,
}: {
  product: ProductWithVariants;
  images: GalleryImage[];
  backorderPolicy: BackorderPolicy;
  /** The parts of the page that do not change with the choice. */
  children?: React.ReactNode;
}) {
  const names = useMemo(
    () => attributeNames(product.attributes),
    [product.attributes]
  );

  const allowBackorder = backordersAllowed(backorderPolicy);

  /**
   * The option that is chosen.
   *
   * It starts on the first option that is actually on the shelf, so the
   * page opens on something that can be bought.
   */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first =
      product.variants.find((v) => v.stock > 0) ?? product.variants[0];
    return first?.id ?? null;
  });

  /** The option the choice has landed on. */
  const variant = useMemo(
    () => product.variants.find((v) => v.id === selectedId) ?? null,
    [product.variants, selectedId]
  );

  /** The values of the chosen option. */
  const chosen = useMemo<VariantAttributes>(() => {
    const out: VariantAttributes = {};
    if (!variant) return out;
    for (const name of Object.keys(variant.attributes)) {
      out[name] = variant.attributes[name];
    }
    return out;
  }, [variant]);

  /** Whether a value can still be bought. */
  function availability(name: string, value: string) {
    const wanted = { ...chosen, [name]: value };
    const options = product.variants.filter((v) =>
      variantMatches(v.attributes, wanted)
    );
    if (!options.length) return "none" as const;
    if (options.some((v) => v.stock > 0)) return "in" as const;
    return allowBackorder ? ("backorder" as const) : ("out" as const);
  }

  /**
   * Chooses a value.
   *
   * Picking one attribute may rule out the value chosen for another, so
   * the choice is settled on an option that actually exists.
   */
  function pick(name: string, value: string) {
    const wanted = { ...chosen, [name]: value };
    const match = product.variants.find((v) =>
      variantMatches(v.attributes, wanted)
    );
    if (match) setSelectedId(match.id);
  }

  /* ------------------------------------------------------------- the price */

  const price = variant ? variant.price : sellingPrice(product);
  const mrp = variant ? variant.mrp : product.mrp;
  const off = discountPct(mrp, price);

  /* ------------------------------------------------------- the photograph */

  // An option with a photograph of its own shows it first, so it is the one
  // the shopper sees.
  const gallery = variant?.image
    ? [
        { src: variant.image, alt: `${product.name} — ${variant.name}` },
        ...images.filter((img) => img.src !== variant.image),
      ]
    : images;

  /* ------------------------------------------------------ what is available */

  const available = variant
    ? variant.stock > 0
      ? "in"
      : allowBackorder
        ? "backorder"
        : "out"
    : product.stock > 0
      ? "in"
      : allowBackorder
        ? "backorder"
        : "out";

  const stock = variant ? variant.stock : product.stock;

  return (
    <div className="mx-auto grid max-w-[1600px] gap-10 lg:grid-cols-2">
      {/* Image */}
      <div className="lg:sticky lg:top-24">
        <ProductGallery
          images={gallery}
          badge={
            off > 0 ? (
              <span className="absolute left-4 top-4 rounded-md bg-ink px-2.5 py-1 text-[12px] font-bold text-white">
                {off}% off
              </span>
            ) : null
          }
        />
      </div>

      {/* Details */}
      <div>
        {product.brand && (
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand">
            {product.brand}
          </p>
        )}
        <h1 className="mt-2 text-[26px] font-bold leading-tight text-ink sm:text-[30px]">
          {product.name}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
          <span className="flex items-center gap-1 text-amber-500">
            <Star className="h-4 w-4 fill-current" />
            <span className="tnum font-semibold text-ink">
              {product.rating.toFixed(1)}
            </span>
          </span>
          <span>({product.reviews.toLocaleString("en-IN")} reviews)</span>
          <span className="chip">
            {available === "in"
              ? "In stock"
              : available === "backorder"
                ? "On backorder"
                : "Out of stock"}
          </span>
          {product.condition !== "new" && (
            <span className="chip">{PRODUCT_CONDITION_LABEL[product.condition]}</span>
          )}
          {product.subcategory && (
            <span className="chip">{product.subcategory}</span>
          )}
        </div>

        {product.description && (
          <p className="mt-4 text-[14.5px] leading-relaxed text-gray-500">
            {product.description}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-baseline gap-3">
          <span className="tnum text-[32px] font-bold leading-none text-ink">
            {money(price)}
          </span>
          {price < product.price && (
            <span className="price-strike tnum text-[15px]">
              {money(product.price)}
            </span>
          )}
          {mrp > price && (
            <>
              <span className="price-strike tnum text-[15px]">{money(mrp)}</span>
              <span className="rounded-md bg-green-50 px-2 py-0.5 text-[12.5px] font-bold text-green-700">
                {off}% off
              </span>
            </>
          )}
        </div>
        <p className="mt-1 text-[12.5px] text-gray-500">
          Inclusive of all taxes
        </p>

        {/* The variations */}
        {names.length > 0 ? (
          <div className="mt-6 space-y-4 border-t border-gray-200 pt-6">
            {names.map((name) => (
              <div key={name}>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
                  {name}
                  {chosen[name] && (
                    <span className="ml-2 font-medium normal-case tracking-normal text-gray-500">
                      {chosen[name]}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(product.attributes[name] ?? []).map((value) => {
                    const state = availability(name, value);
                    const active = chosen[name] === value;
                    const soldOut = state === "out";
                    const missing = state === "none";
                    return (
                      <button
                        key={value}
                        type="button"
                        // An option that is not on the shelf can still be
                        // chosen — the shopper is shown its price and its
                        // photograph — but it cannot be bought. One that
                        // does not exist at all cannot be chosen.
                        disabled={missing}
                        aria-pressed={active}
                        onClick={() => pick(name, value)}
                        className={`rounded-lg border px-3.5 py-2 text-left text-[13.5px] font-medium transition-colors ${
                          active
                            ? "border-brand bg-brand-tint text-brand"
                            : "border-gray-200 bg-white hover:border-gray-400"
                        } ${soldOut ? "text-gray-500" : ""} ${
                          missing ? "cursor-not-allowed opacity-45" : ""
                        }`}
                      >
                        {value}
                        {(soldOut || missing) && (
                          <span className="ml-1.5 text-[11.5px] font-normal text-gray-500">
                            {missing ? "Not available" : "Sold out"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Options that have not been given attributes yet are listed by
             their own names, so a shopper can still choose between them. */
          product.variants.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
                Options
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const active = v.id === selectedId;
                  const soldOut = v.stock <= 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(v.id)}
                      className={`rounded-lg border px-3.5 py-2 text-left text-[13.5px] font-medium transition-colors ${
                        active
                          ? "border-brand bg-brand-tint text-brand"
                          : "border-gray-200 bg-white hover:border-gray-400"
                      } ${soldOut ? "text-gray-500" : ""}`}
                    >
                      {v.name}
                      {soldOut && (
                        <span className="ml-1.5 text-[11.5px] font-normal text-gray-500">
                          Sold out
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}

        <div className="mt-7 border-t border-gray-200 pt-6">
          <ProductPurchase
            product={product}
            variant={variant}
            backorderPolicy={backorderPolicy}
          />
        </div>

        {children}
      </div>
    </div>
  );
}
