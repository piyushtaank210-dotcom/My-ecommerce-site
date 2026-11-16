"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  FileText,
  Image as ImageIcon,
  IndianRupee,
  ListChecks,
  Package,
  Search,
  Truck,
  Upload,
} from "lucide-react";

export type AdminSection = {
  /** The id of the section on the page. */
  id: string;
  label: string;
  /** The name of the icon, from the list below. */
  icon: string;
};

const ICONS: Record<string, typeof FileText> = {
  boxes: Boxes,
  text: FileText,
  image: ImageIcon,
  money: IndianRupee,
  list: ListChecks,
  package: Package,
  search: Search,
  truck: Truck,
  upload: Upload,
};

/**
 * The navigation down the side of a long form.
 *
 * A product has more in it than fits on one screen, so the sections are
 * listed here and the one being read is marked. It is sticky, so the list
 * is always to hand however far down the page the reader has gone.
 *
 * On a narrow screen it turns into a row that slides sideways, so it
 * takes a line rather than a column.
 */
export function SectionNav({
  sections,
  title = "On this page",
}: {
  sections: AdminSection[];
  title?: string;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    // The section that is nearest the top of the screen is the one being
    // read. The root margin lifts the line up to the height of the sticky
    // top bar, so a section is counted as read once its heading clears
    // the bar rather than once it touches the top of the window.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="admin-sections" aria-label={title}>
      <p className="admin-sections-title">{title}</p>
      {sections.map((s) => {
        const Icon = ICONS[s.icon] ?? FileText;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-active={active === s.id}
            onClick={(e) => {
              const el = document.getElementById(s.id);
              if (!el) return;
              e.preventDefault();
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              // The hash is written by hand so that the browser's own
              // jump — which is instant — does not fight the smooth one.
              window.history.replaceState(null, "", `#${s.id}`);
            }}
            className="admin-sections-link"
          >
            <Icon className="h-4 w-4" />
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
