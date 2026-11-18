"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderTree, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "@/components/Toaster";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import type { BrandDetail, CategoryDetail } from "@/lib/taxonomy-admin";

/**
 * The shape of the catalogue: the categories, the categories inside them,
 * and the brands the store sells.
 *
 * A category carries the specification fields its products are described
 * by — a console is asked about its model and its storage, a controller
 * about its colour and what it works with — so the same questions are asked
 * of every product in it. The administrator may add any fields they like.
 *
 * The categories are folded away one under another, and the brands have a
 * tab of their own, so neither list is laid out all at once.
 *
 * Nothing that a product is in can be taken away. A category with products
 * in it, a subcategory a product carries and a brand a product names are
 * all kept until the products have moved.
 */

/** Which of the two lists is being looked at. */
export type TaxonomyTab = "categories" | "brands";

/** What a change to the catalogue came back with. */
type CallResult = { ok: boolean; data?: Record<string, unknown> | null };

type Call = (
  path: string,
  method: string,
  body?: unknown
) => Promise<CallResult>;

export function TaxonomyManager({
  categories,
  brands,
  canManage,
  tab,
}: {
  categories: CategoryDetail[];
  brands: BrandDetail[];
  canManage: boolean;
  tab: TaxonomyTab;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The categories that are open. Everything else is folded away. */
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  /** Whether the form for making a new category or brand is showing. */
  const [adding, setAdding] = useState(false);

  const [newCategory, setNewCategory] = useState({ name: "", blurb: "" });
  const [newBrand, setNewBrand] = useState({ name: "", blurb: "" });
  const [newField, setNewField] = useState<Record<string, string>>({});
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  async function call(
    path: string,
    method: string,
    body?: unknown
  ): Promise<CallResult> {
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
        return { ok: false };
      }
      router.refresh();
      return { ok: true, data };
    } finally {
      setBusy(false);
    }
  }

  /** Opens a category, or closes it if it is already open. */
  function toggle(slug: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  /** Makes a category, and opens it so it can be filled in. */
  async function addCategory() {
    const name = newCategory.name.trim();
    if (!name) return;
    const { ok, data } = await call("/api/admin/categories", "POST", {
      name,
      blurb: newCategory.blurb.trim(),
    });
    if (!ok) return;
    setNewCategory({ name: "", blurb: "" });
    setAdding(false);
    const slug = data?.slug;
    if (typeof slug === "string") {
      setOpen((prev) => new Set(prev).add(slug));
    }
  }

  /** Makes a brand. */
  async function addBrand() {
    const name = newBrand.name.trim();
    if (!name) return;
    const { ok } = await call("/api/admin/brands", "POST", {
      name,
      blurb: newBrand.blurb.trim(),
    });
    if (!ok) return;
    setNewBrand({ name: "", blurb: "" });
    setAdding(false);
  }

  const tabs: {
    key: TaxonomyTab;
    label: string;
    href: string;
    count: number;
  }[] = [
    {
      key: "categories",
      label: "Categories",
      href: "/admin/categories",
      count: categories.length,
    },
    {
      key: "brands",
      label: "Brands",
      href: "/admin/categories?tab=brands",
      count: brands.length,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Categories and brands"
        description="What the catalogue is divided into, what each category asks its products about, and the makers the store sells."
        actions={
          canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}
            >
              <Plus className="h-4 w-4" />
              {tab === "brands" ? "Add brand" : "Add category"}
            </button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="admin-notice admin-notice--bad mb-5">
          {error}
        </p>
      )}

      {/* The two lists, one at a time. */}
      <nav className="admin-tabs mb-5" aria-label="Catalogue views">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className="admin-tab"
          >
            {t.label}
            <span className="admin-tab-count">{t.count}</span>
          </Link>
        ))}
      </nav>

      {tab === "brands" ? (
        <div className="space-y-4">
          {adding && (
            <NewItemForm
              what="brand"
              name={newBrand.name}
              blurb={newBrand.blurb}
              busy={busy}
              onNameChange={(v) => setNewBrand((p) => ({ ...p, name: v }))}
              onBlurbChange={(v) => setNewBrand((p) => ({ ...p, blurb: v }))}
              onSubmit={addBrand}
              onCancel={() => setAdding(false)}
            />
          )}

          {brands.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No brands yet"
              description="A brand is a maker the store sells — the one named on the product."
              action={
                canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setAdding(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add the first brand
                  </button>
                ) : undefined
              }
            />
          ) : (
            <BrandList
              brands={brands}
              busy={busy}
              canManage={canManage}
              onCall={call}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {adding && (
            <NewItemForm
              what="category"
              name={newCategory.name}
              blurb={newCategory.blurb}
              busy={busy}
              onNameChange={(v) => setNewCategory((p) => ({ ...p, name: v }))}
              onBlurbChange={(v) => setNewCategory((p) => ({ ...p, blurb: v }))}
              onSubmit={addCategory}
              onCancel={() => setAdding(false)}
            />
          )}

          {categories.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="No categories yet"
              description="A category is a kind of thing the store sells, and it asks its products the same questions."
              action={
                canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setAdding(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add the first category
                  </button>
                ) : undefined
              }
            />
          ) : (
            categories.map((category) => (
              <CategoryAccordion
                key={category.slug}
                category={category}
                open={open.has(category.slug)}
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
                onToggle={() => toggle(category.slug)}
                onCall={call}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * The form that makes a new category or a new brand.
 *
 * Both are a name and a line about it, so they are the same form.
 */
function NewItemForm({
  what,
  name,
  blurb,
  busy,
  onNameChange,
  onBlurbChange,
  onSubmit,
  onCancel,
}: {
  what: "category" | "brand";
  name: string;
  blurb: string;
  busy: boolean;
  onNameChange: (v: string) => void;
  onBlurbChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isCategory = what === "category";

  return (
    <Panel
      title={`Add a ${what}`}
      description={
        isCategory
          ? "A new kind of thing the store sells. The questions it asks its products can be added once it is here."
          : "A maker the store sells. Products carry a brand by name, so renaming one carries them with it."
      }
      actions={
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Cancel
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="admin-field">
          <label className="admin-label" htmlFor={`new-${what}-name`}>
            Name
          </label>
          <input
            id={`new-${what}-name`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={isCategory ? "Gaming Headsets" : "Sony"}
            className="input"
            autoFocus
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={`new-${what}-blurb`}>
            Description
          </label>
          <input
            id={`new-${what}-blurb`}
            value={blurb}
            onChange={(e) => onBlurbChange(e.target.value)}
            placeholder={
              isCategory ? "What is in this category?" : "Who they are"
            }
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4" />
          Create {what}
        </button>
      </form>
    </Panel>
  );
}

/**
 * A category, folded away.
 *
 * The header says what the category is and how much is in it; the body
 * holds everything that can be changed — the name, the description, the
 * categories inside it and the questions it asks its products.
 */
function CategoryAccordion({
  category,
  open,
  busy,
  canManage,
  newField,
  newSub,
  onNewField,
  onNewSub,
  onToggle,
  onCall,
}: {
  category: CategoryDetail;
  open: boolean;
  busy: boolean;
  canManage: boolean;
  newField: string;
  newSub: string;
  onNewField: (v: string) => void;
  onNewSub: (v: string) => void;
  onToggle: () => void;
  onCall: Call;
}) {
  const [confirming, setConfirming] = useState(false);
  const panelId = `category-${category.slug}`;

  /** Adds a field, keeping the ones that are already there. */
  async function addField() {
    const name = newField.trim();
    if (!name) return;
    const { ok } = await onCall(
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
    const { ok } = await onCall(
      `/api/admin/categories/${category.slug}/subcategories`,
      "POST",
      { name }
    );
    if (ok) onNewSub("");
  }

  return (
    <article className="admin-accordion" data-open={open}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="admin-accordion-head"
        >
          <ChevronRight className="admin-accordion-chevron h-4 w-4" />
          <span className="admin-accordion-main">
            <span className="admin-accordion-title">{category.name}</span>
            <span className="admin-accordion-sub">
              {category.blurb || `/category/${category.slug}`}
            </span>
          </span>
          <span className="admin-accordion-counts">
            <span className="admin-badge admin-badge--neutral">
              {category.productCount} product
              {category.productCount === 1 ? "" : "s"}
            </span>
            <span className="admin-badge admin-badge--neutral">
              {category.subcategories.length} subcategor
              {category.subcategories.length === 1 ? "y" : "ies"}
            </span>
          </span>
        </button>
      </h3>

      {/* The body stays in the page and is hidden when the category is
          closed, so the list of categories does not grow with everything
          under them. */}
      <div id={panelId} hidden={!open} className="admin-accordion-body">
        {/* What the category is called */}
        <div className="admin-accordion-block">
          <p className="admin-accordion-label">Basic information</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${panelId}-name`}>
                Name
              </label>
              <input
                id={`${panelId}-name`}
                key={category.name}
                defaultValue={category.name}
                disabled={!canManage || busy}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== category.name) {
                    onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
                      name,
                    });
                  }
                }}
                className="input"
              />
            </div>
            <div className="admin-field">
              <span className="admin-label">Address</span>
              <p className="admin-static">/category/{category.slug}</p>
            </div>
          </div>
          <div className="admin-field mt-3">
            <label className="admin-label" htmlFor={`${panelId}-blurb`}>
              Description
            </label>
            <input
              id={`${panelId}-blurb`}
              key={category.blurb ?? ""}
              defaultValue={category.blurb ?? ""}
              disabled={!canManage || busy}
              onBlur={(e) => {
                const blurb = e.target.value.trim();
                if (blurb !== (category.blurb ?? "")) {
                  onCall(`/api/admin/categories/${category.slug}`, "PATCH", {
                    blurb,
                  });
                }
              }}
              placeholder="What is in this category?"
              className="input"
            />
          </div>
        </div>

        {/* What is inside it, and what it asks its products */}
        <div className="admin-accordion-block">
          <div className="admin-accordion-grid">
            <div>
              <p className="admin-accordion-label">Subcategories</p>
              <p className="admin-accordion-hint">
                The categories inside this one — &ldquo;PS5&rdquo;, &ldquo;PS4&rdquo;,
                &ldquo;DualSense&rdquo;.
              </p>

              {category.subcategories.length === 0 ? (
                <p className="admin-accordion-empty">None yet.</p>
              ) : (
                <ul className="admin-edit-list">
                  {category.subcategories.map((sub) => (
                    <li key={sub.slug} className="admin-edit-row">
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
                        className="input"
                      />
                      <span className="admin-edit-count">{sub.productCount}</span>
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
                          className="admin-icon-btn admin-icon-btn--bad"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <div className="admin-add-row">
                  <input
                    value={newSub}
                    onChange={(e) => onNewSub(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSubcategory();
                      }
                    }}
                    placeholder="A new subcategory"
                    aria-label="A new subcategory"
                    className="input"
                  />
                  <button
                    type="button"
                    disabled={busy || !newSub.trim()}
                    onClick={addSubcategory}
                    className="btn btn-outline btn-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="admin-accordion-label">Specification fields</p>
              <p className="admin-accordion-hint">
                What every product in this category is asked about.
              </p>

              {category.specFields.length === 0 ? (
                <p className="admin-accordion-empty">
                  None yet. A product in this category is described by whatever
                  fields are added here.
                </p>
              ) : (
                <ul className="admin-edit-list">
                  {category.specFields.map((field) => (
                    <li key={field} className="admin-edit-row">
                      <input
                        defaultValue={field}
                        disabled={!canManage || busy}
                        onBlur={(e) => renameField(field, e.target.value)}
                        aria-label={`The field ${field}`}
                        className="input"
                      />
                      {canManage && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeField(field)}
                          aria-label={`Remove the ${field} field`}
                          className="admin-icon-btn admin-icon-btn--bad"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <div className="admin-add-row">
                  <input
                    value={newField}
                    onChange={(e) => onNewField(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addField();
                      }
                    }}
                    placeholder="Another field"
                    aria-label="A new specification field"
                    className="input"
                  />
                  <button
                    type="button"
                    disabled={busy || !newField.trim()}
                    onClick={addField}
                    className="btn btn-outline btn-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Taking the category away */}
        {canManage && (
          <div className="admin-accordion-block">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {confirming ? (
                <>
                  <span className="text-[12.5px] text-gray-500">
                    Remove {category.name}?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const { ok } = await onCall(
                        `/api/admin/categories/${category.slug}`,
                        "DELETE"
                      );
                      if (ok) setConfirming(false);
                    }}
                    className="btn btn-danger btn-sm"
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="btn btn-ghost btn-sm"
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
                  className="btn btn-danger-soft btn-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove category
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The brands the store sells, one to a row.
 *
 * There are few brands, so they are rows rather than a table — a table
 * would push the count and the remove button off the side of a phone.
 */
function BrandList({
  brands,
  busy,
  canManage,
  onCall,
}: {
  brands: BrandDetail[];
  busy: boolean;
  canManage: boolean;
  onCall: Call;
}) {
  return (
    <Panel bodyClass="admin-panel-body--flush">
      {brands.map((brand) => (
        <BrandRow
          key={brand.slug}
          brand={brand}
          busy={busy}
          canManage={canManage}
          onCall={onCall}
        />
      ))}
    </Panel>
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
  onCall: Call;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="admin-brand-row">
      <div className="admin-field">
        <label className="admin-label" htmlFor={`brand-${brand.slug}-name`}>
          Brand
        </label>
        <input
          id={`brand-${brand.slug}-name`}
          defaultValue={brand.name}
          key={brand.name}
          disabled={!canManage || busy}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== brand.name) {
              onCall(`/api/admin/brands/${brand.slug}`, "PATCH", { name });
            }
          }}
          className="input"
        />
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor={`brand-${brand.slug}-blurb`}>
          About them
        </label>
        <input
          id={`brand-${brand.slug}-blurb`}
          defaultValue={brand.blurb ?? ""}
          key={brand.blurb ?? ""}
          disabled={!canManage || busy}
          onBlur={(e) => {
            const blurb = e.target.value.trim();
            if (blurb !== (brand.blurb ?? "")) {
              onCall(`/api/admin/brands/${brand.slug}`, "PATCH", { blurb });
            }
          }}
          placeholder="Who they are"
          className="input"
        />
      </div>

      <span className="admin-badge admin-badge--neutral">
        {brand.productCount} product{brand.productCount === 1 ? "" : "s"}
      </span>

      {canManage && (
        <div className="admin-brand-actions">
          {confirming ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const { ok } = await onCall(
                    `/api/admin/brands/${brand.slug}`,
                    "DELETE"
                  );
                  if (ok) setConfirming(false);
                }}
                className="btn btn-danger btn-sm"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn btn-ghost btn-sm"
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
              className="admin-icon-btn admin-icon-btn--bad"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
