/**
 * The primary navigation, shared by the desktop header and the mobile
 * drawer so the two never drift apart.
 */
export type NavLink = {
  href: string;
  label: string;
  /** The one destination that gets the blue treatment at rest. */
  accent?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", accent: true },
  { href: "/shop", label: "Shop Now" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];
