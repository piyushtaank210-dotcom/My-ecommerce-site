"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react";
import type { AdminNavItem } from "./nav";
import { ADMIN_NAV_GROUPS } from "./nav";
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

const COLLAPSE_KEY = "consoleseller.admin.sidebar";

/**
 * The back office chrome: a dark sidebar on a wide screen, a drawer on a
 * narrow one. The signed-in role decides which links appear.
 *
 * The sidebar can be folded away to a rail of icons, which leaves the
 * whole of the screen for the work. The choice is remembered.
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
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // The folded-away state is read after the page has loaded, so that the
  // server-rendered markup and the first paint agree.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      /* A browser that will not keep the choice simply starts folded out. */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* Nothing to do — the choice is simply not remembered. */
      }
      return next;
    });
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  /**
   * The page that is open, worked out from the address. The longest
   * matching destination wins, so that a product's own page shows the
   * catalogue rather than the overview.
   */
  const current = items
    .filter((item) => isActive(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  /**
   * The list of destinations.
   *
   * It is drawn twice — once in the fixed sidebar and once in the drawer
   * on a narrow screen — so the two carry different labels: two elements
   * with the same accessible name would be two navigation landmarks of
   * the same name, which is a screen reader's problem to sort out.
   */
  const nav = (label: string) => (
    <nav className="flex flex-col" aria-label={label}>
      {ADMIN_NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="mb-1">
            <p className="admin-nav-group">{group}</p>
            <div className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className="admin-nav-link"
                  >
                    <Icon className="admin-nav-icon" />
                    <span className="admin-nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const identity = (
    <div className="admin-sidebar-foot">
      <p className="admin-sidebar-user truncate">{user.name}</p>
      <p className="admin-sidebar-meta truncate">{user.email}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="admin-sidebar-role">{ROLE_LABEL[user.role]}</span>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
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
        className="h-6 w-auto object-contain sm:h-7"
      />
      <span
        className={`hidden rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider sm:inline-flex ${
          dark ? "bg-ink text-white/80" : "bg-white/10 text-white/80"
        }`}
      >
        Admin
      </span>
    </Link>
  );

  const brand = brandOn(false);

  return (
    <div className="admin-root admin-shell">
      {/* Sidebar — a drawer below lg, a fixed column above it.

          The list of links scrolls on its own and the identity block stays
          pinned at the bottom. Without that, a short window — a laptop with
          the browser half height, or a phone in landscape — pushes the last
          few links off the bottom of the screen where they cannot be
          reached at all. */}
      <aside
        className="admin-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div
          className={`flex items-center gap-2 px-4 pb-1 pt-4 ${
            collapsed ? "flex-col" : ""
          }`}
        >
          {!collapsed && <div className="min-w-0 flex-1">{brand}</div>}
          {collapsed && (
            <Link
              href="/admin"
              aria-label="ConsoleSeller"
              className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg"
            >
              <Image
                src="/icon-192.png"
                alt="ConsoleSeller"
                width={32}
                height={32}
                priority
                className="h-8 w-8 object-cover"
              />
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand the sidebar" : "Fold the sidebar away"}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white lg:grid"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="admin-sidebar-scroll">{nav("Back office")}</div>
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
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-ink">
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
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
            <div className="min-h-0 flex-1 overflow-y-auto">{nav("Back office menu")}</div>
            {identity}
          </aside>
        </div>
      )}

      <div className="admin-body" data-sidebar={collapsed ? "collapsed" : "full"}>
        {/* Top bar */}
        <header className="admin-topbar">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">{brandOn(true)}</div>

          {/* Where the reader is, so that a long page still says what it
              is part of. */}
          <div className="hidden min-w-0 items-center gap-1.5 text-[13px] lg:flex">
            {current && current.group !== current.label && (
              <>
                <span className="font-medium text-gray-400">
                  {current.group}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              </>
            )}
            <span className="truncate font-semibold text-ink">
              {current?.label ?? "Back office"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              aria-label="View store"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View store</span>
            </Link>
          </div>
        </header>

        <main className="admin-main">
          <div className="admin-frame">{children}</div>
        </main>
      </div>
    </div>
  );
}
