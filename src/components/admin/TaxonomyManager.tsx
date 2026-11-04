"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FolderTree,
  Loader2,
  Plus,
  Shapes,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { SUGGESTED_CATEGORIES } from "@/lib/taxonomy";
import type {
  BrandDetail,
  CategoryDetail,
} from "@/lib/taxonomy-admin";

/**
 * The shape of the catalogue: categories, the categories inside them, and
 * the brands the store sells.
 *
 * A category carries the specification fields its products are described
 * by — a console is asked about its model and its storage, a controller
 * about its colour and what it works with — so the same questions are asked
 * of every product in it. The administrator may add any fields they like.
 *
 * Nothing that a product is in can be taken away. A category with products
 * in it, a subcategory a product carries and a brand a product names are
 * all kept until the products have moved.
 */
export function TaxonomyManager({
  categories,
  brands,
  canManage,
}: {
  categories: CategoryDetail[];
  brands: BrandDetail[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(
    path: string,
    method: string,
    body?: unknown
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.error ?? "That change could not be saved.";
        setError(message);
        toast(message, "error");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------- categories */

  const [newCategory, setNewCategory] = useState({ name: "", blurb: "" });
  const [newField, setNewField] = useState<Record<string, string>>({});
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [newBrand, setNewBrand] = useState({ name: "", blurb: "" });

  const present = new Set(categories.map((c) => c.slug));

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {error}
        </p>
      )}

      {/* The categories */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
          <FolderTree className="h-4 w-4 text-brand" />
          Categories
        </h2>
        <p className="mb-5 text-[12.5px] text-gray-500">
          What the catalogue is divided into, and what each category asks its
          products about.
        </p>

        <div className="space-y-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.slug}
              category={category}
              busy={busy}
              canManage={canManage}
              newField={newField[category.slug] ?? ""}
              newSub={newSub[category.slug] ?? ""}
              onNewField={(v) =>
                setNewField((prev) => ({ ...prev, [category.slug]: v }))
              }
              onNewSub={(v) =>
                setNewSub((prev) => ({ ...prev, [category.slug]: v }))
              }
              onCall={call}
            />
          ))}
        </div>

        {canManage && (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4">
            <h3 className="text-[13.5px] font-bold text-ink">Add a category</h3>
            <p className="mt-1 text-[12.5px] text-gray-500">
              A category of its own — a new kind of thing the store sells.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr_auto]">
              <input
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Gaming Headsets"
                aria-label="The new category's name"
                className="input h-9"
              />
              <input
                value={newCategory.blurb}
                onChange={(e) =>
                  setNewCategory((p) => ({ ...p, blurb: e.target.value }))
                }
                placeholder="What is in this category?"
                aria-label="The new category's blurb"
                className="input h-9"
              />
              <button
                type="button"
                disabled={busy || !newCategory.name.trim()}
                onClick={async () => {
                  const ok = await call("/api/admin/categories", "POST", {
                    name: newCategory.name.trim(),
                    blurb: newCategory.blurb.trim(),
                  });
                  if (ok) setNewCategory({ name: "", blurb: "" });
                }}
                className="btn btn-primary btn-sm h-9"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        )}
      </section>

      {/* The suggestions */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
          <Shapes className="h-4 w-4 text-brand" />
          Suggested categories
        </h2>
        <p className="mb-4 text-[12.5px] text-gray-500">
          The categories a console shop usually needs. One click adds one, with
          the specification fields it asks about already in place.
        </p>

        <ul className="grid gap-3 sm:grid-cols-2">
          {SUGGESTED_CATEGORIES.map((suggestion) => {
            const there = present.has(suggestion.slug);
            return (
              <li
                key={suggestion.slug}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink">
                      {suggestion.name}
                    </p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      {suggestion.blurb}
                    </p>
                  </div>
                  {there ? (
                    <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[11.5px] font-semibold text-green-700">
                      In the catalogue
                    </span>
                  ) : canManage ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call("/api/admin/categories", "POST", {
                          name: suggestion.name,
                          slug: suggestion.slug,
                          blurb: suggestion.blurb,
                          icon: suggestion.icon,
                          specFields: suggestion.specFields,
                        })
                      }
                      className="btn btn-outline btn-sm shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  ) : null}
                </div>

                <p className="mt-3 text-[11.5px] text-gray-500">
                  {suggestion.specFields.length
                    ? suggestion.specFields.join(" · ")
                    : "No specification fields yet."}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* The brands */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
          <Tag className="h-4 w-4 text-brand" />
          Brands
        </h2>
        <p className="mb-5 text-[12.5px] text-gray-500">
          The makers the store sells. Renaming one carries the products that
          use it with it.
        </p>

        <ul className="space-y-2">
          {brands.map((brand) => (
            <BrandRow
              key={brand.slug}
              brand={brand}
              busy={busy}
              canManage={canManage}
              onCall={call}
            />
          ))}
        </ul>

        {canManage && (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4">
            <h3 className="text-[13.5px] font-bold text-ink">Add a brand</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr_auto]">
              <input
                value={newBrand.name}
                onChange={(e) => setNewBrand((p) => ({ ...p, name: e.target.value }))}
                placeholder="Sony"
                aria-label="The new brand's name"
                className="input h-9"
              />
              <input
                value={newBrand.blurb}
                onChange={(e) => setNewBrand((p) => ({ ...p, blurb: e.target.value }))}
                placeholder="Who they are"
                aria-label="The new brand's blurb"
                className="input h-9"
              />
              <button
                type="button"
                disabled={busy || !newBrand.name.trim()}
                onClick={async () => {
                  const ok = await call("/api/admin/brands", "POST", {
                    name: newBrand.name.trim(),
                    blurb: newBrand.blurb.trim(),
                  });
                  if (ok) setNewBrand({ name: "", blurb: "" });
                }}
                className="btn btn-primary btn-sm h-9"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function CategoryCard({
  category,
  busy,
  canManage,
  newField,
  newSub,
  onNewField,
  onNewSub,
  onCall,
}: {
  category: CategoryDetail;
  busy: boolean;
  canManage: boolean;
  newField: string;
  newSub: string;
  onNewField: (v: string) => void;
  onNewSub: (v: string) => void;
  onCall: (
    path: string,
    method: string,
    body?: unknown
  ) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);

  /** Adds a field, keeping the ones that are already there. */
  async function addField() {
    const name = newField.trim();
    if (!name) return;
    const ok = await onCall(
      `/api/admin/categories/${category.slug}`,
      "PATCH",
      { specFields: [...category.specFields, name] }
    );
    if (ok) onNewField("");
  }

  async function removeField(field: string) {
    await onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
      specFields: category.specFields.filter((f) => f !== field),
    });
  }

  async function renameField(from: string, to: string) {
    const name = to.trim();
    if (!name || name === from) return;
    await onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
      specFields: category.specFields.map((f) => (f === from ? name : f)),
    });
  }

  async function addSubcategory() {
    const name = newSub.trim();
    if (!name) return;
    const ok = await onCall(
      `/api/admin/categories/${category.slug}/subcategories`,
      "POST",
      { name }
    );
    if (ok) onNewSub("");
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            defaultValue={category.name}
            disabled={!canManage || busy}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== category.name) {
                onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
                  name: e.target.value.trim(),
                });
              }
            }}
            aria-label={`The name of ${category.name}`}
            className="w-full border-0 bg-transparent p-0 text-[15px] font-bold text-ink focus:outline-none focus:ring-0 disabled:opacity-70"
          />
          <input
            defaultValue={category.blurb ?? ""}
            disabled={!canManage || busy}
            onBlur={(e) => {
              if ((e.target.value.trim() || "") !== (category.blurb ?? "")) {
                onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
                  blurb: e.target.value.trim(),
                });
              }
            }}
            placeholder="What is in this category?"
            aria-label={`What ${category.name} is for`}
            className="mt-1 w-full border-0 bg-transparent p-0 text-[12.5px] text-gray-500 focus:outline-none focus:ring-0 disabled:opacity-70"
          />
          <p className="mt-1 text-[11.5px] text-gray-400">
            /category/{category.slug} · {category.productCount} product
            {category.productCount === 1 ? "" : "s"}
          </p>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await onCall(
                      `/api/admin/categories/${category.slug}`,
                      "DELETE"
                    );
                    if (ok) setConfirming(false);
                  }}
                  className="text-[12.5px] font-semibold text-red-600 hover:underline"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[12.5px] text-gray-500 hover:underline"
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || category.productCount > 0}
                onClick={() => setConfirming(true)}
                title={
                  category.productCount > 0
                    ? "Products are in this category — move them first."
                    : "Remove this category"
                }
                aria-label={`Remove ${category.name}`}
                className="text-[12.5px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* The specification fields */}
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-gray-500">
            Specification fields
          </p>
          <p className="mt-1 text-[11.5px] text-gray-400">
            What every product in this category is asked about.
          </p>

          {category.specFields.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-gray-500">
              None yet. A product in this category is described by whatever
              fields are added here.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {category.specFields.map((field) => (
                <li key={field} className="flex items-center gap-2">
                  <input
                    defaultValue={field}
                    disabled={!canManage || busy}
                    onBlur={(e) => renameField(field, e.target.value)}
                    aria-label={`The field ${field}`}
                    className="input h-8 flex-1 text-[12.5px]"
                  />
                  {canManage && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeField(field)}
                      aria-label={`Remove the ${field} field`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newField}
                onChange={(e) => onNewField(e.target.value)}
                placeholder="Another field"
                aria-label="A new specification field"
                className="input h-8 flex-1 text-[12.5px]"
              />
              <button
                type="button"
                disabled={busy || !newField.trim()}
                onClick={addField}
                aria-label="Add the field"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* The subcategories */}
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-gray-500">
            Subcategories
          </p>
          <p className="mt-1 text-[11.5px] text-gray-400">
            The categories inside this one — "PS5", "PS4", "DualSense".
          </p>

          {category.subcategories.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-gray-500">None yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {category.subcategories.map((sub) => (
                <li key={sub.slug} className="flex items-center gap-2">
                  <input
                    defaultValue={sub.name}
                    disabled={!canManage || busy}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== sub.name) {
                        onCall(
                          `/api/admin/categories/${category.slug}/subcategories/${sub.slug}`,
                          "PATCH",
                          { name }
                        );
                      }
                    }}
                    aria-label={`The subcategory ${sub.name}`}
                    className="input h-8 flex-1 text-[12.5px]"
                  />
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {sub.productCount}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      disabled={busy || sub.productCount > 0}
                      onClick={() =>
                        onCall(
                          `/api/admin/categories/${category.slug}/subcategories/${sub.slug}`,
                          "DELETE"
                        )
                      }
                      title={
                        sub.productCount > 0
                          ? "Products are in this subcategory — move them first."
                          : "Remove this subcategory"
                      }
                      aria-label={`Remove ${sub.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newSub}
                onChange={(e) => onNewSub(e.target.value)}
                placeholder="A new subcategory"
                aria-label="A new subcategory"
                className="input h-8 flex-1 text-[12.5px]"
              />
              <button
                type="button"
                disabled={busy || !newSub.trim()}
                onClick={addSubcategory}
                aria-label="Add the subcategory"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandRow({
  brand,
  busy,
  canManage,
  onCall,
}: {
  brand: BrandDetail;
  busy: boolean;
  canManage: boolean;
  onCall: (
    path: string,
    method: string,
    body?: unknown
  ) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <input
        defaultValue={brand.name}
        disabled={!canManage || busy}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== brand.name) {
            onCall(`/api/admin/brands/${brand.slug}`, "PATCH", { name });
          }
        }}
        aria-label={`The brand ${brand.name}`}
        className="input h-8 w-[200px] text-[13px] font-medium"
      />
      <input
        defaultValue={brand.blurb ?? ""}
        disabled={!canManage || busy}
        onBlur={(e) => {
          if ((e.target.value.trim() || "") !== (brand.blurb ?? "")) {
            onCall(`/api/admin/brands/${brand.slug}`, "PATCH", {
              blurb: e.target.value.trim(),
            });
          }
        }}
        placeholder="Who they are"
        aria-label={`What ${brand.name} is`}
        className="input h-8 flex-1 text-[12.5px]"
      />
      <span className="shrink-0 text-[11.5px] text-gray-400">
        {brand.productCount} product{brand.productCount === 1 ? "" : "s"}
      </span>

      {canManage && (
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await onCall(
                    `/api/admin/brands/${brand.slug}`,
                    "DELETE"
                  );
                  if (ok) setConfirming(false);
                }}
                className="text-[12.5px] font-semibold text-red-600 hover:underline"
              >
                Yes, remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[12.5px] text-gray-500 hover:underline"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || brand.productCount > 0}
              onClick={() => setConfirming(true)}
              title={
                brand.productCount > 0
                  ? "Products carry this brand — move them first."
                  : "Remove this brand"
              }
              aria-label={`Remove ${brand.name}`}
              className="text-[12.5px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}
