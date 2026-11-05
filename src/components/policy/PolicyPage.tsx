import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";

/**
 * One piece of content inside a policy section.
 *
 * `note` renders as a highlighted callout — used for the refund timeline,
 * for the placeholders the owner still has to fill in, and for the points
 * that matter most (the statutory-rights wording, for instance).
 */
export type PolicyBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h3"; text: string }
  | { kind: "note"; text: string; tone?: "brand" | "amber" };

export type PolicySection = {
  /** Anchor id, also used for the table of contents. */
  id: string;
  heading: string;
  blocks: PolicyBlock[];
};

export type PolicyDoc = {
  title: string;
  eyebrow: string;
  intro: string;
  updated: string;
  sections: PolicySection[];
};

export function PolicyPage({ doc }: { doc: PolicyDoc }) {
  return (
    <div className="container-x py-8">
      <Breadcrumbs
        items={[{ label: "Customer Support" }, { label: doc.title }]}
      />

      <header className="mb-8 max-w-3xl">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
          {doc.eyebrow}
        </p>
        <h1 className="mt-3 text-[28px] font-bold text-ink sm:text-[34px]">
          {doc.title}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-gray-600">
          {doc.intro}
        </p>
        <p className="mt-3 text-[12.5px] text-gray-500">Last updated: {doc.updated}</p>
      </header>

      <div className="mx-auto max-w-[1120px] gap-12 lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
        {/* Table of contents */}
        <nav
          aria-label="On this page"
          className="mb-8 lg:sticky lg:top-24 lg:mb-0 lg:self-start"
        >
          <p className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink">
            On this page
          </p>
          <ol className="space-y-1.5 border-l border-gray-200 pl-4">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block text-[13px] leading-snug text-gray-500 transition-colors hover:text-brand"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* The policy itself */}
        <div className="max-w-[760px]">
          {doc.sections.map((section, i) => (
            <section
              key={section.id}
              id={section.id}
              className={i === 0 ? "scroll-mt-28" : "scroll-mt-28 mt-10"}
            >
              <h2 className="text-[19px] font-bold leading-snug text-ink">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {section.blocks.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </div>
            </section>
          ))}

          <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-[13px] leading-relaxed text-gray-600">
              Questions about this policy?{" "}
              <Link href="/contact" className="font-semibold text-brand hover:underline">
                Contact our support team
              </Link>{" "}
              or read the{" "}
              <Link href="/refund-policy" className="font-semibold text-brand hover:underline">
                refund and return policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ block }: { block: PolicyBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="break-words text-[14px] leading-[1.75] text-gray-600">
          <Placeholders text={block.text} />
        </p>
      );

    case "h3":
      return (
        <h3 className="pt-1 text-[15px] font-bold text-ink">
          <Placeholders text={block.text} />
        </h3>
      );

    case "ul":
      return (
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-[1.7] text-gray-600">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
              <span className="min-w-0 break-words">
                <Placeholders text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className="space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-[1.7] text-gray-600">
              <span className="tnum mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-tint text-[11px] font-bold text-brand">
                {i + 1}
              </span>
              <span className="min-w-0 break-words">
                <Placeholders text={item} />
              </span>
            </li>
          ))}
        </ol>
      );

    case "note":
      return (
        <div
          className={`rounded-xl border p-4 ${
            block.tone === "amber"
              ? "border-amber-200 bg-amber-50"
              : "border-brand/20 bg-brand-tint"
          }`}
        >
          <p
            className={`text-[13.5px] leading-[1.7] ${
              block.tone === "amber" ? "text-amber-900" : "text-brand"
            }`}
          >
            <Placeholders text={block.text} />
          </p>
        </div>
      );
  }
}

/**
 * Square brackets mark the details the site owner still needs to fill in.
 * They are highlighted so they are easy to find — search the page for
 * "[" and everything outstanding stands out.
 */
function Placeholders({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[") && part.endsWith("]") ? (
          <span
            key={i}
            className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
