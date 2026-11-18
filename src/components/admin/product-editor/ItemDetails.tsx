"use client";

import { useState } from "react";
import { Boxes, Info, Package, Settings2 } from "lucide-react";
import { Field } from "@/components/admin/ui/Field";
import { VariantManager } from "@/components/admin/VariantManager";
import { money, discountPct } from "@/lib/format";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock";
import {
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABEL,
  type ProductCondition,
  type ProductImage,
  type Variant,
} from "@/lib/types";
import type { ProductAttributes } from "@/lib/variations";
import { ChoiceGroup, EditorNote } from "./fields";
import { isReturnableNote } from "@/lib/return-policy";
import type { EditorApi } from "./types";

/** Whether the item may be sent back. */
const RETURNABLE_CHOICES = [
  { value: "yes", title: "Yes", sub: "It may be sent back." },
  { value: "no", title: "No", sub: "It may not be sent back." },
];

/** The two ways an item may be stocked. */
const ITEM_TYPE_CHOICES = [
  {
    value: "simple",
    title: "Simple item",
    sub: "The product is stocked and priced as itself.",
  },
  {
    value: "variants",
    title: "Contains variants",
    sub: "The product varies by colour, storage or edition, and each option is stocked on its own.",
  },
];

/**
 * The second section of the editor: what the item is, what it costs, how
 * many there are and what is promised with it.
 *
 * This is the working part of the form — the prices, the stock and the
 * terms — so it is broken into pieces rather than run as one long list.
 */
