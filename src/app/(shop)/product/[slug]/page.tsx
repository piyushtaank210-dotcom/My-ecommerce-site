import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Truck, ShieldCheck, RotateCcw, Package } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductDetails } from "@/components/ProductDetails";
import { isOnSale } from "@/lib/product-status";
import { effectiveStock } from "@/lib/stock";
import { sellingPrice } from "@/lib/pricing";
import { ProductGrid } from "@/components/ProductGrid";
import {
  getProduct,
  getProductImages,
  getRelatedProducts,
  getCategory,
} from "@/lib/queries";
import { money, discountPct } from "@/lib/format";
import { getBackorderPolicy } from "@/lib/settings";
import { orderSpecs } from "@/lib/taxonomy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Not found" };
  const description =
    product.meta_description ?? product.short_desc ?? product.description ?? undefined;
  return {
    // The SEO title the back office wrote comes first; it is what the
    // owner wants shown in the results.
    title: product.seo_title ?? product.name,
    description,
    openGraph: {
      title: product.seo_title ?? product.name,
      description,
      images: product.image ? [product.image] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = getRelatedProducts(product, 4);
  const category = product.category_slug
    ? getCategory(product.category_slug)
    : null;
  const images = getProductImages(slug);
  const backorderPolicy = getBackorderPolicy();

  // The specifications, in the order the category asks for them.
  const specRows = orderSpecs(product.specs, category?.spec_fields ?? []);

  const weight = product.weight_grams
    ? `${(product.weight_grams / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`
    : null;
  const box = product.package_length
    ? [
        product.package_length,
        product.package_width,
        product.package_height,
      ]
        .filter((n): n is number => typeof n === "number")
        .join(" × ")
    : null;

  return (
    <div className="container-x py-8">
      <Breadcrumbs
        items={[
          ...(category
            ? [{ label: category.name, href: `/category/${category.slug}` }]
            : []),
          { label: product.name },
        ]}
      />

      {isOnSale(product) ? (
        <ProductDetails
          product={product}
          images={images}
          backorderPolicy={backorderPolicy}
        >
          {/* Specs. The category's own questions come first — a console is
              asked about its model, its storage and what is in the box — and
              anything else the administrator added follows. */}
          {specRows.length > 0 && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h2 className="mb-3 text-[15px] font-bold text-ink">Specifications</h2>
              <dl className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                {specRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-6 px-4 py-2.5">
                    <dt className="text-[13.5px] text-gray-500">{row.label}</dt>
                    <dd className="text-right text-[13.5px] font-medium text-ink">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Promise. The brand is the product's own, not a fixed one — the
              store carries more than one, and a Sony unit should read as
              Sony while anything else reads as what it actually is. */}
          <div className="mt-8 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            {[
              {
                Icon: ShieldCheck,
                text: `Genuine ${product.brand ?? "hardware"} stock with Indian warranty`,
              },
              { Icon: Truck, text: "Fast delivery, dispatched in 24 hours" },
              {
                Icon: RotateCcw,
                text:
                  product.returns ??
                  "7-day replacement on dead-on-arrival units",
              },
            ].map(({ Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-brand" />
                <span className="text-[13.5px] text-gray-600">{text}</span>
              </div>
            ))}
          </div>

          {/* Shipping — what it weighs and how big the box is, when the
              back office has filled them in. */}
          {(weight || box || product.warranty) && (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="mb-2.5 flex items-center gap-2 text-[13.5px] font-bold text-ink">
                <Package className="h-4 w-4 text-brand" />
                Shipping and warranty
              </h2>
              <dl className="space-y-1.5 text-[13px]">
                {weight && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Weight</dt>
                    <dd className="font-medium text-ink">{weight}</dd>
                  </div>
                )}
                {box && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Package</dt>
                    <dd className="tnum font-medium text-ink">{box} cm</dd>
                  </div>
                )}
                {product.warranty && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-gray-500">Warranty</dt>
                    <dd className="text-right font-medium text-ink">
                      {product.warranty}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </ProductDetails>
      ) : (
        <div className="mx-auto grid max-w-[1600px] gap-10 lg:grid-cols-2">
          <div />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-[15px] font-bold text-amber-900">
              {product.status === "draft"
                ? "Not on sale yet"
                : "No longer on sale"}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-amber-800">
              {product.status === "draft"
                ? "This product has not been published yet. It may be on sale soon — get in touch and we will let you know."
                : "This product has been taken off the shop floor. It may come back — get in touch and we will let you know."}
            </p>
            <Link href="/contact" className="btn btn-outline btn-sm mt-4">
              Ask about this product
            </Link>
          </div>
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-[20px] font-bold text-ink">
            You might also like
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
