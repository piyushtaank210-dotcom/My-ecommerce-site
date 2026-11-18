"use client";

import { useMemo } from "react";
import { Field } from "@/components/admin/ui/Field";
import { ProductImages } from "@/components/admin/ProductImages";
import { ProductListingToggle } from "@/components/admin/ProductListingToggle";
import { STORE } from "@/lib/store-info";
import type { ProductImage } from "@/lib/types";
import { SearchableSelect } from "./fields";
import type {
  CategoryOption,
  EditorApi,
  SubcategoryOption,
} from "./types";

/**
 * The first section of the editor: what the product is called, where it
 * sits in the catalogue, and what it looks like.
 *
 * The information is on the left and the photographs on the right, because
 * the two are read together — a name is easier to judge against a picture
 * of the thing than against a list of fields.
 */
export function GeneralDetails({
  editor,
  categories,
  subcategories,
  brands,
  images,
  mainImage,
  saved,
  listed,
}: {
  editor: EditorApi;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  brands: string[];
  images: ProductImage[];
  mainImage: string | null;
  /** Whether the product exists yet, and so can hold a photograph. */
  saved: boolean;
  /** Whether the product is in the shop. */
  listed: boolean;
}) {
  // The lists the pickers are given are kept still, so that they are not
  // rebuilt — and the lists inside them not searched again — every time
  // something else in the form changes.
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.slug, label: c.name })),
    [categories]
  );
  const brandOptions = useMemo(
    () => brands.map((b) => ({ value: b, label: b })),
    [brands]
  );
  const subcategoryOptions = useMemo(
    () =>
      subcategories
        .filter((s) => s.category_slug === editor.categorySlug)
        .map((s) => ({ value: s.name, label: s.name })),
    [subcategories, editor.categorySlug]
  );

  return (
    <section id="section-general" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">General details</h2>
          <p className="admin-editor-section-sub">
            What the product is called, who makes it, where it sits in the
            catalogue, and what it looks like.
          </p>
        </div>
      </div>

      <div className="admin-editor-split">
        {/* The product's own information. */}
        <div className="space-y-4">
          <Field label="Title" htmlFor="name" required error={editor.err("name")}>
            <input
              id="name"
              name="name"
              value={editor.name}
              onChange={(e) => {
                editor.setName(e.target.value);
                editor.markDirty();
              }}
              placeholder="PlayStation 5 Slim — Disc Edition 1TB"
              className={`input ${editor.err("name") ? "input-error" : ""}`}
            />
          </Field>

          <Field
            label="URL / Slug"
            htmlFor="slug"
            required
            error={editor.err("slug")}
            hint={
              editor.isNew
                ? `${STORE.url}/product/${editor.slug || "…"}`
                : "The address cannot change once the product exists."
            }
          >
            <input
              id="slug"
              name="slug"
              value={editor.slug}
              readOnly={!editor.isNew}
              onChange={(e) => {
                editor.setSlug(e.target.value);
                editor.markDirty();
              }}
              placeholder="playstation-5-slim-disc-1tb"
              className={`input ${editor.isNew ? "" : "bg-gray-50 text-gray-500"} ${
                editor.err("slug") ? "input-error" : ""
              }`}
            />
          </Field>

          <div className="admin-field-grid">
            <Field label="Category" htmlFor="category" error={editor.err("category")}>
              <SearchableSelect
                id="category"
                name="category"
                value={editor.categorySlug}
                options={categoryOptions}
                onChange={(v) => {
                  editor.setCategorySlug(v);
                  editor.markDirty();
                }}
                placeholder="Choose a category"
                invalid={Boolean(editor.err("category"))}
              />
            </Field>

            <Field
              label="Subcategory"
              htmlFor="subcategory"
              hint="Such as PS5."
            >
              <SearchableSelect
                id="subcategory"
                name="subcategory"
                value={editor.subcategory}
                options={subcategoryOptions}
                onChange={(v) => {
                  editor.setSubcategory(v);
                  editor.markDirty();
                }}
                placeholder="Choose or type a subcategory"
                emptyLabel="This category has no subcategories yet"
                allowCustom
              />
            </Field>
          </div>

          <Field label="Brand" htmlFor="brand">
            <SearchableSelect
              id="brand"
              name="brand"
              value={editor.brand}
              options={brandOptions}
              onChange={(v) => {
                editor.setBrand(v);
                editor.markDirty();
              }}
              placeholder="Choose or type a brand"
              emptyLabel="No brands yet"
              allowCustom
            />
          </Field>

          <Field
            label="Show in online store"
            hint="A product that is not listed stays out of the shop, but keeps its page and its stock."
          >
            <ProductListingToggle
              slug={editor.slug}
              listed={listed}
              disabled={!saved}
              variant="switch"
              onLabel="Yes — it is in the shop"
              offLabel="No — it is hidden"
            />
          </Field>
        </div>

        {/* The photographs. */}
        <div className="admin-gallery">
          <div className="admin-gallery-head">
            <h3 className="admin-gallery-title">Images</h3>
            <span className="text-[12px] text-gray-500">
              {images.length === 0
                ? "None yet"
                : `${images.length} photograph${images.length === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="admin-gallery-body">
            <ProductImages
              slug={editor.slug}
              images={images}
              mainPath={mainImage}
              saved={saved}
            />
          </div>

          <div className="admin-gallery-actions">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="admin-gallery-title">Add images</span>
              <span className="text-[11.5px] text-brand-dark">
                JPEG, PNG, WebP, GIF or AVIF, up to 8 MB each.
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-brand-dark">
              {saved
                ? "The first photograph is the one the shop shows on its cards. Drag one onto another to move it."
                : "They are uploaded as soon as the product has been saved."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