export function ItemDetails({
  editor,
  slug,
  product,
  canSeeCost,
  variants,
  attributes,
  gallery,
  specFields,
  categoryName,
  returnWindowDays,
  returnsEnabled,
  canManage,
}: {
  editor: EditorApi;
  slug: string;
  product: {
    condition: ProductCondition;
    stock: number;
    low_stock_threshold: number;
    purchase_cost: number | null;
    options: { id: string; name: string; stock: number; low_stock_threshold: number }[];
  } | null;
  /** Only an administrator ever sees what the store paid for a product. */
  canSeeCost: boolean;
  variants: Variant[];
  attributes: ProductAttributes;
  gallery: ProductImage[];
  /** The fields the category asks every product in it about. */
  specFields: string[];
  /** The name of the category the product is in. */
  categoryName: string;
  /** How many days the shop allows for a return. */
  returnWindowDays: number;
  /** Whether the shop takes returns at all. */
  returnsEnabled: boolean;
  canManage: boolean;
}) {
  const saved = editor.isNew === false;

  /**
   * A product with options is stocked by its options, so the product's own
   * count is not the one that reaches a customer.
   */
  const hasOptions = (product?.options.length ?? 0) > 0;

  /**
   * A product that has been given something to vary by is a product that
   * varies, even before it has any options.
   */
  const hasAttributes = Object.keys(attributes).length > 0;

  /**
   * Whether the item is stocked as itself or through its options.
   *
   * A product that already has options is stocked by them, and that is not
   * something a form can undo: the options would have to be removed
   * first. A product that has been given something to vary by is a
   * product that varies, even before it has any options — so both are
   * shown as they are, and the choice is only offered to a product that
   * does not vary yet.
   */
  const [mode, setMode] = useState<"simple" | "variants">(
    hasOptions || hasAttributes ? "variants" : "simple"
  );
  const modeLocked = hasOptions || hasAttributes;

  /**
   * Whether the stock is managed from this form.
   *
   * When it is not, the count is left exactly as it is: the fields are
   * hidden and the numbers that are already there are sent back unchanged.
   */
  const [trackStock, setTrackStock] = useState(true);

  /**
   * What the shop does if something goes wrong.
   *
   * The shop reads this as a note, and treats the two words
   * "non-returnable" as a refusal — so whether the item may be sent back
   * is read from the note rather than kept beside it.
   */
  const [returnsNote, setReturnsNote] = useState(editor.returns);
  const returnable = isReturnableNote(editor.returns);

  const now = editor.salePrice > 0 ? editor.salePrice : editor.price;
  const off = discountPct(editor.mrp, now);

  return (
    <section id="section-item" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">Item details</h2>
          <p className="admin-editor-section-sub">
            What the item is, what it costs, how many there are, and what is
            promised with it.
          </p>
        </div>
      </div>

      {/* A. Type ------------------------------------------------------ */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Type</h3>
        <Field
          label="What the item is"
          htmlFor="condition"
          error={editor.err("condition")}
          hint="A console that has been opened, or one that has been put right, is not the same thing as a new one — and it is not sold as one."
        >
          <div className="flex flex-wrap gap-2">
            {PRODUCT_CONDITIONS.map((c) => (
              <label
                key={c}
                className="admin-choice !w-auto !min-w-[170px] cursor-pointer"
                data-on={editor.condition === c ? "true" : "false"}
              >
                <input
                  type="radio"
                  name="condition"
                  value={c}
                  checked={editor.condition === c}
                  onChange={() => {
                    editor.setCondition(c);
                    editor.markDirty();
                  }}
                  className="admin-choice-input"
                />
                <span aria-hidden className="admin-choice-mark">
                  <span className="h-2 w-2 rounded-full bg-current" />
                </span>
                <span className="admin-choice-title">
                  {PRODUCT_CONDITION_LABEL[c]}
                </span>
              </label>
            ))}
          </div>
        </Field>
      </div>

      {/* B. Item type ------------------------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Item type</h3>
        <ChoiceGroup
          name="itemType"
          value={mode}
          onChange={(v) => {
            setMode(v as "simple" | "variants");
            editor.markDirty();
          }}
          choices={ITEM_TYPE_CHOICES}
        />

        {modeLocked && (
          <p className="admin-hint mt-2">
            This product has {variants.length} option
            {variants.length === 1 ? "" : "s"}, and is stocked by them. Remove
            the options below to stock it as itself.
          </p>
        )}

        {mode === "variants" && (
          <div className="mt-4">
            {saved ? (
              <VariantManager
                slug={slug}
                attributes={attributes}
                variants={variants}
                gallery={gallery}
                canManage={canManage}
              />
            ) : (
              <EditorNote icon={<Info className="h-4 w-4" />}>
                <strong>Save the product first.</strong> Its options are
                added once it exists, because an option has to belong to a
                product.
              </EditorNote>
            )}
          </div>
        )}
      </div>

      {/* C. The product's own codes ----------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Identifiers</h3>
        <div className="admin-field-grid">
          <Field
            label="SKU"
            htmlFor="sku"
            error={editor.err("sku")}
            hint={
              editor.isNew
                ? "Leave it blank and one is generated from the address. It has to be unique."
                : "The product's own code. It has to be unique across the catalogue."
            }
          >
            <input
              id="sku"
              name="sku"
              defaultValue={editor.sku}
              placeholder="PLAYSTATION-5-SLIM-DISC-1TB"
              className={`input tnum ${editor.err("sku") ? "input-error" : ""}`}
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
              defaultValue={editor.modelNumber}
              placeholder="CFI-2016A"
              className="input tnum"
            />
          </Field>
        </div>
      </div>

      {/* D. Pricing and tax ------------------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Pricing and tax</h3>
        <div className="admin-editor-split">
          <div className="space-y-4">
            <Field
              label="Selling price"
              htmlFor="price"
              required
              error={editor.err("price")}
              hint="What the customer pays, in rupees."
            >
              <input
                id="price"
                name="price"
                type="number"
                min={0}
                step={1}
                value={editor.price || ""}
                onChange={(e) => {
                  editor.setPrice(Number(e.target.value));
                  editor.markDirty();
                }}
                className={`input tnum ${editor.err("price") ? "input-error" : ""}`}
              />
            </Field>

            <Field
              label="Retail price"
              htmlFor="mrp"
              error={editor.err("mrp")}
              hint="What it normally sells for. It cannot be below the selling price."
            >
              <input
                id="mrp"
                name="mrp"
                type="number"
                min={0}
                step={1}
                value={editor.mrp || ""}
                onChange={(e) => {
                  editor.setMrp(Number(e.target.value));
                  editor.markDirty();
                }}
                className={`input tnum ${editor.err("mrp") ? "input-error" : ""}`}
              />
            </Field>

            <Field
              label="Sale price"
              htmlFor="salePrice"
              error={editor.err("salePrice")}
              hint="Optional. While it is set, this is what the product sells for."
            >
              <input
                id="salePrice"
                name="salePrice"
                type="number"
                min={0}
                step={1}
                value={editor.salePrice || ""}
                onChange={(e) => {
                  editor.setSalePrice(Number(e.target.value));
                  editor.markDirty();
                }}
                placeholder="Leave blank for no sale"
                className={`input tnum ${editor.err("salePrice") ? "input-error" : ""}`}
              />
            </Field>
          </div>

          <div className="space-y-4">
            {canSeeCost && (
              <Field
                label="Purchase cost"
                htmlFor="purchaseCost"
                error={editor.err("purchaseCost")}
                hint="What the store paid for it. Only an administrator sees this."
              >
                <input
                  id="purchaseCost"
                  name="purchaseCost"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editor.purchaseCost ?? ""}
                  className={`input tnum ${editor.err("purchaseCost") ? "input-error" : ""}`}
                />
              </Field>
            )}

            {off > 0 && (
              <EditorNote icon={<Info className="h-4 w-4" />}>
                Saves {money(editor.mrp - now)} — {off}% off the retail price
                of {money(editor.mrp)}.
              </EditorNote>
            )}

            <EditorNote icon={<Info className="h-4 w-4" />}>
              Every price the shop shows already includes tax, so there is no
              tax rate to set here. What the customer pays is what they are
              charged.
            </EditorNote>
          </div>
        </div>
      </div>

      {/* E. Inventory -------------------------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Inventory management</h3>

        <label className="admin-editor-check mb-4">
          <input
            type="checkbox"
            checked={trackStock}
            onChange={(e) => {
              setTrackStock(e.target.checked);
              editor.markDirty();
            }}
            className="h-4 w-4 shrink-0 accent-[var(--adm-accent)]"
          />
          <span className="text-[13px] font-semibold text-ink">
            Track inventory for this item
          </span>
        </label>

        {trackStock ? (
          <div className="admin-editor-split">
            <div className="space-y-4">
              <Field
                label="Stock on the shelf"
                htmlFor="stock"
                error={editor.err("stock")}
                hint={
                  mode === "variants"
                    ? "The options carry the count. This is left as it is."
                    : "The number on the shelf. Changing it is recorded in the inventory history."
                }
              >
                {/* A product that is stocked by its options is counted by
                    them, so its own count is shown but not changed here. */}
                <input
                  id="stock"
                  name="stock"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={product?.stock ?? 0}
                  readOnly={mode === "variants"}
                  className={`input tnum ${
                    mode === "variants"
                      ? "cursor-not-allowed bg-gray-50 text-gray-500"
                      : ""
                  } ${editor.err("stock") ? "input-error" : ""}`}
                />
              </Field>

              <Field
                label="Reorder point"
                htmlFor="lowStockThreshold"
                error={editor.err("lowStockThreshold")}
                hint="At or below this many units the product counts as low and appears on the dashboard."
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
                  className={`input tnum ${editor.err("lowStockThreshold") ? "input-error" : ""}`}
                />
              </Field>
            </div>

            <div className="space-y-3">
              {hasOptions && product && product.options.length > 0 && (
                <div>
                  <span className="admin-label">Options and their stock</span>
                  <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                    {product.options.map((o) => (
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
                </div>
              )}

              <EditorNote icon={<Package className="h-4 w-4" />}>
                Every change to the count is written into the inventory
                history, with who made it and why. The count itself is never
                changed by anything else.
              </EditorNote>
            </div>
          </div>
        ) : (
          <>
            <input
              type="hidden"
              name="stock"
              value={product?.stock ?? 0}
            />
            <input
              type="hidden"
              name="lowStockThreshold"
              value={
                product?.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD
              }
            />
            <EditorNote icon={<Package className="h-4 w-4" />}>
              The stock of this item is not changed from this form. It is
              counted and adjusted from the inventory page, where every
              movement is written down.
            </EditorNote>
          </>
        )}
      </div>

      {/* F. Custom fields --------------------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">Custom fields</h3>
        <div className="admin-field-grid">
          <Field
            label="Select layout"
            hint="The fields a product in this category is asked about. They are set once for the whole category."
          >
            <div className="flex h-[38px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-600">
              <Settings2 className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">
                {categoryName}
                {specFields.length > 0
                  ? ` — ${specFields.join(", ")}`
                  : " — no fields of its own"}
              </span>
            </div>
          </Field>

          <EditorNote icon={<Info className="h-4 w-4" />} className="self-start">
            The layout is changed under{" "}
            <strong>Catalogue → Categories</strong>. The values for this
            product are filled in under{" "}
            <strong>Specifications</strong>, further down.
          </EditorNote>
        </div>
      </div>

      {/* G. Cancellation and returns ---------------------------------- */}
      <div className="admin-editor-subsection">
        <h3 className="admin-editor-subsection-title">
          Warranty, cancellation and returns
        </h3>

        <div className="admin-field-grid">
          <Field
            label="Warranty"
            htmlFor="warranty"
            hint="What the maker promises, in the shop's own words."
          >
            <input
              id="warranty"
              name="warranty"
              defaultValue={editor.warranty}
              placeholder="1 year manufacturer warranty"
              className="input"
            />
          </Field>

          <Field
            label="Returnable"
            hint="A product that cannot be sent back is not eligible for a return or a replacement."
          >
            <ChoiceGroup
              name="returnable"
              value={returnable ? "yes" : "no"}
              onChange={(v) => {
                setReturnsNote(v === "yes" ? "" : "non-returnable");
                editor.markDirty();
              }}
              choices={RETURNABLE_CHOICES}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="Returns and cancellation"
            htmlFor="returns"
            hint="What the shop does if something goes wrong. This is shown on the product page."
          >
            <input
              id="returns"
              name="returns"
              value={returnsNote}
              onChange={(e) => {
                setReturnsNote(e.target.value);
                editor.markDirty();
              }}
              placeholder="5-day replacement on dead-on-arrival units"
              className="input"
            />
          </Field>
        </div>

        <div className="mt-4">
          <EditorNote icon={<Boxes className="h-4 w-4" />}>
            {returnsEnabled ? (
              <>
                The shop accepts returns within{" "}
                <strong>{returnWindowDays} days</strong> of delivery. That
                window is the same for every product and is set under{" "}
                <strong>Returns → Settings</strong>.
              </>
            ) : (
              <>
                The shop is not accepting returns at the moment. That is set
                under <strong>Returns → Settings</strong>.
              </>
            )}
          </EditorNote>
        </div>
      </div>
    </section>
  );
}
