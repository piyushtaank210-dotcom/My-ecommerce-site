"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  RotateCcw,
  MapPin,
  UserRound,
  Bell,
} from "lucide-react";

export type AccountNavItem = {
  href: string;
  label: string;
  icon: "overview" | "orders" | "returns" | "addresses" | "profile" | "notifications";
};

const ICONS = {
  overview: LayoutDashboard,
  orders: ShoppingBag,
  returns: RotateCcw,
  addresses: MapPin,
  profile: UserRound,
  notifications: Bell,
};

export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: "/account", label: "Overview", icon: "overview" },
  { href: "/account/orders", label: "Orders", icon: "orders" },
  { href: "/account/returns", label: "Returns", icon: "returns" },
  { href: "/account/notifications", label: "Notifications", icon: "notifications" },
  { href: "/account/addresses", label: "Addresses", icon: "addresses" },
  { href: "/account/profile", label: "Profile", icon: "profile" },
];

/** The tabs across the top of the customer's own panel. */
export function AccountNav({ items }: { items: AccountNavItem[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/account"
      ? pathname === "/account"
      : pathname.startsWith(href);

  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-gray-200">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-[13.5px] font-medium transition-colors ${
              active
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
