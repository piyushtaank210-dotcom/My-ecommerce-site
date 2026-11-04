"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };

export function toast(message: string | undefined, kind: ToastKind = "success") {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(
    new CustomEvent("pf:toast", { detail: { message, kind } })
  );
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TONES = {
  success: "border-green-200 text-green-700",
  error: "border-red-200 text-red-700",
  info: "border-gray-200 text-gray-700",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<{ message: string; kind: ToastKind }>)
        .detail;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, ...detail }]);
      window.setTimeout(
        () => setItems((prev) => prev.filter((t) => t.id !== id)),
        3000
      );
    }
    window.addEventListener("pf:toast", onToast);
    return () => window.removeEventListener("pf:toast", onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-pop ${TONES[t.kind]}`}
          >
            <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <p className="text-[13px] font-medium leading-snug text-ink">
              {t.message}
            </p>
          </div>
        );
      })}
    </div>
  );
}
