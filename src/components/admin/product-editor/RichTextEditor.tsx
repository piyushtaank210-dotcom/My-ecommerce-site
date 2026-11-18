"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { isSafeLink } from "@/lib/rich-text";

/**
 * The editor a description is written in.
 *
 * It is a box the words are typed into and a bar of buttons above it. The
 * buttons work on whatever is selected in the box, so the reader never
 * loses their place: they select a word, press bold, and the word is
 * bold.
 *
 * The value that goes into the form is a small piece of HTML — the same
 * HTML that is later shown to a shopper. It is filtered again on the way
 * in, so only the tags a description is allowed to hold ever reach the
 * database.
 */

/** How large the text may be made. */
const SIZES = [
  { label: "Small", value: "13px" },
  { label: "Normal", value: "15px" },
  { label: "Large", value: "18px" },
  { label: "Larger", value: "22px" },
];

/** The words of a selection, with the characters HTML would read. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function RichTextEditor({
  id,
  name,
  initialValue,
  onChange,
  placeholder = "Tell the shopper what this is, what it does and who it is for.",
  minHeight = 220,
}: {
  id: string;
  /** The name the description is submitted under. */
  name: string;
  /**
   * The description as the product has it.
   *
   * It is written into the box once, when the editor opens, and is not
   * written again: the box is the editor's own, and the reader's typing
   * is not undone by the form being redrawn.
   */
  initialValue: string;
  /** Called whenever the description changes. */
  onChange: () => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const area = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  /** The colour the text is given, shown on the button that picks it. */
  const [colour, setColour] = useState("#0071c5");

  /**
   * The box is written once, when the editor opens.
   *
   * The browser keeps what was typed in it and puts it back when the page
   * is opened again. That text was never saved, so it is taken away and
   * the saved description is put in its place — which is what every other
   * field on the form does.
   */
  useEffect(() => {
    if (area.current && area.current.innerHTML !== initialValue) {
      area.current.innerHTML = initialValue ?? "";
    }
    if (hidden.current) hidden.current.value = initialValue ?? "";
    // The description belongs to the product that was opened, and the
    // editor is opened afresh for each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Takes what is in the box and puts it where the form will find it.
   *
   * The box is not held in the form's state, so that a letter typed here
   * does not redraw the whole editor — the product's photograph gallery
   * and its options included.
   */
  const read = useCallback(() => {
    const html = area.current?.innerHTML ?? "";
    if (hidden.current) hidden.current.value = html;
    onChange();
  }, [onChange]);

  /** Runs a command on whatever is selected. */
  function command(name: string, argument?: string) {
    area.current?.focus();
    if (argument === undefined) {
      document.execCommand(name);
    } else {
      document.execCommand(name, false, argument);
    }
    read();
    bump();
  }

  /** Whether the command is on for the current selection. */
  function active(name: string): boolean {
    try {
      return document.queryCommandState(name);
    } catch {
      return false;
    }
  }

  /** Puts the selected words inside a span of the given style. */
  function wrap(style: string) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const text = selection.toString();
    if (!text.trim()) return;
    area.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<span style="${style}">${escapeHtml(text)}</span>`
    );
    read();
  }

  /** Makes the selected words a link. */
  function addLink() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (!text.trim()) return;
    const url = window.prompt("The address the link points at:");
    if (!url) return;
    const trimmed = url.trim();
    if (!isSafeLink(trimmed)) {
      window.alert("A link must begin with https://, http://, mailto: or /.");
      return;
    }
    area.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
    );
    read();
  }

  return (
    <div className="admin-rte">
      {/* The bar of buttons. Pressing one must not take the selection
          away, so every button refuses the focus. */}
      <div className="admin-rte-bar" role="toolbar" aria-label="Formatting">
        <div className="admin-rte-group">
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Undo"
            title="Undo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("undo")}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Redo"
            title="Redo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("redo")}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="admin-rte-group">
          <button
            type="button"
            className="admin-rte-btn"
            data-on={active("bold") ? "true" : "false"}
            aria-label="Bold"
            title="Bold"
            aria-pressed={active("bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("bold")}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            data-on={active("italic") ? "true" : "false"}
            aria-label="Italic"
            title="Italic"
            aria-pressed={active("italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("italic")}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            data-on={active("underline") ? "true" : "false"}
            aria-label="Underline"
            title="Underline"
            aria-pressed={active("underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("underline")}
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            data-on={active("strikeThrough") ? "true" : "false"}
            aria-label="Strikethrough"
            title="Strikethrough"
            aria-pressed={active("strikeThrough")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("strikeThrough")}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* The shape of the text: a heading, a paragraph or a quotation. */}
        <div className="admin-rte-group">
          <select
            aria-label="Text formatting"
            title="Text formatting"
            defaultValue="p"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const tag = e.target.value;
              area.current?.focus();
              document.execCommand("formatBlock", false, `<${tag}>`);
              read();
              e.target.value = "p";
            }}
            className="h-7 rounded-md border border-gray-200 bg-white px-1.5 text-[12px] font-medium text-ink"
          >
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="blockquote">Quotation</option>
          </select>
        </div>

        {/* How large the text is. */}
        <div className="admin-rte-group">
          <select
            aria-label="Font size"
            title="Font size"
            defaultValue="15px"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const size = e.target.value;
              wrap(`font-size: ${size}`);
              e.target.value = "15px";
            }}
            className="h-7 rounded-md border border-gray-200 bg-white px-1.5 text-[12px] font-medium text-ink"
          >
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* The colour of the text. */}
        <div className="admin-rte-group">
          <label
            className="admin-rte-btn cursor-pointer"
            title="Text colour"
            aria-label="Text colour"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full border border-gray-300"
              style={{ background: colour }}
            />
            <input
              type="color"
              className="sr-only"
              value={colour}
              onChange={(e) => {
                setColour(e.target.value);
                wrap(`color: ${e.target.value}`);
              }}
            />
          </label>
        </div>

        {/* Where the text sits on the line. */}
        <div className="admin-rte-group">
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Align left"
            title="Align left"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("justifyLeft")}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Align centre"
            title="Align centre"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("justifyCenter")}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Align right"
            title="Align right"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("justifyRight")}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Lists and quotations. */}
        <div className="admin-rte-group">
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Bulleted list"
            title="Bulleted list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("insertUnorderedList")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Numbered list"
            title="Numbered list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("insertOrderedList")}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Quotation"
            title="Quotation"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("formatBlock", "<blockquote>")}
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Links. */}
        <div className="admin-rte-group">
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Add a link"
            title="Add a link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addLink}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Take the link away"
            title="Take the link away"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("unlink")}
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="admin-rte-btn"
            aria-label="Take the formatting away"
            title="Take the formatting away"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command("removeFormat")}
          >
            <span aria-hidden className="text-[12px]">
              Tx
            </span>
          </button>
        </div>
      </div>

      {/* The box the words are typed into.

          The browser keeps what was typed in it and puts it back when the
          page is opened again. React is told not to mind that: the box is
          the editor's own, and what is in it is the editor's to keep. */}
      <div
        id={id}
        ref={area}
        role="textbox"
        aria-multiline="true"
        aria-label="Full description"
        contentEditable
        suppressContentEditableWarning
        suppressHydrationWarning
        data-placeholder={placeholder}
        className="admin-rte-area"
        style={{ minHeight }}
        onInput={read}
        onKeyUp={() => bump()}
        onMouseUp={() => bump()}
      />

      {/* What the form carries. It is written as the description changes,
          rather than held in the form's state, so that a letter typed here
          does not redraw the whole editor.

          It is given no value of its own: a hidden input's value is its
          default value, so anything the form gave it would be put back
          every time the page was redrawn. */}
      <input ref={hidden} type="hidden" name={name} />
    </div>
  );
}
