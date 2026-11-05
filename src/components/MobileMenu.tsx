"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Gamepad2, Home, Info, Mail, Search } from "lucide-react";
import { NAV_LINKS } from "./nav-links";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/": Home,
  "/shop": Gamepad2,
  "/about": Info,
  "/contact": Mail,
};

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/*
        The drawer is portalled to the body on purpose. The header carries a
        `backdrop-filter`, which makes it the containing block for any fixed
        descendant — so a drawer rendered inside it would be sized to the
        header strip instead of the viewport.
      */}
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-ink/40"
            />
            <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-pop">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-5">
                <Link href="/" onClick={() => setOpen(false)} aria-label="ConsoleSeller Home">
                  <Image
                    src="/logo.png"
                    alt="ConsoleSeller"
                    width={150}
                    height={29}
                    className="h-7 w-auto object-contain"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-gray-200 p-4">
                <Link
                  href="/search"
                  onClick={() => setOpen(false)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-[14px] text-gray-500"
                >
                  <Search className="h-4 w-4" />
                  Search products
                </Link>
              </div>

              <nav className="flex-1 overflow-y-auto p-3">
                {NAV_LINKS.map((link) => {
                  const Icon = ICONS[link.href] ?? Gamepad2;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={
                        link.accent
                          ? "mb-1 flex items-center gap-3 rounded-lg bg-brand-tint px-3 py-3 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white"
                          : "flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-brand hover:text-white"
                      }
                    >
                      <Icon className="h-4 w-4 text-brand" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
