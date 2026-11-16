"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Eye,
  Upload,
  Info,
} from "lucide-react";
import { saveProductAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";
import { ProductImages } from "./ProductImages";
import { ProductSpecs, type SpecRow } from "./ProductSpecs";
import { money, discountPct } from "@/lib/format";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock";
import type { ProductCondition, ProductImage } from "@/lib/types";
import { PRODUCT_CONDITIONS, PRODUCT_CONDITION_LABEL } from "@/lib/types";
import { Field } from "./ui/Field";

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
  const err = (field: string) => errors[field];

  // A product with options is stocked by its options, so the product's own
  // count is not the one that reaches a customer.
  const hasOptions = (product?.options.length ?? 0) > 0;

  // What the customer pays, and how much that is off the MRP.
  const now = salePrice > 0 ? salePrice : price;
  const off = discountPct(mrp, now);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && !state.ok && (
        <p role="alert" className="admin-notice admin-notice--bad">
          <Info className="admin-notice-icon h-4 w-4" />
          <span>{state.message}</span>
        </p>
      )}

      {/* 1. Basic information ------------------------------------- */}
      <section id="section-basic" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Basic information</h2>
            <p className="admin-panel-sub">
              What the product is called, who makes it, and where it sits in
              the catalogue.
            </p>
          </div>
        </div>
        <div className="admin-panel-body space-y-5">
          <Field
            label="Product name"
            htmlFor="name"
            required
            error={err("name")}
          >
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PlayStation 5 Slim — Disc Edition 1TB"
              className={`input ${errors.name ? "input-error" : ""}`}
            />
          </Field>

          <div className="admin-field-grid admin-field-grid--3">
            <Field
              label="Brand"
              htmlFor="brand"
              hint="Pick one the store already sells, or type a new one."
            >
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
            </Field>
            <Field label="Category" htmlFor="category" error={err("category")}>
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
            </Field>
            <Field
              label="Subcategory"
              htmlFor="subcategory"
              hint="A short label under the category."
            >
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
            </Field>
          </div>

          <div className="admin-field-grid">
            <Field
              label="SKU"
              htmlFor="sku"
              error={err("sku")}
              hint={
                isNew
                  ? "Leave it blank and one is generated from the address. It has to be unique."
                  : "The product's own code. It has to be unique across the catalogue."
              }
            >
              <input
                id="sku"
                name="sku"
                defaultValue={product?.sku ?? ""}
                placeholder="PLAYSTATION-5-SLIM-DISC-1TB"
                className={`input tnum ${errors.sku ? "input-error" : ""}`}
              />
            </Field>
            <Field
              label="Model number"
              htmlFor="modelNumber"
              hint="The maker's own model number, for the ones that have one."
            >
              <input
                id="modelNumber"
                name="modelNumber"
                defaultValue={product?.model_number ?? ""}
                placeholder="CFI-2016A"
                className="input tnum"
              />
            </Field>
          </div>

          <div className="admin-field-grid">
            <Field label="Condition" htmlFor="condition" error={err("condition")}>
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
            </Field>
            <Field
              label="Badge"
              htmlFor="badge"
              hint="A short mark shown on the product card."
            >
              <input
                id="badge"
                name="badge"
                defaultValue={product?.badge ?? ""}
                placeholder="New, Pro, Official Store…"
                className="input"
              />
            </Field>
          </div>

          <Field
            label="Short description"
            htmlFor="shortDesc"
            hint="This is what the card and the search result show."
          >
            <textarea
              id="shortDesc"
              name="shortDesc"
              rows={2}
              defaultValue={product?.short_desc ?? ""}
              placeholder="One or two lines for the product card."
              className="input resize-none"
            />
          </Field>

          <Field
            label="Full description"
            htmlFor="description"
            hint="Shown on the product page under the name."
          >
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={product?.description ?? ""}
              placeholder="The whole story: what it is, what it does, who it is for."
              className="input resize-y"
            />
          </Field>
        </div>
      </section>

      {/* 2. Product images ---------------------------------------- */}
      <section id="section-media" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Product media</h2>
            <p className="admin-panel-sub">
              The first photograph is the one the shop shows on its cards.
              The rest appear as a gallery on the product page.
            </p>
          </div>
        </div>
        <div className="admin-panel-body">
          <ProductImages slug={slug} images={images} mainPath={mainImage} />
        </div>
      </section>

      {/* 3. Pricing and stock -------------------------------------- */}
      <section id="section-pricing" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Pricing and stock</h2>
            <p className="admin-panel-sub">
              What the customer pays, what the store pays, and how many are
              on the shelf.
            </p>
          </div>
        </div>
        <div className="admin-panel-body space-y-5">
          <div className="admin-field-grid admin-field-grid--3">
            <Field label="Selling price (₹)" htmlFor="price" error={err("price")}>
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
            </Field>
            <Field label="MRP (₹)" htmlFor="mrp" error={err("mrp")}>
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
            </Field>
            <Field
              label="Sale price (₹)"
              htmlFor="salePrice"
              error={err("salePrice")}
              hint="Optional. While it is set, this is what the product sells for."
            >
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
            </Field>
          </div>

          {off > 0 && (
            <p className="admin-notice admin-notice--good">
              <Info className="admin-notice-icon h-4 w-4" />
              <span>
                Saves {money(mrp - now)} — {off}% off the MRP of {money(mrp)}.
              </span>
            </p>
          )}

          <div className="admin-field-grid">
            {canSeeCost && (
              <Field
                label="Purchase cost (₹)"
                htmlFor="purchaseCost"
                error={err("purchaseCost")}
                hint="Only an administrator sees this."
              >
                <input
                  id="purchaseCost"
                  name="purchaseCost"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={product?.purchase_cost ?? ""}
                  className={`input tnum ${errors.purchaseCost ? "input-error" : ""}`}
                />
              </Field>
            )}
            <Field
              label="Low-stock threshold"
              htmlFor="lowStockThreshold"
              error={err("lowStockThreshold")}
              hint="At or below this many units, the product counts as low and appears on the dashboard."
            >
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
            </Field>
          </div>

          <Field
            label="Stock"
            htmlFor="stock"
            error={err("stock")}
            hint={
              hasOptions
                ? undefined
                : "The number on the shelf. Changing it is recorded in the inventory history."
            }
          >
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
                <p className="admin-hint">
                  This product is stocked by its options, each counted
                  separately. Change an option&apos;s stock in the{" "}
                  <span className="admin-strong">Variations</span> section below.
                </p>
              </>
            ) : (
              <input
                id="stock"
                name="stock"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.stock ?? 0}
                className={`input tnum ${errors.stock ? "input-error" : ""}`}
              />
            )}
          </Field>

          {hasOptions && (
            <div>
              <span className="admin-label">Options and their stock</span>
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
              <p className="admin-hint">
                Each option is counted on its own. Their prices, stock, codes
                and photographs are managed in the{" "}
                <span className="admin-strong">Variations</span> section below,
                which records why each change was made.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 4. Specifications ----------------------------------------- */}
      <section id="section-specs" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Product specifications</h2>
            <p className="admin-panel-sub">
              {categoryFields.length > 0
                ? `What a ${category?.name ?? "product"} is asked about, and anything else worth saying about this one.`
                : "The table on the product page. A row with no name is not saved."}
            </p>
          </div>
        </div>
        <div className="admin-panel-body">
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
                    <div
                      key={field}
                      className="grid items-center gap-2 sm:grid-cols-[190px_1fr]"
                    >
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
        </div>
      </section>

      {/* 5. Shipping and warranty ---------------------------------- */}
      <section id="section-shipping" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Shipping and warranty</h2>
            <p className="admin-panel-sub">
              How big it is, how it travels, and what is promised with it.
            </p>
          </div>
        </div>
        <div className="admin-panel-body space-y-5">
          <div className="admin-field-grid admin-field-grid--4">
            <Field
              label="Weight (grams)"
              htmlFor="weightGrams"
              error={err("weightGrams")}
            >
              <input
                id="weightGrams"
                name="weightGrams"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.weight_grams ?? ""}
                className={`input tnum ${errors.weightGrams ? "input-error" : ""}`}
              />
            </Field>
            <Field
              label="Length (cm)"
              htmlFor="packageLength"
              error={err("packageLength")}
            >
              <input
                id="packageLength"
                name="packageLength"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_length ?? ""}
                className={`input tnum ${errors.packageLength ? "input-error" : ""}`}
              />
            </Field>
            <Field
              label="Width (cm)"
              htmlFor="packageWidth"
              error={err("packageWidth")}
            >
              <input
                id="packageWidth"
                name="packageWidth"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_width ?? ""}
                className={`input tnum ${errors.packageWidth ? "input-error" : ""}`}
              />
            </Field>
            <Field
              label="Height (cm)"
              htmlFor="packageHeight"
              error={err("packageHeight")}
            >
              <input
                id="packageHeight"
                name="packageHeight"
                type="number"
                min={0}
                step={1}
                defaultValue={product?.package_height ?? ""}
                className={`input tnum ${errors.packageHeight ? "input-error" : ""}`}
              />
            </Field>
          </div>

          <div className="admin-field-grid">
            <Field
              label="Warranty"
              htmlFor="warranty"
              hint="What the maker promises, in the shop's own words."
            >
              <input
                id="warranty"
                name="warranty"
                defaultValue={product?.warranty ?? ""}
                placeholder="1 year manufacturer warranty"
                className="input"
              />
            </Field>
            <Field
              label="Returns"
              htmlFor="returns"
              hint="What the shop does if something goes wrong."
            >
              <input
                id="returns"
                name="returns"
                defaultValue={product?.returns ?? ""}
                placeholder="7-day replacement on dead-on-arrival units"
                className="input"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* 6. SEO ----------------------------------------------------- */}
      <section id="section-seo" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Search and accessibility</h2>
            <p className="admin-panel-sub">
              What a search engine and a screen reader are told about this
              product. Left blank, the shop uses the product&apos;s own name
              and description.
            </p>
          </div>
        </div>
        <div className="admin-panel-body space-y-5">
          <Field
            label="SEO title"
            htmlFor="seoTitle"
            error={err("seoTitle")}
            hint={`${seoTitle.length}/70 characters`}
          >
            <input
              id="seoTitle"
              name="seoTitle"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="PlayStation 5 Slim 1TB Console"
              className={`input ${errors.seoTitle ? "input-error" : ""}`}
            />
          </Field>

          <Field
            label="Meta description"
            htmlFor="metaDescription"
            error={err("metaDescription")}
            hint={`${metaDescription.length}/160 characters`}
          >
            <textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="One or two lines describing the product for a search result."
              className={`input resize-none ${errors.metaDescription ? "input-error" : ""}`}
            />
          </Field>

          <div className="admin-field-grid">
            <Field
              label="URL slug"
              htmlFor="slug"
              error={err("slug")}
              hint={
                isNew
                  ? "Lower case, dashes instead of spaces. Becomes the product's address."
                  : "The address cannot change once the product exists."
              }
            >
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
            </Field>
            <Field
              label="Image alt text"
              htmlFor="imageAlt"
              hint="What a screen reader reads for the main photograph."
            >
              <input
                id="imageAlt"
                name="imageAlt"
                defaultValue={product?.image_alt ?? ""}
                placeholder="A PlayStation 5 Slim console standing upright"
                className="input"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* 7. Publishing ---------------------------------------------- */}
      <section id="section-publishing" className="admin-panel scroll-mt-24">
        <div className="admin-panel-head">
          <div>
            <h2 className="admin-panel-title">Publishing</h2>
            <p className="admin-panel-sub">
              This product is currently{" "}
              <span className="admin-strong">
                {status === "published"
                  ? "published"
                  : status === "draft"
                    ? "a draft"
                    : "archived"}
              </span>
              . Saving a draft keeps it off the shop; publishing puts it on sale.
            </p>
          </div>
        </div>
        <div className="admin-panel-body">
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
        </div>
      </section>
    </form>
  );
}
