"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  MessageSquare,
  Users,
  Package,
  Boxes,
  FolderTree,
  FileSpreadsheet,
  RotateCcw,
  Menu,
  X,
  ExternalLink,
  LogOut,
} from "lucide-react";
import type { AdminNavItem } from "./nav";
import { ROLE_LABEL, type Role } from "@/lib/roles";

const ICONS = {
  dashboard: LayoutDashboard,
  orders: ShoppingBag,
  returns: RotateCcw,
  messages: MessageSquare,
  users: Users,
  products: Package,
  inventory: Boxes,
  categories: FolderTree,
  import: FileSpreadsheet,
};

export type AdminUser = {
  name: string;
  email: string;
  role: Role;
};

/**
 * The back office chrome: a dark sidebar on a wide screen, a drawer on a
 * narrow one. The signed-in role decides which links appear.
 */
export function AdminShell({
  user,
  items,
  signOut,
  children,
}: {
  user: AdminUser;
  items: AdminNavItem[];
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const nav = (
    <nav className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              active
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const identity = (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-[13px] font-semibold text-white">
        {user.name}
      </p>
      <p className="truncate text-[12px] text-white/55">{user.email}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
          {ROLE_LABEL[user.role]}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  /*
    The shop's logo, in the two colours it is drawn in.

    The white one is for the dark sidebar: its "Console" is drawn in white
    and disappears against a white background. The dark one is for the
    header bar, which is white — the white logo there left the first half
    of the name invisible, and on a phone, where the sidebar is a drawer
    and the header is all there is, the shop looked like it was called
    "Seller".
  */
  const brandOn = (dark: boolean) => (
    <Link href="/admin" className="flex items-center gap-2">
      <Image
        src={dark ? "/logo.png" : "/logo-white.png"}
        alt="ConsoleSeller"
        width={155}
        height={30}
        priority
        className="h-7 w-auto object-contain"
      />
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
          dark ? "bg-ink text-white/80" : "bg-white/10 text-white/80"
        }`}
      >
        Admin
      </span>
    </Link>
  );

  const brand = brandOn(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar — a drawer below lg, a fixed column above it.

          The list of links scrolls on its own and the identity block stays
          pinned at the bottom. Without that, a short window — a laptop with
          the browser half height, or a phone in landscape — pushes the last
          few links off the bottom of the screen where they cannot be
          reached at all. */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[248px] flex-col bg-ink p-5 lg:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto">
          {brand}
          {nav}
        </div>
        {identity}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-ink p-5">
            <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto">
              <div className="flex items-center justify-between">
                {brand}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
            </div>
            {identity}
          </aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-5 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">{brandOn(true)}</div>

            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink"
              >
                <ExternalLink className="h-4 w-4" />
                View store
              </Link>
            </div>
          </div>
        </header>

        <main className="px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
