/**
 * The HTML a product's description may hold.
 *
 * The description is written in the back office with a formatting toolbar,
 * so it is not plain text any more — it is a small, controlled piece of
 * HTML. Because that HTML is later shown to a shopper, it is filtered
 * before it is stored and again before it is shown: only the tags and the
 * attributes below survive, and everything else is thrown away.
 *
 * The list is deliberately short. A description is a paragraph or two of
 * prose about a console — it needs bold, headings, lists and links, and it
 * needs nothing else. Anything that could carry a script, a frame or a
 * tracking pixel is not on the list, and a tag that is not on the list is
 * removed while the words inside it are kept.
 *
 * The filter runs without a browser, so it can be used on the server as
 * well as in the editor.
 */

/** The tags a description may use. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "mark",
  "small",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
  "sub",
  "sup",
  "a",
]);

/** The tags that never have a closing one. */
const VOID_TAGS = new Set(["br", "hr"]);

/** The attributes each tag may keep. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  span: new Set(["style"]),
  p: new Set(["style"]),
  div: new Set(["style"]),
  ul: new Set(["style"]),
  ol: new Set(["style"]),
  li: new Set(["style"]),
  h2: new Set(["style"]),
  h3: new Set(["style"]),
  h4: new Set(["style"]),
  h5: new Set(["style"]),
  h6: new Set(["style"]),
  mark: new Set(["style"]),
  blockquote: new Set(["style"]),
};

/** The style properties a description may carry, and what each may say. */
const ALLOWED_STYLES: Record<string, RegExp> = {
  "font-size": /^\d{1,4}(\.\d{1,2})?(px|em|rem|pt|%)?$/i,
  color: /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s,.%]+\))$/i,
  "background-color": /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s,.%]+\))$/i,
  "font-weight": /^(normal|bold|bolder|lighter|[1-9]00)$/i,
  "font-style": /^(normal|italic|oblique)$/i,
  "text-decoration": /^(none|underline|line-through|overline)$/i,
  "text-align": /^(left|right|center|justify)$/i,
};

/** The links a description may point at. */
const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#|[^a-z0-9+.-]|$)/i;

/**
 * Whether a link may be put in a description.
 *
 * The editor asks this before it makes the link, and the filter asks it
 * again before the link is kept — so the two agree, and a link the editor
 * allows is a link the description keeps.
 */
export function isSafeLink(url: string): boolean {
  return SAFE_LINK.test(url.trim());
}

/**
 * The blocks that are removed whole, content and all.
 *
 * Their content is removed too: the words inside a `<script>` or a
 * `<style>` are code, not prose, and leaving them behind would put
 * `alert(1)` on the page as text.
 */
const DANGEROUS_BLOCKS = [
  /<script\b[\s\S]*?<\/script\s*>/gi,
  /<style\b[\s\S]*?<\/style\s*>/gi,
  /<iframe\b[\s\S]*?<\/iframe\s*>/gi,
  /<object\b[\s\S]*?<\/object\s*>/gi,
  /<embed\b[^>]*>/gi,
  /<applet\b[\s\S]*?<\/applet\s*>/gi,
  /<svg\b[\s\S]*?<\/svg\s*>/gi,
  /<math\b[\s\S]*?<\/math\s*>/gi,
  /<template\b[\s\S]*?<\/template\s*>/gi,
  /<noscript\b[\s\S]*?<\/noscript\s*>/gi,
  /<!--[\s\S]*?-->/g,
  /<!\[CDATA\[[\s\S]*?\]\]>/g,
  /<!DOCTYPE[^>]*>/gi,
];

/** A tag, with its attributes. */
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;

/** One attribute of a tag. */
const ATTR =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

/**
 * The style declarations that are safe to keep.
 *
 * Each declaration is checked against the pattern for its property, so a
 * value that tries to reach outside — `url(...)`, `expression(...)` — is
 * dropped rather than escaped.
 */
function filterStyle(value: string): string | null {
  const kept: string[] = [];
  for (const part of value.split(";")) {
    const [rawProp, ...rest] = part.split(":");
    if (!rawProp || rest.length === 0) continue;
    const prop = rawProp.trim().toLowerCase();
    const pattern = ALLOWED_STYLES[prop];
    if (!pattern) continue;
    const val = rest.join(":").trim();
    if (!pattern.test(val)) continue;
    kept.push(`${prop}: ${val}`);
  }
  return kept.length ? kept.join("; ") : null;
}

/**
 * The attributes of a tag that may be kept.
 *
 * An attribute that is not on the list is dropped, and so is anything that
 * begins with `on` — the handlers that run code.
 */
function filterAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const kept: string[] = [];
  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR.exec(raw))) {
    const name = match[1].toLowerCase();
    if (name.startsWith("on")) continue;
    if (!allowed.has(name)) continue;
    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name === "style") {
      const style = filterStyle(value);
      if (!style) continue;
      kept.push(`style="${style.replace(/"/g, "&quot;")}"`);
      continue;
    }
    if (name === "href") {
      const url = value.trim();
      if (!isSafeLink(url)) continue;
      kept.push(`href="${url.replace(/"/g, "&quot;")}"`);
      continue;
    }
    if (name === "target") {
      kept.push('target="_blank"');
      continue;
    }
    if (name === "rel") {
      kept.push('rel="noopener noreferrer"');
      continue;
    }
    kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return kept.length ? ` ${kept.join(" ")}` : "";
}

/**
 * The HTML of a description, with everything unsafe taken out.
 *
 * A tag that is not on the list is removed and the words inside it are
 * kept, so a description written with the wrong tag still reads properly.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";

  let working = html;
  for (const block of DANGEROUS_BLOCKS) {
    working = working.replace(block, "");
  }

  // The tags that are still open, so that the ones left hanging at the end
  // may be closed and the ones closed twice may be dropped.
  const open: string[] = [];
  const out: string[] = [];
  let last = 0;

  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(working))) {
    out.push(working.slice(last, match.index));
    last = match.index + match[0].length;

    const name = match[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;

    const isClosing = match[0].startsWith("</");
    if (isClosing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      // Anything opened inside it is closed first, so the result is balanced.
      for (let i = open.length - 1; i >= at; i--) {
        out.push(`</${open[i]}>`);
      }
      open.length = at;
      continue;
    }

    const attrs = filterAttrs(name, match[2] ?? "");
    if (VOID_TAGS.has(name)) {
      out.push(`<${name} />`);
      continue;
    }
    out.push(`<${name}${attrs}>`);
    open.push(name);
  }

  out.push(working.slice(last));
  for (let i = open.length - 1; i >= 0; i--) {
    out.push(`</${open[i]}>`);
  }

  return out.join("");
}

/**
 * The plain words of a description.
 *
 * Used where a description has to be a single line — a search result, a
 * card, the summary a screen reader reads out.
 */
export function richTextToPlain(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a description holds anything but plain words.
 *
 * A description that was written before the editor existed holds plain
 * text, and there is no reason to treat it as markup.
 */
export function isPlainText(html: string): boolean {
  return !/<[a-zA-Z/!]/.test(html);
}

/**
 * The description as it is written into the row.
 *
 * Plain words are kept exactly as they were typed, so that the products
 * that were written before the editor existed are not changed by it.
 * Anything that holds markup is filtered first.
 */
export function prepareRichText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (isPlainText(trimmed)) return trimmed;
  return sanitizeRichText(trimmed).trim() || null;
}
