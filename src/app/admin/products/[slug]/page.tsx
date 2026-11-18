import { notFound } from "next/navigation";
import { getCategories, getProduct } from "@/lib/queries";
import { listProductGallery } from "@/lib/admin";
import { listBrands, listCategories } from "@/lib/taxonomy-admin";
import { requirePermission } from "@/lib/guard";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { getReturnsEnabled, getReturnWindowDays } from "@/lib/settings";

export const metadata = { title: "Edit product" };

/**
 * The product editor.
 *
 * It opens as a sheet over the back office, so there is no page of its
 * own around it — the editor is the screen. The same page creates a
 * product and edits one: the address "new" means a product that has never
 * been saved, and any other address means the product with that address.
 */
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

  // The four are asked for together: the database is a long way off, and
  // asking one at a time makes the page as slow as the sum of them.
  const [categories, subcategories, brandRows, gallery, returnWindowDays, returnsEnabled] =
    await Promise.all([
      getCategories(),
      listCategories(),
      listBrands(),
      isNew ? Promise.resolve([]) : listProductGallery(slug),
      getReturnWindowDays(),
      getReturnsEnabled(),
    ]);

  // The brand names, once each. The back office may hold more than one row
  // for a name — a brand that was renamed and added back — and the picker
  // only wants the names.
  const brands = [...new Set(brandRows.map((b) => b.name))];

  return (
    <ProductEditor
      // The editor is made afresh for each product, so that what it holds
      // is always the product that is open — and never the one that was
      // open a moment ago.
      key={product?.slug ?? "new"}
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
              tags: product.tags ?? [],
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
      categories={categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        specFields: c.spec_fields,
      }))}
      subcategories={subcategories.flatMap((c) =>
        c.subcategories.map((s) => ({
          category_slug: c.slug,
          name: s.name,
        }))
      )}
      brands={brands}
      images={gallery}
      mainImage={product?.image ?? null}
      canSeeCost={user.role === "admin"}
      canManage={true}
      status={product?.status ?? "draft"}
      listed={product?.listed ?? true}
      variants={product?.variants ?? []}
      attributes={product?.attributes ?? {}}
      returnWindowDays={returnWindowDays}
      returnsEnabled={returnsEnabled}
    />
  );
}
