"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { Field } from "@/components/admin/ui/Field";
import { TAG_SUGGESTIONS } from "@/lib/tags";
import { EditorNote, TagInput } from "./fields";
import type { EditorApi } from "./types";

/**
 * The fourth section of the editor: the words a customer finds the
 * product by, and the mark that goes on its card.
 */
export function OnlineStore({ editor }: { editor: EditorApi }) {
  /**
   * Whether the card carries a mark.
   *
   * The mark itself is a few words — "New", "Official Store" — and it is
   * shown on the product's card when it is there. The switch is its own
   * flag, because a mark that has not been written yet still has to be
   * able to be switched on.
   */
  const [showBadge, setShowBadge] = useState(editor.badge.trim() !== "");

  return (    <section id="section-online" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">Online store</h2>
          <p className="admin-editor-section-sub">
            The words this product is found by, and the mark it carries on
            its card.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <Field
          label="Tags"
          htmlFor="tags"
          className="admin-editor-narrow"
          hint="Short and plain — the words a customer would type to find this. Press Enter after each one."
        >
          <TagInput
            id="tags"
            name="tags"
            tags={editor.tags}
            onChange={(v) => {
              editor.setTags(v);
              editor.markDirty();
            }}
            suggestions={TAG_SUGGESTIONS}
          />
        </Field>

        <div className="admin-editor-subsection !mt-0 !pt-0 !border-t-0">
          <label className="admin-editor-check">
            <input
              type="checkbox"
              checked={showBadge}
              onChange={(e) => {
                const on = e.target.checked;
                setShowBadge(on);
                // A mark that is switched off is taken away, so that the
                // card does not keep showing it.
                if (!on) editor.setBadge("");
                editor.markDirty();
              }}
              className="h-4 w-4 shrink-0 accent-[var(--adm-accent)]"
            />
            <span className="text-[13px] font-semibold text-ink">
              Show sale badge on the item
            </span>
          </label>

          <p className="admin-hint mt-1 mb-4">
            A short mark in the corner of the product&apos;s card. Leave it
            off unless it says something the price does not.
          </p>

          {showBadge ? (
            <Field
              label="The mark"
              htmlFor="badge"
              className="admin-editor-narrow-sm"
              hint="A few words at most."
            >
              <input
                id="badge"
                name="badge"
                value={editor.badge}
                onChange={(e) => {
                  editor.setBadge(e.target.value);
                  editor.markDirty();
                }}
                placeholder="New, Official Store…"
                className="input"
              />
            </Field>
          ) : (
            <input type="hidden" name="badge" value="" />
          )}

          <div className="mt-4">
            <EditorNote icon={<Tag className="h-4 w-4" />}>
              A product on a sale price already carries the discount on its
              card. This mark is for the ones that say something else — that
              it is new, or that it is the store&apos;s own.
            </EditorNote>
          </div>
        </div>
      </div>
    </section>
  );
}
