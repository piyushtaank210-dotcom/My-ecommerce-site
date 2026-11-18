"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Loader2, Save, Upload, X } from "lucide-react";
import { saveProductAction, type PanelState } from "@/lib/admin-actions";
import { slugify } from "@/lib/sku";
import { toast } from "@/components/Toaster";
import { SectionNav } from "@/components/admin/ui/SectionNav";
import { ProductStatusSelect } from "@/components/admin/ProductStatusSelect";
import type {
  ProductCondition,
  ProductImage,
} from "@/lib/types";
import type { ProductAttributes } from "@/lib/variations";
import type { Variant } from "@/lib/types";
import type { ProductStatus } from "@/lib/product-status";
import { GeneralDetails } from "./product-editor/GeneralDetails";
import { ItemDetails } from "./product-editor/ItemDetails";
import { FulfilmentDetails } from "./product-editor/FulfilmentDetails";
import { OnlineStore } from "./product-editor/OnlineStore";
import { DescriptionSection } from "./product-editor/DescriptionSection";
import { SpecificationsSection } from "./product-editor/SpecificationsSection";
import { SeoSection } from "./product-editor/SeoSection";
import type { SpecRow } from "./ProductSpecs";
import type {
  CategoryOption,
  EditorApi,
  SubcategoryOption,
} from "./product-editor/types";

const initial: PanelState = { ok: false };

/**
 * The empty set of mistakes.
 *
 * It is kept here rather than made afresh on every render, so that the
 * editor's own state is only rebuilt when the mistakes actually change.
 */
const NO_ERRORS: Record<string, string> = {};

/**
 * What a product is, as the editor holds it while it is being changed.
 */
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
  /** The words the product is found by. */
  tags: string[];
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

/**
 * The sections of the editor, in the order they are read.
 */
const SECTIONS = [
  { id: "section-general", label: "General details", icon: "text" },
  { id: "section-item", label: "Item details", icon: "package" },
  { id: "section-fulfilment", label: "Fulfilment", icon: "truck" },
  { id: "section-online", label: "Online store", icon: "upload" },
  { id: "section-description", label: "Description", icon: "list" },
  { id: "section-specifications", label: "Specifications", icon: "list" },
  { id: "section-seo", label: "SEO details", icon: "search" },
];

/**
 * The catalogue editor.
 *
 * The same form creates a product and edits one — the slug decides which,
 * and an existing slug is edited in place.
 *
 * It opens as a sheet over the back office: a header that does not move, a
 * single area that scrolls, and a bar of actions that does not move
 * either. The form is laid out in the order a product is actually thought
 * about: what it is, what it looks like, what it costs, what is in the
 * box, how it ships, how it is found and how it is read by a search
 * engine.
 */
