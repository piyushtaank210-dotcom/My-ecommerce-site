"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ProductImage, Variant } from "@/lib/types";
import { toast } from "@/components/Toaster";
import { uploadFiles } from "@/lib/upload-client";
import {
  attributeNames,
  cleanAttributes,
  combinationKey,
  variantLabel,
  type ProductAttributes,
  type VariantAttributes,
} from "@/lib/variations";

/**
 * The options of a product.
 *
 * A product varies by its attributes — "Colour", "Storage", "Edition" — and
 * each combination of their values is one option that can be bought on its
 * own, with its own code, price, stock, photograph and barcode.
 *
 * Two options of the same product may not have the same values: the second
 * one would be the same thing twice.
 */
export function VariantManager({
  slug,
  attributes: initialAttributes,
  variants: initialVariants,
  gallery,
  canManage,
}: {
  slug: string;
  /** What the product varies by. */
  attributes: ProductAttributes;
  /** The options the product already has. */
  variants: Variant[];
  /** The product's own photographs, for an option to borrow. */
  gallery: ProductImage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [attributes, setAttributes] = useState<ProductAttributes>(initialAttributes);
  const [variants, setVariants] = useState<Variant[]>(initialVariants);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The option being edited, or null when the form is closed. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Which row is waiting to be confirmed before it is removed. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const [form, setForm] = useState({
    attributes: {} as VariantAttributes,
    name: "",
    sku: "",
    price: "",
    mrp: "",
    stock: "",
    lowStockThreshold: "",
    barcode: "",
    image: "",
  });

  // The page is re-rendered after every change, so the lists the server
  // sends are the truth.
  useEffect(() => setAttributes(initialAttributes), [initialAttributes]);
  useEffect(() => setVariants(initialVariants), [initialVariants]);

  const names = attributeNames(attributes);

  /* ---------------------------------------------------------- attributes */

  async function setAttributeName(oldName: string, nextName: string) {
    setAttributes((prev) => {
      const out: ProductAttributes = {};
      for (const [name, values] of Object.entries(prev)) {
        out[name === oldName ? nextName : name] = values;
      }
      return out;
    });
  }

  async function setAttributeValues(name: string, raw: string) {
    const values = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    setAttributes((prev) => ({ ...prev, [name]: values }));
  }

  async function removeAttribute(name: string) {
    setAttributes((prev) => {
      const out = { ...prev };
      delete out[name];
      return out;
    });
  }

  const attributesChanged =
    JSON.stringify(cleanAttributes(attributes)) !==
    JSON.stringify(cleanAttributes(initialAttributes));

  async function saveAttributes() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${slug}/attributes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attributes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The attributes could not be saved.");
        toast(data?.error ?? "The attributes could not be saved.", "error");
        return;
      }
      toast("What this product varies by has been saved.", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------- options */

  function blankForm() {
    return {
      attributes: {} as VariantAttributes,
      name: "",
      sku: "",
      price: "",
      mrp: "",
      stock: "",
      lowStockThreshold: "",
      barcode: "",
      image: "",
    };
  }

  function startCreating() {
    setEditingId(null);
    setCreating(true);
    setError(null);
    setForm(blankForm());
  }

  function startEditing(variant: Variant) {
    setCreating(false);
    setEditingId(variant.id);
    setError(null);
    setForm({
      attributes: { ...variant.attributes },
      name: variant.name,
      sku: variant.sku ?? "",
      price: String(variant.price),
      mrp: String(variant.mrp),
      stock: String(variant.stock),
      lowStockThreshold: String(variant.low_stock_threshold),
      barcode: variant.barcode ?? "",
      image: variant.image ?? "",
    });
  }

  function closeForm() {
    setEditingId(null);
    setCreating(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/products/${slug}/variants/${editingId}`
        : `/api/admin/products/${slug}/variants`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          attributes: form.attributes,
          sku: form.sku.trim() || null,
          price: Number(form.price) || 0,
          mrp: Number(form.mrp) || 0,
          stock: Number(form.stock) || 0,
          lowStockThreshold:
            form.lowStockThreshold === ""
              ? undefined
              : Number(form.lowStockThreshold),
          barcode: form.barcode.trim() || null,
          image: form.image.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That option could not be saved.");
        toast(data?.error ?? "That option could not be saved.", "error");
        return;
      }
      toast(
        editingId ? "Option updated." : "Option added.",
        "success"
      );
      closeForm();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(variant: Variant) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/products/${slug}/variants/${variant.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That option could not be removed.");
        toast(data?.error ?? "That option could not be removed.", "error");
        setConfirming(null);
        return;
      }
      toast("Option removed.", "success");
      setConfirming(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File | null) {
    if (!file || !editingId) return;
    setBusy(true);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";

    const outcome = await uploadFiles({
      ticketUrl: "/api/admin/uploads",
      commitUrl: "/api/admin/uploads",
      files: [file],
      payload: { target: "variant-image", slug, variantId: editingId },
    });

    if (!outcome.ok) {
      const message = outcome.error ?? "The photograph could not be uploaded.";
      setError(message);
      toast(message, "error");
      setBusy(false);
      return;
    }

    const body = outcome.data as { image?: string; variant?: { image?: string } };
    setForm((prev) => ({
      ...prev,
      image: body?.image ?? body?.variant?.image ?? "",
    }));
    toast("Photograph uploaded.", "success");
    router.refresh();
    setBusy(false);
  }

  /* --------------------------------------------------------------- view */

  const formOpen = creating || editingId !== null;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div className="min-w-0">
          <h2 className="admin-panel-title">
            <Boxes className="h-4 w-4 text-brand" />
            Variations
          </h2>
          <p className="admin-panel-sub">
            What this product varies by, and the options that come out of it.
            Each option is stocked on its own and has its own code, price and
            photograph.
          </p>
        </div>
      </div>
      <div className="admin-panel-body">
      {/* What it varies by */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
        <h3 className="text-[13.5px] font-bold text-ink">
          What this product varies by
        </h3>
        <p className="mt-1 text-[12.5px] text-gray-500">
          Colour, storage, edition, the models it works with, what is in the
          box. Each attribute has the values it may take.
        </p>

        {names.length === 0 ? (
          <p className="mt-3 text-[13px] text-gray-500">
            Nothing yet. A product that does not vary is stocked as itself.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {names.map((name) => (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <input
                  value={name}
                  onChange={async (e) => (await setAttributeName(name, e.target.value))}
                  disabled={!canManage || busy}
                  placeholder="Attribute"
                  aria-label="Attribute name"
                  className="input h-9 w-[180px]"
                />
                <input
                  value={(attributes[name] ?? []).join(", ")}
                  onChange={async (e) => (await setAttributeValues(name, e.target.value))}
                  disabled={!canManage || busy}
                  placeholder="Value, Value, Value"
                  aria-label={`Values for ${name}`}
                  className="input h-9 flex-1"
                />
                {canManage && (
                  <button
                    type="button"
                    onClick={async () => (await removeAttribute(name))}
                    disabled={busy}
                    aria-label={`Remove the ${name} attribute`}
                    className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () =>
                setAttributes((prev) => ({
                  ...prev,
                  [`Attribute ${names.length + 1}`]: [],
                }))
              }
              disabled={busy}
              className="btn btn-outline btn-sm"
            >
              <Plus className="h-4 w-4" />
              Add an attribute
            </button>
            <button
              type="button"
              onClick={saveAttributes}
              disabled={busy || !attributesChanged}
              className="btn btn-primary btn-sm"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        )}
      </div>

      {/* The options */}
      <div className="mt-6">
        <div className="admin-section-head">
          <h3 className="text-[13.5px] font-bold text-ink">
            The options ({variants.length})
          </h3>
          {canManage && !formOpen && (
            <button type="button" onClick={startCreating} className="btn btn-outline btn-sm">
              <Plus className="h-4 w-4" />
              Add an option
            </button>
          )}
        </div>

        {variants.length === 0 && !formOpen ? (
          <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-[13px] text-gray-500">
            This product has no options. It is stocked as itself.
          </p>
        ) : (
          <div className="admin-table-wrap mt-3">
            {/* The options table. Its width is fixed so that a long code
                cannot push the columns past the edge of the panel, and
                the actions are left in the flow rather than pinned to
                the edge — a pinned column over a scrolling table sits
                on top of the one beside it. */}
            <table className="admin-table admin-table--fixed" style={{ minWidth: 640 }}>
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[92px]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Code</th>
                  <th className="admin-th-num">Price</th>
                  <th className="admin-th-num">MRP</th>
                  <th className="admin-th-num">Stock</th>
                  <th>Barcode</th>
                  <th className="admin-th-num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const level =
                    v.stock <= 0
                      ? "Out of stock"
                      : v.stock <= v.low_stock_threshold
                        ? "Low stock"
                        : "In stock";
                  return (
                    <tr key={v.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          {v.image && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={v.image}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded object-contain"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">
                              {v.name}
                            </span>
                            {Object.keys(v.attributes).length > 0 && (
                              <span className="block truncate text-[11.5px] text-gray-500">
                                {Object.entries(v.attributes)
                                  .map(([k, val]) => `${k}: ${val}`)
                                  .join(" · ")}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="tnum text-[12px] text-gray-600">
                          {v.sku ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className="tnum font-semibold text-ink">
                          {v.price.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td>
                        <span className="tnum text-gray-500">
                          {v.mrp.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tnum font-semibold ${
                            v.stock <= 0
                              ? "text-red-600"
                              : v.stock <= v.low_stock_threshold
                                ? "text-amber-600"
                                : "text-ink"
                          }`}
                        >
                          {v.stock}
                        </span>
                        <span className="ml-1.5 text-[11.5px] text-gray-400">
                          {level}
                        </span>
                      </td>
                      <td>
                        <span className="tnum text-[12px] text-gray-600">
                          {v.barcode ?? "—"}
                        </span>
                      </td>
                      <td className="admin-td-actions">
                        {canManage && (
                          <div className="admin-row-actions">
                            {confirming === v.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => remove(v)}
                                  disabled={busy}
                                  className="btn btn-danger btn-sm disabled:opacity-60"
                                >
                                  Yes, remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirming(null)}
                                  className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-gray-500 transition-colors hover:bg-gray-100"
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditing(v)}
                                  disabled={busy}
                                  aria-label={`Edit ${v.name}`}
                                  className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand-tint"
                                >
                                  <Pencil className="mr-1 inline h-3 w-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirming(v.id)}
                                  disabled={busy}
                                  aria-label={`Remove ${v.name}`}
                                  title={`Remove ${v.name}`}
                                  className="admin-icon-btn admin-icon-btn--bad"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* The form */}
        {formOpen && canManage && (
          <div className="admin-panel mt-5">
            <div className="admin-panel-head">
              <div className="min-w-0">
                <h4 className="admin-panel-title">
                  {editingId ? "Change this option" : "Add an option"}
                </h4>
                <p className="admin-panel-sub">
                  The values that make this option different from the others,
                  and what it costs and how many there are.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="admin-icon-btn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="admin-panel-body space-y-4">
              {names.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {names.map((name) => (
                    <div key={name}>
                      <label htmlFor={`attr-${name}`} className="label">
                        {name}
                      </label>
                      <select
                        id={`attr-${name}`}
                        value={form.attributes[name] ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            attributes: {
                              ...prev.attributes,
                              [name]: e.target.value,
                            },
                          }))
                        }
                        className="input cursor-pointer"
                      >
                        <option value="">Choose a value</option>
                        {(attributes[name] ?? []).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="variant-name" className="label">
                    Name
                  </label>
                  <input
                    id="variant-name"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={
                      names.length
                        ? variantLabel(form.attributes, "Chosen by the values")
                        : "White"
                    }
                    className="input"
                  />
                  <p className="mt-1 text-[12px] text-gray-500">
                    {names.length
                      ? "Left blank, the values above name it."
                      : "What the shopper calls this option."}
                  </p>
                </div>

                <div>
                  <label htmlFor="variant-sku" className="label">
                    Code
                  </label>
                  <input
                    id="variant-sku"
                    value={form.sku}
                    onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                    placeholder="Leave blank and one is made from the name"
                    className="input tnum"
                  />
                </div>

                <div>
                  <label htmlFor="variant-barcode" className="label">
                    Barcode
                  </label>
                  <input
                    id="variant-barcode"
                    value={form.barcode}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, barcode: e.target.value }))
                    }
                    placeholder="Optional"
                    className="input tnum"
                  />
                </div>

                <div>
                  <label htmlFor="variant-price" className="label">
                    Selling price (₹)
                  </label>
                  <input
                    id="variant-price"
                    type="number"
                    min={0}
                    step={1}
                    value={form.price}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, price: e.target.value }))
                    }
                    className="input tnum"
                  />
                </div>

                <div>
                  <label htmlFor="variant-mrp" className="label">
                    MRP (₹)
                  </label>
                  <input
                    id="variant-mrp"
                    type="number"
                    min={0}
                    step={1}
                    value={form.mrp}
                    onChange={(e) => setForm((prev) => ({ ...prev, mrp: e.target.value }))}
                    className="input tnum"
                  />
                </div>

                <div>
                  <label htmlFor="variant-stock" className="label">
                    Stock
                  </label>
                  <input
                    id="variant-stock"
                    type="number"
                    min={0}
                    step={1}
                    value={form.stock}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, stock: e.target.value }))
                    }
                    className="input tnum"
                  />
                </div>

                <div>
                  <label htmlFor="variant-threshold" className="label">
                    Low-stock threshold
                  </label>
                  <input
                    id="variant-threshold"
                    type="number"
                    min={0}
                    step={1}
                    value={form.lowStockThreshold}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        lowStockThreshold: e.target.value,
                      }))
                    }
                    placeholder="5"
                    className="input tnum"
                  />
                </div>
              </div>

              {/* The option's own photograph */}
              <div>
                <span className="label">Photograph</span>
                <div className="flex flex-wrap items-center gap-3">
                  {form.image ? (
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.image}
                        alt=""
                        className="h-12 w-12 rounded-lg border border-gray-200 bg-gray-50 object-contain p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, image: "" }))}
                        className="text-[12.5px] text-gray-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-gray-500">
                      None — the product's own photograph is used.
                    </span>
                  )}

                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setForm((prev) => ({ ...prev, image: e.target.value }));
                      }
                    }}
                    aria-label="Use one of the product's photographs"
                    className="input h-9 w-auto cursor-pointer text-[12.5px]"
                  >
                    <option value="">Use one of the product's photographs…</option>
                    {gallery.map((img) => (
                      <option key={img.id} value={img.path}>
                        {img.alt ?? img.path}
                      </option>
                    ))}
                  </select>

                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    onChange={(e) => uploadImage(e.target.files?.[0] ?? null)}
                    disabled={busy}
                    className="hidden"
                    id="variant-image"
                  />
                  <label
                    htmlFor="variant-image"
                    className={`btn btn-outline btn-sm ${
                      busy ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }`}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload
                  </label>
                </div>
              </div>

              {error && (
                <p role="alert" className="admin-notice admin-notice--bad">
                  <span>{error}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="btn btn-primary btn-sm"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {editingId ? "Save the option" : "Add the option"}
                </button>
                <button type="button" onClick={closeForm} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
