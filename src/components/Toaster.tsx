"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { FLASH_COOKIE, decodeFlash } from "@/lib/flash";

type ToastKind = "success" | "error" | "info";

/** Where a toast sits on the screen. */
type ToastPlacement = "bottom" | "top";

/** What a toast is made of, and how long it stays. */
type ToastOptions = {
  /**
   * How long it stays, in milliseconds. A message that has to be read
   * and acted on is given longer than one that is only a confirmation.
   */
  duration?: number;
  /**
   * Where it sits. A toast that stands away from the field it is
   * about is put at the top, so that the keyboard of a phone cannot
   * hide it.
   */
  placement?: ToastPlacement;
  /**
   * A name for it. A toast with the same name replaces the one before
   * it, so that a second message of the same kind does not pile up.
   */
  key?: string;
};

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
  placement: ToastPlacement;
  duration: number;
  key?: string;
};

export function toast(
  message: string | undefined,
  kind: ToastKind = "success",
  options: ToastOptions = {}
) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(
    new CustomEvent("pf:toast", { detail: { message, kind, ...options } })
  );
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TONES = {
  success: "border-green-200 text-green-700",
  error: "border-red-200 text-red-700",
  info: "border-gray-200 text-gray-700",
};

/**
 * The message the shop left for this page, if it left one.
 *
 * A server action cannot raise a toast on a page it has already sent
 * away, so a message that has to survive a redirect is written down in
 * a cookie. This reads it, shows it, and clears it, so that it is shown
 * once and once only.
 */
function takeFlash(): { message: string; kind: ToastKind } | null {
  const all = document.cookie.split(";");
  const found = all.find((c) => c.trim().startsWith(`${FLASH_COOKIE}=`));
  if (!found) return null;

  const raw = found.slice(found.indexOf("=") + 1);
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  return decodeFlash(raw);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (
        event as CustomEvent<{
          message: string;
          kind: ToastKind;
          duration?: number;
          placement?: ToastPlacement;
          key?: string;
        }>
      ).detail;
      const id = Date.now() + Math.random();
      const duration = detail.duration ?? 3000;
      setItems((prev) => {
        // A toast with a name replaces the one that had the same name,
        // so that only the latest of a kind is ever on the screen.
        const kept = detail.key
          ? prev.filter((t) => t.key !== detail.key)
          : prev;
        return [
          ...kept,
          {
            id,
            message: detail.message,
            kind: detail.kind,
            placement: detail.placement ?? "bottom",
            duration,
            key: detail.key,
          },
        ];
      });
      window.setTimeout(
        () => setItems((prev) => prev.filter((t) => t.id !== id)),
        duration
      );
    }
    window.addEventListener("pf:toast", onToast);
    return () => window.removeEventListener("pf:toast", onToast);
  }, []);

  // The page the shop sent the customer to may have a message waiting
  // for it. It is read on the way in and on every move to another page,
  // because the layout — and so this toast — stays put while the
  // customer walks around the shop.
  useEffect(() => {
    const flash = takeFlash();
    if (!flash) return;
    toast(flash.message, flash.kind);
  }, [pathname]);

  if (items.length === 0) return null;

  const atBottom = items.filter((t) => t.placement === "bottom");
  const atTop = items.filter((t) => t.placement === "top");

  return (
    <>
      {atTop.length > 0 && (
        <div className="pointer-events-none fixed right-5 top-[76px] z-[200] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2 lg:top-[88px]">
          {atTop.map((t) => (
            <Toast key={t.id} toast={t} />
          ))}
        </div>
      )}
      {atBottom.length > 0 && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
          {atBottom.map((t) => (
            <Toast key={t.id} toast={t} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * One message, in the shop's own style.
 *
 * A message that is an error is announced at once, because the
 * customer has to act on it; the rest are left to be read.
 */
function Toast({ toast: t }: { toast: ToastItem }) {
  const Icon = ICONS[t.kind];
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-pop ${TONES[t.kind]}`}
    >
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      <p className="text-[13px] font-medium leading-snug text-ink">
        {t.message}
      </p>
    </div>
  );
}
