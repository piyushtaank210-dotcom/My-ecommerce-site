"use client";

import { Info } from "lucide-react";
import { ProductSpecs, type SpecRow } from "@/components/admin/ProductSpecs";
import { EditorNote } from "./fields";

/**
 * The sixth section of the editor: the table of facts on the product page.
 *
 * The category's own questions come first — a console is asked about its
 * storage and what is in the box — and anything else worth saying about
 * this one follows.
 */
export function SpecificationsSection({
  specs,
  categoryFields,
  categoryName,
}: {
  /** The specifications that are not one of the category's own fields. */
  specs: SpecRow[];
  /** The fields the category asks every product in it about. */
  categoryFields: string[];
  /** The name of the category the product is in. */
  categoryName: string;
}) {
  return (
    <section id="section-specifications" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">Specifications</h2>
          <p className="admin-editor-section-sub">
            The table of facts on the product page. A row with no name is not
            saved.
          </p>
        </div>
      </div>

      {/* The category's own fields. They are the same for every product in
          the category, so their names are carried through the form rather
          than typed. */}
      {categoryFields.length > 0 && (
        <div className="admin-editor-narrow mb-5 rounded-lg border border-brand/30 bg-brand-tint/30 p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-brand">
            {categoryName} specifications
          </p>
          <div className="space-y-2">
            {categoryFields.map((field) => {
              const existing = specs.find(
                (s) => s.label.toLowerCase() === field.toLowerCase()
              );
              return (
                <div
                  key={field}
                  className="grid items-center gap-2 sm:grid-cols-[180px_1fr]"
                >
                  <input
                    type="hidden"
                    name="categorySpecLabel"
                    value={field}
                  />
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

      <div className="admin-editor-narrow">
        <ProductSpecs key={categoryName} specs={specs} />
      </div>

      <div className="admin-editor-narrow mt-5">
        <EditorNote icon={<Info className="h-4 w-4" />}>
          These are shown on the product page as a table of name and value, in
          the order they are written here.
        </EditorNote>
      </div>
    </section>
  );
}
