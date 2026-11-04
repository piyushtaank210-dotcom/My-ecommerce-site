"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Eye,
  Lock,
  Upload,
} from "lucide-react";
import { saveProductAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";
import { ProductImages } from "./ProductImages";
import { ProductSpecs, type SpecRow } from "./ProductSpecs";
import { money, discountPct } from "@/lib/format";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock";
import type { ProductCondition, ProductImage } from "@/lib/types";
import { PRODUCT_CONDITIONS, PRODUCT_CONDITION_LABEL } from "@/lib/types";

const initial: PanelState = { ok: false };

export type ProductForm = {
  slug: string;
  sku: string;
  name: string;
  brand: string;
  category_slug: string;
  subcategory: string;
  model_number: string;
  condition: ProductCondition;
  short_desc: string;
  description: string;
  price: number;
  mrp: number;
  sale_price: number | null;
  purchase_cost: number | null;
  stock: number;
  /** The number at or below which this counts as low on stock. */
  low_stock_threshold: number;
  /**
   * The options this product is stocked by, when it has any.
   *
   * A product with options is counted one option at a time, so the options'
   * own stock is what is really on the shelf.
   */
  options: {
    id: string;
    name: string;
    stock: number;
    low_stock_threshold: number;
  }[];
  badge: string;
  specs: SpecRow[];
  image_alt: string;
  seo_title: string;
  meta_description: string;
  weight_grams: number | null;
  package_length: number | null;
  package_width: number | null;
  package_height: number | null;
  warranty: string;
  returns: string;
};

/** What a category is, and what it asks its products about. */
export type CategoryOption = {
  slug: string;
  name: string;
  /** The specification fields every product in this category is asked about. */
  specFields: string[];
};

/** A category inside a category. */
export type SubcategoryOption = {
  category_slug: string;
  name: string;
};

/** The address of a product, the way the shop writes them. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The catalogue editor.
 *
 * The same form creates a product and edits one — the slug decides which,
 * and an existing slug is edited in place. It is laid out in the order a
 * product is actually thought about: what it is, what it looks like, what
 * it costs, what is in the box, how it ships, how it is found, and whether
 * it goes on sale.
 */
export function ProductEditor({
  product,
  categories,
  subcategories,
  brands,
  images,
  mainImage,
  canSeeCost,
  status,
}: {
  product: ProductForm | null;
  categories: CategoryOption[];
  /** The categories inside the categories, for the category that is chosen. */
  subcategories: SubcategoryOption[];
  /** The brands the store sells. */
  brands: string[];
  images: ProductImage[];
  mainImage: string | null;
  /** Only an administrator ever sees what the store paid for a product. */
  canSeeCost: boolean;
  status: "draft" | "published" | "archived";
}) {
  const [state, formAction] = useActionState(saveProductAction, initial);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);
  const isNew = !product;

  // The name and the address follow each other until somebody edits the
  // address by hand. An existing product's address never changes.
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);

  // The prices are held here so the discount can be worked out as they are
  // typed, rather than after the form is saved.
  const [price, setPrice] = useState(product?.price ?? 0);
  const [mrp, setMrp] = useState(product?.mrp ?? 0);
  const [salePrice, setSalePrice] = useState(product?.sale_price ?? 0);

  const [seoTitle, setSeoTitle] = useState(product?.seo_title ?? "");
  const [metaDescription, setMetaDescription] = useState(
    product?.meta_description ?? ""
  );

  /**
   * The category the product is in.
   *
   * It is held here rather than left to the select, because the category
   * decides which specifications the product is asked about — and the
   * administrator should see those change the moment they pick a different
   * category.
   */
  const [categorySlug, setCategorySlug] = useState(
    product?.category_slug ?? categories[0]?.slug ?? ""
  );
  const category = categories.find((c) => c.slug === categorySlug);
  const categoryFields = category?.specFields ?? [];
  const categorySubcategories = subcategories.filter(
    (s) => s.category_slug === categorySlug
  );

  /**
   * The specifications that are not one of the category's own fields.
   *
   * The category's fields are shown on their own above the free-form
   * table, so a specification is never asked for twice.
   */
  const otherSpecs = (product?.specs ?? []).filter(
    (s) =>
      !categoryFields.some(
        (field) => field.toLowerCase() === s.label.toLowerCase()
      )
  );

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (!state.ok) return;
    // A product that has just been created has an address now, so the
    // form becomes the editor for it.
    if (isNew && state.href) router.push(state.href);
    else router.refresh();
  }, [state, router, isNew]);

  const errors = state.errors ?? {};
  const err = (field: string) =>
    errors[field] ? (
      <p className="mt-1 text-[12.5px] text-red-600">{errors[field]}</p>
    ) : null;

  // A product with options is stocked by its options, so the product's own
  // count is not the one that reaches a customer.
  const hasOptions = (product?.options.length ?? 0) > 0;

  // What the customer pays, and how much that is off the MRP.
  const now = salePrice > 0 ? salePrice : price;
  const off = discountPct(mrp, now);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Basic information ------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-bold text-ink">Basic information</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="label">
                Product name
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="PlayStation 5 Slim — Disc Edition 1TB"
                className={`input ${errors.name ? "input-error" : ""}`}
              />
              {err("name")}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="brand" className="label">
                  Brand
                </label>
                <input
                  id="brand"
                  name="brand"
                  defaultValue={product?.brand ?? ""}
                  placeholder="Sony"
                  list="pf-brands"
                  className="input"
                />
                <datalist id="pf-brands">
                  {brands.map((b) => (
                    <option key={`brand-${b}`} value={b} />
                  ))}
                </datalist>
                <p className="mt-1 text-[12px] text-gray-500">
                  Pick one the store already sells, or type a new one.
                </p>
              </div>
              <div>
                <label htmlFor="category" className="label">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value)}
                  className="input cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {err("category")}
              </div>
              <div>
                <label htmlFor="subcategory" className="label">
                  Subcategory
                </label>
                <input
                  id="subcategory"
                  name="subcategory"
                  defaultValue={product?.subcategory ?? ""}
                  placeholder="PS5"
                  list="pf-subcategories"
                  className="input"
                />
                <datalist id="pf-subcategories">
                  {categorySubcategories.map((s) => (
                    <option key={`sub-${s.name}`} value={s.name} />
                  ))}
                </datalist>
                <p className="mt-1 text-[12px] text-gray-500">
                  A short label under the category.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sku" className="label">
                  SKU
                </label>
                <input
                  id="sku"
                  name="sku"
                  defaultValue={product?.sku ?? ""}
                  placeholder="PLAYSTATION-5-SLIM-DISC-1TB"
                  className={`input tnum ${errors.sku ? "input-error" : ""}`}
                />
                {err("sku")}
                <p className="mt-1 text-[12px] text-gray-500">
                  {isNew
                    ? "Leave it blank and one is generated from the address. It has to be unique."
                    : "The product's own code. It has to be unique across the catalogue."}
                </p>
              </div>
              <div>
                <label htmlFor="modelNumber" className="label">
                  Model number
                </label>
                <input
                  id="modelNumber"
                  name="modelNumber"
                  defaultValue={product?.model_number ?? ""}
                  placeholder="CFI-2016A"
                  className="input tnum"
                />
                <p className="mt-1 text-[12px] text-gray-500">
                  The maker's own model number, for the ones that have one.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="condition" className="label">
                  Condition
                </label>
                <select
                  id="condition"
                  name="condition"
                  defaultValue={product?.condition ?? "new"}
                  className="input cursor-pointer"
                >
                  {PRODUCT_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {PRODUCT_CONDITION_LABEL[c]}
                    </option>
                  ))}
                </select>
                {err("condition")}
              </div>
              <div>
                <label htmlFor="badge" className="label">
                  Badge
                </label>
                <input
                  id="badge"
                  name="badge"
                  defaultValue={product?.badge ?? ""}
                  placeholder="New, Pro, Official Store…"
                  className="input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="shortDesc" className="label">
                Short description
              </label>
              <textarea
                id="shortDesc"
                name="shortDesc"
                rows={2}
                defaultValue={product?.short_desc ?? ""}
                placeholder="One or two lines for the product card."
                className="input resize-none"
              />
              <p className="mt-1 text-[12px] text-gray-500">
                This is what the card and the search result show.
              </p>
            </div>

            <div>
              <label htmlFor="description" className="label">
                Full description
              </label>
              <textarea
                id="description"
                name="description"
                rows={6}
                defaultValue={product?.description ?? ""}
                placeholder="The whole story: what it is, what it does, who it is for."
                className="input resize-y"
              />
              <p className="mt-1 text-[12px] text-gray-500">
                Shown on the product page under the name.
              </p>
            </div>
          </div>
        </section>

        {/* 2. Product images ---------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-bold text-ink">Product images</h2>
          <p className="mb-4 text-[12.5px] text-gray-500">
            The first photograph is the one the shop shows on its cards. The
            rest appear as a gallery on the product page.
          </p>
          <ProductImages
            slug={slug}
            images={images}
            mainPath={mainImage}
          />
        </section>

        {/* 3. Pricing ----------------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-[15px] font-bold text-ink">Pricing</h2>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="price" className="label">
                  Selling price (₹)
                </label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  min={0}
                  step={1}
                  value={price || ""}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className={`input tnum ${errors.price ? "input-error" : ""}`}
                />
                {err("price")}
              </div>
              <div>
                <label htmlFor="mrp" className="label">
                  MRP (₹)
                </label>
                <input
                  id="mrp"
                  name="mrp"
                  type="number"
                  min={0}
                  step={1}
                  value={mrp || ""}
                  onChange={(e) => setMrp(Number(e.target.value))}
                  className={`input tnum ${errors.mrp ? "input-error" : ""}`}
                />
                {err("mrp")}
              </div>
            </div>

            <div>
              <label htmlFor="salePrice" className="label">
                Sale price (₹)
              </label>
              <input
                id="salePrice"
                name="salePrice"
                type="number"
                min={0}
                step={1}
                value={salePrice || ""}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                placeholder="Leave blank for no sale"
                className={`input tnum ${errors.salePrice ? "input-error" : ""}`}
              />
              {err("salePrice")}
              <p className="mt-1 text-[12px] text-gray-500">
                Optional. While it is set, this is what the product sells for.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {canSeeCost && (
                <div>
                  <label htmlFor="purchaseCost" className="label">
                    Purchase cost (₹)
                  </label>
                  <input
                    id="purchaseCost"
                    name="purchaseCost"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={product?.purchase_cost ?? ""}
                    className={`input tnum ${errors.purchaseCost ? "input-error" : ""}`}
                  />
                  {err("purchaseCost")}
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-gray-500">
                    <Lock className="h-3 w-3" />
                    Only an administrator sees this.
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="lowStockThreshold" className="label">
                  Low-stock threshold
                </label>
                <input
                  id="lowStockThreshold"
                  name="lowStockThreshold"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={
                    product?.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD
                  }
                  className={`input tnum ${errors.lowStockThreshold ? "input-error" : ""}`}
                />
                {err("lowStockThreshold")}
                <p className="mt-1 text-[12px] text-gray-500">
                  At or below this many units, the product counts as low and
                  appears on the dashboard.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="stock" className="label">
                Stock
              </label>
              {hasOptions ? (
                <>
                  <input
                    id="stock"
                    name="stock"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={product?.stock ?? 0}
                    disabled
                    readOnly
                    className="input tnum cursor-not-allowed bg-gray-50 text-gray-500"
                  />
                  <p className="mt-1 text-[12px] text-gray-500">
                    This product is stocked by its options, each counted
                    separately. Change an option&apos;s stock in the{" "}
                    <span className="font-medium text-ink">Variations</span>{" "}
                    section below.
                  </p>
                </>
              ) : (
                <>
                  <input
                    id="stock"
                    name="stock"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={product?.stock ?? 0}
                    className={`input tnum ${errors.stock ? "input-error" : ""}`}
                  />
                  {err("stock")}
                  <p className="mt-1 text-[12px] text-gray-500">
                    The number on the shelf. Changing it is recorded in the
                    inventory history.
                  </p>
                </>
              )}
            </div>

            {hasOptions && (
              <div>
                <span className="label">Options and their stock</span>
                <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                  {product!.options.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5"
                    >
                      <span className="truncate text-[13px] font-medium text-ink">
                        {o.name}
                      </span>
                      <span className="tnum shrink-0 text-[12.5px] text-gray-500">
                        {o.stock} in stock · low at {o.low_stock_threshold}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-gray-500">
                  Each option is counted on its own. Their prices, stock,
                  codes and photographs are managed in the{" "}
                  <span className="font-medium text-ink">Variations</span>{" "}
                  section below, which records why each change was made.
                </p>
              </div>
            )}

            {off > 0 && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-[13px] font-medium text-green-700">
                Saves {money(mrp - now)} — {off}% off the MRP of {money(mrp)}.
              </p>
            )}
          </div>
        </section>

        {/* 4. Specifications ----------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-[15px] font-bold text-ink">
            Product specifications
          </h2>
          <p className="mb-4 text-[12.5px] text-gray-500">
            {categoryFields.length > 0
              ? `What a ${category?.name ?? "product"} is asked about, and anything else worth saying about this one.`
              : "The table on the product page. A row with no name is not saved."}
          </p>

          {/* The category's own fields */}
          {categoryFields.length > 0 && (
            <div className="mb-5 rounded-lg border border-brand/30 bg-brand-tint/30 p-4">
              <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-brand">
                {category?.name} specifications
              </p>
              <div className="space-y-2">
                {categoryFields.map((field) => {
                  const existing = (product?.specs ?? []).find(
                    (s) => s.label.toLowerCase() === field.toLowerCase()
                  );
                  return (
                    <div key={field} className="grid items-center gap-2 sm:grid-cols-[190px_1fr]">
                      {/* The name is the category's, so it is carried through
                          the form rather than typed. */}
                      <input type="hidden" name="categorySpecLabel" value={field} />
                      <label
                        htmlFor={`spec-${field}`}
                        className="text-[13px] font-medium text-ink"
                      >
                        {field}
                      </label>
                      <input
                        id={`spec-${field}`}
                        name="categorySpecValue"
                        defaultValue={existing?.value ?? ""}
                        placeholder={field}
                        className="input h-9 text-[13px]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ProductSpecs key={categorySlug} specs={otherSpecs} />
        </section>

        {/* 5. Shipping and warranty ---------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-bold text-ink">
            Shipping and warranty
          </h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="weightGrams" className="label">
                Weight (grams)
              </label>
              <input
                id="weightGrams"
                name="weightGrams"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.weight_grams ?? ""}
                className={`input tnum ${errors.weightGrams ? "input-error" : ""}`}
              />
              {err("weightGrams")}
            </div>
            <div>
              <label htmlFor="packageLength" className="label">
                Length (cm)
              </label>
              <input
                id="packageLength"
                name="packageLength"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_length ?? ""}
                className={`input tnum ${errors.packageLength ? "input-error" : ""}`}
              />
              {err("packageLength")}
            </div>
            <div>
              <label htmlFor="packageWidth" className="label">
                Width (cm)
              </label>
              <input
                id="packageWidth"
                name="packageWidth"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_width ?? ""}
                className={`input tnum ${errors.packageWidth ? "input-error" : ""}`}
              />
              {err("packageWidth")}
            </div>
            <div>
              <label htmlFor="packageHeight" className="label">
                Height (cm)
              </label>
              <input
                id="packageHeight"
                name="packageHeight"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_height ?? ""}
                className={`input tnum ${errors.packageHeight ? "input-error" : ""}`}
              />
              {err("packageHeight")}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="warranty" className="label">
                Warranty
              </label>
              <input
                id="warranty"
                name="warranty"
                defaultValue={product?.warranty ?? ""}
                placeholder="1 year manufacturer warranty"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="returns" className="label">
                Returns
              </label>
              <input
                id="returns"
                name="returns"
                defaultValue={product?.returns ?? ""}
                placeholder="7-day replacement on dead-on-arrival units"
                className="input"
              />
            </div>
          </div>
        </section>

        {/* 6. SEO ----------------------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-bold text-ink">SEO</h2>
          <p className="mb-4 text-[12.5px] text-gray-500">
            What a search engine and a screen reader are told about this
            product. Left blank, the shop uses the product's own name and
            description.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="seoTitle" className="label">
                SEO title
              </label>
              <input
                id="seoTitle"
                name="seoTitle"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="PlayStation 5 Slim 1TB Console"
                className={`input ${errors.seoTitle ? "input-error" : ""}`}
              />
              <p className="mt-1 text-[12px] text-gray-500">
                {seoTitle.length}/70 characters
              </p>
              {err("seoTitle")}
            </div>

            <div>
              <label htmlFor="metaDescription" className="label">
                Meta description
              </label>
              <textarea
                id="metaDescription"
                name="metaDescription"
                rows={2}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="One or two lines describing the product for a search result."
                className={`input resize-none ${errors.metaDescription ? "input-error" : ""}`}
              />
              <p className="mt-1 text-[12px] text-gray-500">
                {metaDescription.length}/160 characters
              </p>
              {err("metaDescription")}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="slug" className="label">
                  URL slug
                </label>
                <input
                  id="slug"
                  name="slug"
                  value={slug}
                  readOnly={!isNew}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="playstation-5-slim-disc-1tb"
                  className={`input ${isNew ? "" : "bg-gray-50 text-gray-500"} ${
                    errors.slug ? "input-error" : ""
                  }`}
                />
                {err("slug")}
                <p className="mt-1 text-[12px] text-gray-500">
                  {isNew
                    ? "Lower case, dashes instead of spaces. Becomes the product's address."
                    : "The address cannot change once the product exists."}
                </p>
              </div>
              <div>
                <label htmlFor="imageAlt" className="label">
                  Image alt text
                </label>
                <input
                  id="imageAlt"
                  name="imageAlt"
                  defaultValue={product?.image_alt ?? ""}
                  placeholder="A PlayStation 5 Slim console standing upright"
                  className="input"
                />
                <p className="mt-1 text-[12px] text-gray-500">
                  What a screen reader reads for the main photograph.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Publishing ---------------------------------------------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-bold text-ink">Publishing</h2>
          <p className="mb-4 text-[12.5px] text-gray-500">
            This product is currently{" "}
            <span className="font-semibold text-ink">
              {status === "published"
                ? "published"
                : status === "draft"
                  ? "a draft"
                  : "archived"}
            </span>
            . Saving a draft keeps it off the shop; publishing puts it on sale.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              name="intent"
              value="publish"
              className="btn btn-primary"
            >
              <Upload className="h-4 w-4" />
              Publish product
            </button>

            {!isNew && (
              <button
                type="submit"
                name="intent"
                value="keep"
                className="btn btn-outline"
              >
                <Save className="h-4 w-4" />
                Save changes
              </button>
            )}

            <button
              type="submit"
              name="intent"
              value="draft"
              className="btn btn-outline"
            >
              Save as draft
            </button>

            {isNew ? (
              <button
                type="button"
                disabled
                title="Save the product first, then you can see it in the shop."
                className="btn btn-ghost"
              >
                <Eye className="h-4 w-4" />
                Preview product
              </button>
            ) : (
              <Link
                href={`/product/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                <Eye className="h-4 w-4" />
                Preview product
              </Link>
            )}

            <Link href="/admin/products" className="btn btn-ghost ml-auto">
              <ArrowLeft className="h-4 w-4" />
              Back to catalogue
            </Link>
          </div>
        </section>
      </div>
    </form>
  );
}
