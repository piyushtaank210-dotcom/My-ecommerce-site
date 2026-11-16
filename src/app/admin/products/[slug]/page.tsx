import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getCategories, getProduct } from "@/lib/queries";
import { listProductGallery } from "@/lib/admin";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import { requirePermission } from "@/lib/guard";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { VariantManager } from "@/components/admin/VariantManager";
import { ProductListingToggle } from "@/components/admin/ProductListingToggle";
import { ProductStatusSelect } from "@/components/admin/ProductStatusSelect";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SectionNav } from "@/components/admin/ui/SectionNav";
import { can } from "@/lib/roles";

export const metadata = { title: "Edit product" };

/**
 * The sections of the product editor, in the order they are read.
 *
 * The navigation beside the form lists them, and marks the one being
 * read. The variations have a place of their own at the end, because
 * they are managed through their own actions rather than through the
 * product's own save.
 */
const SECTIONS = [
  { id: "section-basic", label: "Basic information", icon: "text" },
  { id: "section-media", label: "Media", icon: "image" },
  { id: "section-pricing", label: "Pricing and stock", icon: "money" },
  { id: "section-specs", label: "Specifications", icon: "list" },
  { id: "section-shipping", label: "Shipping and warranty", icon: "truck" },
  { id: "section-seo", label: "Search and accessibility", icon: "search" },
  { id: "section-publishing", label: "Publishing", icon: "upload" },
];

/**
 * The variations have a place of their own at the end, because they are
 * managed through their own actions rather than through the product's own
 * save. A product that does not exist yet has no options, so the section
 * is not offered.
 */
const VARIATIONS_SECTION = {
  id: "section-variations",
  label: "Variations",
  icon: "boxes",
};

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requirePermission("catalog.manage");
  const { slug } = await params;

  const isNew = slug === "new";
  const product = isNew ? null : (await getProduct(slug));
  if (!isNew && !product) notFound();

  const categories = (await getCategories()).map((c) => ({
    slug: c.slug,
    name: c.name,
    specFields: c.spec_fields,
  }));
  const subcategories = (await listCategories()).flatMap((c) =>
    c.subcategories.map((s) => ({
      category_slug: c.slug,
      name: s.name,
    }))
  );
  // The brand names, once each. The back office may hold more than one row
  // for a name — a brand that was renamed and added back — and the picker
  // only wants the names.
  const brands = [...new Set((await listBrands()).map((b) => b.name))];

  const gallery = isNew ? [] : (await listProductGallery(slug));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Catalogue" }}
        eyebrow={isNew ? "Catalogue" : "Catalogue · Editing"}
        title={isNew ? "Add a product" : product!.name}
        description={
          isNew
            ? "Everything the shop needs to know about a product, in the order it is thought about. Nothing is published until you say so."
            : "Everything the shop knows about this product. Save it when you are done — the changes go out with the shop."
        }
        meta={
          !isNew && (
            <>
              {product!.sku && (
                <span className="tnum">SKU {product!.sku}</span>
              )}
              <Link
                href={`/product/${product!.slug}`}
                className="admin-links"
                target="_blank"
                rel="noreferrer"
              >
                View it in the shop
                <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          )
        }
        actions={
          !isNew && (
            <div className="flex items-center gap-2">
              <ProductStatusSelect slug={product!.slug} status={product!.status} />
              <ProductListingToggle slug={product!.slug} listed={product!.listed} />
            </div>
          )
        }
      />

      <div className="admin-editor">
        <SectionNav
          sections={isNew ? SECTIONS : [...SECTIONS, VARIATIONS_SECTION]}
        />

        <div className="admin-editor-body">
          <ProductEditor
            product={
              product
                ? {
                    slug: product.slug,
                    sku: product.sku ?? "",
                    name: product.name,
                    brand: product.brand ?? "",
                    category_slug: product.category_slug ?? "",
                    subcategory: product.subcategory ?? "",
                    model_number: product.model_number ?? "",
                    condition: product.condition,
                    short_desc: product.short_desc ?? "",
                    description: product.description ?? "",
                    price: product.price,
                    mrp: product.mrp,
                    sale_price: product.sale_price,
                    purchase_cost: product.purchase_cost,
                    stock: product.stock,
                    low_stock_threshold: product.low_stock_threshold,
                    options: product.variants.map((v) => ({
                      id: v.id,
                      name: v.name,
                      stock: v.stock,
                      low_stock_threshold: v.low_stock_threshold,
                    })),
                    badge: product.badge ?? "",
                    specs: Object.entries(product.specs).map(([label, value]) => ({
                      label,
                      value,
                    })),
                    image_alt: product.image_alt ?? "",
                    seo_title: product.seo_title ?? "",
                    meta_description: product.meta_description ?? "",
                    weight_grams: product.weight_grams,
                    package_length: product.package_length,
                    package_width: product.package_width,
                    package_height: product.package_height,
                    warranty: product.warranty ?? "",
                    returns: product.returns ?? "",
                  }
                : null
            }
            categories={categories}
            subcategories={subcategories}
            brands={brands}
            images={gallery}
            mainImage={product?.image ?? null}
            canSeeCost={user.role === "admin"}
            status={product?.status ?? "draft"}
          />

          {!isNew && product && (
            <div id="section-variations" className="scroll-mt-24">
              <VariantManager
                slug={product.slug}
                attributes={product.attributes}
                variants={product.variants}
                gallery={gallery}
                canManage={can(user.role, "catalog.manage")}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