export function ProductEditor({
  product,
  categories,
  subcategories,
  brands,
  images,
  mainImage,
  canSeeCost,
  canManage,
  status,
  listed,
  variants,
  attributes,
  returnWindowDays,
  returnsEnabled,
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
  /** Whether the administrator may change the catalogue at all. */
  canManage: boolean;
  status: ProductStatus;
  /** Whether the product is in the shop. */
  listed: boolean;
  /** The options the product has. */
  variants: Variant[];
  /** What the product varies by. */
  attributes: ProductAttributes;
  /** How many days the shop allows for a return. */
  returnWindowDays: number;
  /** Whether the shop takes returns at all. */
  returnsEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProductAction, initial);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);
  const isNew = !product;

  // The name and the address follow each other until somebody edits the
  // address by hand. An existing product's address never changes.
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const [subcategory, setSubcategory] = useState(product?.subcategory ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [condition, setCondition] = useState<ProductCondition>(
    product?.condition ?? "new"
  );

  // The prices are held here so the discount can be worked out as they are
  // typed, rather than after the form is saved.
  const [price, setPrice] = useState(product?.price ?? 0);
  const [mrp, setMrp] = useState(product?.mrp ?? 0);
  const [salePrice, setSalePrice] = useState(product?.sale_price ?? 0);

  const [seoTitle, setSeoTitle] = useState(product?.seo_title ?? "");
  const [metaDescription, setMetaDescription] = useState(
    product?.meta_description ?? ""
  );

  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [badge, setBadge] = useState(product?.badge ?? "");

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
  /** The name of the category, for the sections that say which one it is. */
  const categoryName = category?.name ?? "Category";

  /**
   * The address that is shown.
   *
   * It follows the name until somebody writes it by hand, so there is no
   * effect that has to keep the two in step.
   */
  const shownSlug = slugTouched ? slug : slugify(name);

  /** The fields the category asks every product in it about. */
  const categoryFields = useMemo(
    () => category?.specFields ?? [],
    [category]
  );

  /**
   * The specifications that are not one of the category's own fields.
   *
   * The category's fields are shown on their own above the free-form
   * table, so a specification is never asked for twice.
   */
  const otherSpecs = useMemo(() => {
    const fields = new Set(categoryFields.map((f) => f.toLowerCase()));
    return (product?.specs ?? []).filter((s) => !fields.has(s.label.toLowerCase()));
  }, [product?.specs, categoryFields]);

  /**
   * Whether something has been changed and not yet saved.
   *
   * It is used to warn before the editor is closed with something still
   * unsaved, and to warn before the tab is closed.
   */
  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);

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

  // A tab that is closed with something unsaved is a thing the reader
  // cannot get back, so the browser is asked to confirm it.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // The mistakes the last save came back with. The empty one is kept
  // outside the component, so that the editor's own state is only rebuilt
  // when the mistakes actually change.
  const errors = useMemo(() => state.errors ?? NO_ERRORS, [state.errors]);
  const err = useCallback((field: string) => errors[field], [errors]);

  /** Leaves the editor, asking first if something is unsaved. */
  const leave = useCallback(() => {
    if (
      dirty &&
      !window.confirm(
        "This product has changes that have not been saved. Leave without saving?"
      )
    ) {
      return;
    }
    router.push("/admin/products");
  }, [dirty, router]);

  /**
   * The state of the editor, handed to each of the sections.
   */
  const editor = useMemo<EditorApi>(
    () => ({
      isNew,
      name,
      slug: shownSlug,
      price,
      mrp,
      salePrice,
      seoTitle,
      metaDescription,
      categorySlug,
      subcategory,
      brand,
      sku: product?.sku ?? "",
      modelNumber: product?.model_number ?? "",
      purchaseCost: product?.purchase_cost ?? null,
      condition,
      warranty: product?.warranty ?? "",
      badge,
      returns: product?.returns ?? "",
      shortDesc: product?.short_desc ?? "",
      tags,
      imageAlt: product?.image_alt ?? "",
      setName,
      setSlug: (value) => {
        setSlugTouched(true);
        // The address is written the way the shop writes them, so what is
        // shown here is exactly what will be saved.
        setSlug(slugify(value));
      },
      setPrice,
      setMrp,
      setSalePrice,
      setSeoTitle,
      setMetaDescription,
      setCategorySlug: (value) => {
        setCategorySlug(value);
        // A subcategory belongs to a category. Moving to another one
        // leaves it behind rather than carrying it somewhere it does not
        // belong.
        const stillThere = subcategories.some(
          (s) => s.category_slug === value && s.name === subcategory
        );
        if (!stillThere) setSubcategory("");
      },
      setSubcategory,
      setBrand,
      setCondition,
      setTags,
      setBadge,
      err,
      markDirty,
    }),
    [
      isNew,
      name,
      shownSlug,
      price,
      mrp,
      salePrice,
      seoTitle,
      metaDescription,
      categorySlug,
      subcategory,
      brand,
      condition,
      badge,
      tags,
      product,
      subcategories,
      err,
      markDirty,
    ]
  );

  return (
    <form
      action={formAction}
      className="admin-editor-sheet"
      noValidate
      onChange={() => setDirty(true)}
    >
      {/* The header. It does not move, so the reader always knows which
          product they are changing. */}
      <header className="admin-editor-head">
        <div className="admin-editor-head-text">
          <h1 className="admin-editor-title">
            {isNew ? "Add product" : "Edit product"}
          </h1>
          <p className="admin-editor-sub">
            {isNew
              ? "Nothing is published until you say so."
              : name || "This product"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!isNew && (
            <ProductStatusSelect slug={slug} status={status} />
          )}
          <button
            type="button"
            onClick={leave}
            aria-label="Close the editor and go back to the catalogue"
            title="Close"
            className="admin-editor-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* The one area that scrolls. */}
      <div className="admin-editor-scroll">
        <div className="admin-editor-inner">
          <SectionNav sections={SECTIONS} title="Sections" />

          <div className="admin-editor-content">
            {state.message && !state.ok && (
              <p role="alert" className="admin-notice admin-notice--bad">
                <span>{state.message}</span>
              </p>
            )}

            <GeneralDetails
              editor={editor}
              categories={categories}
              subcategories={subcategories}
              brands={brands}
              images={images}
              mainImage={mainImage}
              saved={!isNew}
              listed={listed}
            />

            <ItemDetails
              editor={editor}
              slug={shownSlug}
              product={product}
              canSeeCost={canSeeCost}
              variants={variants}
              attributes={attributes}
              gallery={images}
              specFields={categoryFields}
              categoryName={categoryName}
              returnWindowDays={returnWindowDays}
              returnsEnabled={returnsEnabled}
              canManage={canManage}
            />

            <FulfilmentDetails
              initial={{
                length: product?.package_length ?? null,
                width: product?.package_width ?? null,
                height: product?.package_height ?? null,
                weight: product?.weight_grams ?? null,
              }}
              onDirty={markDirty}
            />

            <OnlineStore editor={editor} />

            <DescriptionSection
              shortDesc={product?.short_desc ?? ""}
              description={product?.description ?? ""}
              onDirty={markDirty}
            />

            <SpecificationsSection
              specs={otherSpecs}
              categoryFields={categoryFields}
              categoryName={categoryName}
            />

            <SeoSection editor={editor} />
          </div>
        </div>
      </div>

      {/* The bar of actions. It does not move either, so the product can
          always be saved without scrolling back to the top. */}
      <footer className="admin-editor-foot">
        <div className="flex flex-wrap items-center gap-2">
          {isNew ? (
            <span className="admin-editor-foot-note">
              A new product is saved as a draft until it is published.
            </span>
          ) : (
            <>
              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className="btn btn-outline btn-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                Publish
              </button>
              <button
                type="submit"
                name="intent"
                value="draft"
                disabled={pending}
                className="btn btn-outline btn-sm"
              >
                Save as draft
              </button>
              <Link
                href={`/product/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Link>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={leave}
            disabled={pending}
            className="btn btn-outline"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="intent"
            value="keep"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </footer>
    </form>
  );
}
