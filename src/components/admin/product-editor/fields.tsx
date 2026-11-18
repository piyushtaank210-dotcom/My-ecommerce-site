"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { normaliseTags, tagsToJson } from "@/lib/tags";

/**
 * The controls the product editor is built out of.
 *
 * They are here rather than in the sections themselves because the same
 * four are asked for again and again: a list that is searched rather than
 * scrolled, a pair of choices drawn as cards, a list of tags, and a
 * heading with a note under it.
 */

/* ------------------------------------------------------------- searching */

/** One thing that may be picked. */
export type SelectOption = {
  /** What the form carries when this is chosen. */
  value: string;
  /** What the reader sees. */
  label: string;
  /** A line under the label, for the ones that need saying more. */
  hint?: string;
};

/**
 * How many possibilities are drawn at once.
 *
 * A catalogue with five hundred brands does not need five hundred rows in
 * the list; it needs the reader to be able to narrow them down.
 */
const MAX_VISIBLE_OPTIONS = 60;

/**
 * A list that is searched rather than scrolled.
 *
 * The catalogue has more categories, brands and subcategories than fit in
 * a dropdown, and a reader who knows what they want should not have to
 * hunt for it. The control is a text box that opens a list of the
 * possibilities that match what has been typed.
 *
 * The value that goes into the form is the option's own value — a
 * category's address rather than its name — so what is typed and what is
 * saved are not always the same words.
 */
export function SearchableSelect({
  id,
  name,
  value,
  options,
  onChange,
  placeholder = "Search…",
  emptyLabel = "Nothing to choose",
  /** Whether something that is not on the list may be typed in. */
  allowCustom = false,
  disabled = false,
  invalid = false,
  className = "",
}: {
  id: string;
  /** The name the value is submitted under. */
  name: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** What the empty list says. */
  emptyLabel?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  /**
   * What is in the box.
   *
   * It is null while the reader has not typed, and the label of the
   * chosen option is shown instead. So there is one thing to keep in
   * step — the value — rather than two.
   */
  const [typed, setTyped] = useState<string | null>(null);
  const chosen = options.find((o) => o.value === value);
  const text = typed ?? chosen?.label ?? "";

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  /**
   * The options that match what has been typed.
   *
   * The labels are put in lower case once, so that each keystroke does
   * not have to fold every label again.
   */
  const matches = useMemo(() => {
    const lowered = options.map((o) => [o, o.label.toLowerCase()] as const);
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return lowered.filter(([, label]) => label.includes(q)).map(([o]) => o);
  }, [options, query]);

  function pick(option: SelectOption) {
    onChange(option.value);
    setTyped(null);
    setQuery("");
    setOpen(false);
  }

  function type(value_: string) {
    setTyped(value_);
    setQuery(value_);
    setOpen(true);
    // What is typed is only committed when it is one of the choices. A
    // list that does not allow anything else will not take a word that is
    // not on it.
    const q = value_.trim().toLowerCase();
    const exact = options.find((o) => o.label.toLowerCase() === q);
    if (exact) {
      onChange(exact.value);
      setTyped(null);
    } else if (allowCustom) {
      onChange(value_.trim());
    } else {
      onChange("");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => {
        const next = event.key === "ArrowDown" ? h + 1 : h - 1;
        const max = matches.length - 1;
        return next < 0 ? max : next > max ? 0 : next;
      });
      return;
    }
    if (event.key === "Enter") {
      if (open && matches[highlight]) {
        event.preventDefault();
        pick(matches[highlight]);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className={`relative ${className}`.trim()}>
      {/* What the form carries. It is the option's value, which is not
          always the words on the screen. */}
      <input type="hidden" name={name} value={value} />

      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[highlight] ? `${listId}-${highlight}` : undefined
          }
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
          className={`input pr-9 cursor-pointer ${invalid ? "input-error" : ""}`}
        />
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-[12.5px] text-gray-500">
              {allowCustom
                ? `Nothing called “${query.trim()}” yet — it will be added.`
                : emptyLabel}
            </p>
          ) : (
            <>
              {matches.slice(0, MAX_VISIBLE_OPTIONS).map((option, i) => (
                <div
                  key={option.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(option);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] ${
                    i === highlight ? "bg-brand-tint text-brand-dark" : "text-ink"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-[11.5px] text-gray-400">
                      {option.hint}
                    </span>
                  )}
                  {option.value === value && (
                    <Check aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  )}
                </div>
              ))}
              {matches.length > MAX_VISIBLE_OPTIONS && (
                <p className="border-t border-gray-100 px-3 py-2 text-[12px] text-gray-400">
                  {matches.length - MAX_VISIBLE_OPTIONS} more — keep typing to
                  narrow the list.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- choices */

/** One of a pair of choices. */
export type Choice = {
  value: string;
  title: string;
  /** A line under the title saying what the choice means. */
  sub?: string;
};

/**
 * A pair of choices drawn as cards.
 *
 * A radio button says that there are two things and which one is true. A
 * card says the same thing and also says what each one is for, which is
 * what a reader needs when they are looking at "simple item" and
 * "contains variants" and have to work out which they are choosing.
 */
export function ChoiceGroup({
  name,
  value,
  onChange,
  choices,
  disabled = false,
  columns = 2,
}: {
  /** The name the choice is submitted under. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  choices: Choice[];
  disabled?: boolean;
  columns?: 1 | 2;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={choices[0]?.title}
      className={`grid gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}
    >
      {choices.map((choice) => {
        const on = choice.value === value;
        return (
          <label
            key={choice.value}
            data-on={on ? "true" : "false"}
            className={`admin-choice ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={on}
              disabled={disabled}
              onChange={() => onChange(choice.value)}
              className="admin-choice-input"
            />
            <span aria-hidden className="admin-choice-mark">
              <Check className="h-2.5 w-2.5" />
            </span>
            <span className="min-w-0">
              <span className="admin-choice-title block">{choice.title}</span>
              {choice.sub && (
                <span className="admin-choice-sub block">{choice.sub}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ tags */

/**
 * A list of tags, each of which may be taken away.
 *
 * The words are short and plain, so they are typed and confirmed with
 * Enter rather than chosen from a list. A tag that is already there is
 * not added twice.
 */
export function TagInput({
  id,
  name,
  tags,
  onChange,
  suggestions = [],
  placeholder = "Add a tag and press Enter",
}: {
  id: string;
  /** The name the tags are submitted under. */
  name: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function add(raw: string) {
    // The list is put through the same rules the row will be, so that the
    // editor cannot hold more tags than the catalogue keeps.
    const next = normaliseTags([...tags, raw]);
    onChange(next);
    setText("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      {/* What the form carries: the whole list as one piece of JSON. */}
      <input type="hidden" name={name} value={tagsToJson(tags)} />

      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="admin-tag">
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove the tag ${tag}`}
                className="admin-tag-remove"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const value = e.target.value;
          // A comma ends a tag, so it is taken as one.
          if (value.includes(",")) {
            add(value.slice(0, value.indexOf(",")));
            return;
          }
          setText(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
            return;
          }
          if (e.key === "Backspace" && !text && tags.length > 0) {
            remove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (text.trim()) add(text);
        }}
        className="input"
      />

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-gray-400">Often used:</span>
          {suggestions
            .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
            .slice(0, 8)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="admin-chip"
              >
                {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- notes */

/**
 * A short note in a pale blue box.
 *
 * It is used where something needs saying that is not a field — why a
 * field cannot be filled in, or what a setting means.
 */
export function EditorNote({
  icon,
  className = "",
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`admin-editor-note ${className}`.trim()}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
