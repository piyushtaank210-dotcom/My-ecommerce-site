"use client";

import { Search } from "lucide-react";
import { Field } from "@/components/admin/ui/Field";
import { STORE } from "@/lib/store-info";
import type { EditorApi } from "./types";

/**
 * The last section of the editor: what a search engine is told about this
 * product.
 *
 * The card at the top shows the result as a search engine would draw it,
 * so that the title and the description can be judged as they will be
 * seen rather than as they are typed.
 */
export function SeoSection({ editor }: { editor: EditorApi }) {
  const title = editor.seoTitle || editor.name || "The product's name";
  const description =
    editor.metaDescription ||
    editor.shortDesc ||
    "What the shop says about this product, as it would appear under the title in a search result.";
  const path = `/product/${editor.slug || "the-products-address"}`;

  return (
    <section id="section-seo" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">SEO details</h2>
          <p className="admin-editor-section-sub">
            What a search engine is told about this product. Left blank, the
            shop uses the product&apos;s own name and description.
          </p>
        </div>
      </div>

      <div className="admin-editor-split">
        {/* The preview. */}
        <div className="space-y-4">
          <div className="admin-serp">
            <p className="admin-serp-url">
              {STORE.domain}
              <span className="text-gray-400"> › </span>
              <span className="text-gray-500">products</span>
              <span className="text-gray-400"> › </span>
              <span className="text-gray-500">{editor.slug || "…"}</span>
            </p>
            <p className="admin-serp-title">{title}</p>
            <p className="admin-serp-text">{description}</p>
          </div>

          <p className="admin-hint flex items-start gap-2">
            <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This is roughly how the product will appear in a search
              result. The address is {STORE.url}
              {path}.
            </span>
          </p>
        </div>

        {/* The fields behind it. */}
        <div className="space-y-4">
          <Field
            label="SEO title"
            htmlFor="seoTitle"
            error={editor.err("seoTitle")}
            hint={`${editor.seoTitle.length}/70 characters`}
          >
            <input
              id="seoTitle"
              name="seoTitle"
              value={editor.seoTitle}
              onChange={(e) => {
                editor.setSeoTitle(e.target.value);
                editor.markDirty();
              }}
              placeholder="PlayStation 5 Slim 1TB Console"
              className={`input ${editor.err("seoTitle") ? "input-error" : ""}`}
            />
          </Field>

          <Field
            label="Meta description"
            htmlFor="metaDescription"
            error={editor.err("metaDescription")}
            hint={`${editor.metaDescription.length}/160 characters`}
          >
            <textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              value={editor.metaDescription}
              onChange={(e) => {
                editor.setMetaDescription(e.target.value);
                editor.markDirty();
              }}
              placeholder="One or two lines describing the product for a search result."
              className={`input resize-none ${editor.err("metaDescription") ? "input-error" : ""}`}
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
              defaultValue={editor.imageAlt}
              placeholder="A PlayStation 5 Slim console standing upright"
              className="input"
            />
          </Field>
        </div>
      </div>
    </section>
  );
}
