"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2, Loader2 } from "lucide-react";
import type { CartLine } from "@/lib/types";
import { money } from "@/lib/format";
import { updateCartAction, removeFromCartAction } from "@/lib/actions";
import { toast } from "./Toaster";

export function CartLineItem({ line }: { line: CartLine }) {
  const [pending, startTransition] = useTransition();
  const max = line.variant ? line.variant.stock : line.product.stock;

  function setQty(next: number) {
    startTransition(async () => {
      await updateCartAction(line.id, next);
    });
  }

  function remove() {
    startTransition(async () => {
      await removeFromCartAction(line.id);
      toast(`${line.product.name} removed from cart`, "info");
    });
  }

  return (
    <article className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3.5 sm:gap-4 sm:p-4">
      <Link
        href={`/product/${line.product.slug}`}
        className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-50 sm:h-24 sm:w-24"
      >
        {line.product.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={line.product.image}
            alt={line.product.name}
            className="h-full w-full object-contain p-2"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {line.product.brand && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">
                {line.product.brand}
              </p>
            )}
            <h3 className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">
              <Link href={`/product/${line.product.slug}`}>{line.product.name}</Link>
            </h3>
            {line.variant && (
              <p className="mt-1 text-[12.5px] text-gray-500">
                {line.variant.name}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Remove ${line.product.name} from cart`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9 sm:p-2"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          <div className="flex h-10 items-center rounded-lg border border-gray-200 sm:h-9">
            <button
              type="button"
              onClick={() => setQty(line.quantity - 1)}
              disabled={pending || line.quantity <= 1}
              aria-label="Decrease quantity"
              className="grid h-10 w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35 sm:h-9 sm:w-9"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="tnum w-8 text-center text-[13.5px] font-semibold text-ink">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQty(line.quantity + 1)}
              disabled={pending || line.quantity >= max}
              aria-label="Increase quantity"
              className="grid h-10 w-10 place-items-center text-gray-500 transition-colors hover:text-ink disabled:opacity-35 sm:h-9 sm:w-9"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="text-right">
            <p className="tnum text-[17px] font-bold text-ink">
              {money(line.lineTotal)}
            </p>
            {line.unitMrp > line.unitPrice && (
              <p className="price-strike tnum text-[12px]">
                {money(line.unitMrp * line.quantity)}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
