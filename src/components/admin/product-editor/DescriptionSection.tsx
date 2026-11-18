"use client";

import { Field } from "@/components/admin/ui/Field";
import { RichTextEditor } from "./RichTextEditor";

/**
 * The fifth section of the editor: what the product says about itself.
 *
 * The short description is what the card and the search result show, so
 * it is a sentence or two in plain words. The full description is the
 * whole story, and it is written with the formatting toolbar — a
 * paragraph, a heading, a list of what is in the box.
 */
export function DescriptionSection({
  shortDesc,
  description,
  onDirty,
}: {
  /** The sentence the product already has. */
  shortDesc: string;
  /** The description the product already has. */
  description: string;
  /** Says that something has been changed and not yet saved. */
  onDirty: () => void;
}) {
  return (
    <section id="section-description" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">Description</h2>
          <p className="admin-editor-section-sub">
            What the shop says about this product. The short description is
            what a card and a search result show; the full description is
            what the product page tells.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <Field
          label="Short description"
          htmlFor="shortDesc"
          className="admin-editor-narrow"
          hint="Plain words — this one is not formatted."
        >
          <textarea
            id="shortDesc"
            name="shortDesc"
            rows={2}
            defaultValue={shortDesc}
            placeholder="One or two lines for the product card."
            className="input resize-none"
          />
        </Field>

        <Field
          label="Full description"
          htmlFor="description"
          hint="The whole story: what it is, what it does, who it is for."
        >
          <RichTextEditor
            id="description"
            name="description"
            initialValue={description}
            onChange={onDirty}
          />
        </Field>
      </div>
    </section>
  );
}
