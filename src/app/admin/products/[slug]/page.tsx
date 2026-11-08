import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCategories, getProduct } from "@/lib/queries";
import { listProductGallery } from "@/lib/admin";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import { requirePermission } from "@/lib/guard";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { VariantManager } from "@/components/admin/VariantManager";
import { ProductListingToggle } from "@/components/admin/ProductListingToggle";
import { ProductStatusSelect } from "@/components/admin/ProductStatusSelect";
import { can } from "@/lib/roles";

export const metadata = { title: "Edit product" };

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
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6">
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Catalogue
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[26px] font-bold text-ink">
            {isNew ? "Add a product" : product!.name}
          </h1>
          {!isNew && (
            <div className="flex items-center gap-2">
              <ProductStatusSelect
                slug={product!.slug}
                status={product!.status}
              />
              <ProductListingToggle
                slug={product!.slug}
                listed={product!.listed}
              />
            </div>
          )}
        </div>
        {!isNew && (
          <p className="mt-1.5 text-[13px] text-gray-500">
            <Link
              href={`/product/${product!.slug}`}
              className="text-brand hover:underline"
            >
              View it in the shop
            </Link>
            {product!.sku && (
              <span className="ml-3 tnum text-gray-400">{product!.sku}</span>
            )}
          </p>
        )}
      </header>

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
        <VariantManager
          slug={product.slug}
          attributes={product.attributes}
          variants={product.variants}
          gallery={gallery}
          canManage={can(user.role, "catalog.manage")}
        />
      )}
    </div>
  );
}
