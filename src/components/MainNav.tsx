"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./nav-links";

/**
 * The primary navigation, and the centre section of the header.
 *
 * It is a grid item rather than a flex child, so `justify-self-center`
 * centres it inside its own track — and because the header's outer tracks
 * are equal (1fr each), that track is the middle of the whole bar.
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center justify-self-center gap-1.5 lg:flex">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href;
        const base =
          "rounded-lg px-3 py-2 text-[14px] transition-colors duration-150";

        // Every option reacts to the pointer in the same way — the same
        // solid blue on hover — so the bar reads as one set of links rather
        // than one button with three labels beside it. Only the resting
        // state differs, and that is what marks the main option.
        const hover = "hover:bg-brand hover:text-white";

        const className = link.accent
          ? active
            ? `${base} bg-brand font-semibold text-white hover:bg-brand-dark`
            : `${base} bg-brand-tint font-semibold text-brand ${hover}`
          : active
            ? `${base} bg-brand-tint font-semibold text-brand ${hover}`
            : `${base} font-medium text-gray-600 ${hover}`;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
