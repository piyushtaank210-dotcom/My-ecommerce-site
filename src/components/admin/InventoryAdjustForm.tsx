"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { adjustStockAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";
import {
  ADJUST_MODES,
  ADJUST_MODE_LABEL,
  OTHER_REASON,
  STOCK_REASONS,
} from "@/lib/stock";

const initial: PanelState = { ok: false };

export type AdjustProduct = {
  slug: string;
  name: string;
  variants: { id: string; name: string; stock: number }[];
};

/**
 * Changes a stock level by hand.
 *
 * A change has to say what it is doing and why. The reason is not
 * decoration — it is what the inventory history is made of, and the store
 * cannot change a level without one.
 */
export function InventoryAdjustForm({
  products,
  productSlug,
  variantId,
}: {
  products: AdjustProduct[];
  /** Pre-filled from the URL, so a row's "Adjust" button lands here. */
  productSlug?: string;
  variantId?: string;
}) {
  const [state, formAction] = useActionState(adjustStockAction, initial);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  const [slug, setSlug] = useState(
    productSlug && products.some((p) => p.slug === productSlug)
      ? productSlug
      : (products[0]?.slug ?? "")
  );
  const [variant, setVariant] = useState(variantId ?? "");
  const [mode, setMode] = useState<"set" | "add" | "remove">("add");
  const [reason, setReason] = useState<string>(STOCK_REASONS[0]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      setNote("");
      router.refresh();
    }
  }, [state, router]);

  const product = products.find((p) => p.slug === slug);
  const options = product?.variants ?? [];
  const errors = state.errors ?? {};

  // A product with options is stocked by its options, so the option has to
  // be chosen — there is no product-level count to change.
  const needsOption = options.length > 0;
  const chosen = options.find((o) => o.id === variant) ?? null;

  function pickProduct(next: string) {
    setSlug(next);
    setVariant("");
  }

  return (
    <section
      id="adjust"
      className="rounded-xl border border-gray-200 bg-white p-5"
    >
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
        <SlidersHorizontal className="h-4 w-4 text-brand" />
        Adjust stock
      </h2>
      <p className="mb-4 text-[12.5px] text-gray-500">
        Every change is written down — what the stock was, what it became,
        and why.
      </p>

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="productSlug" className="label">
              Product
            </label>
            <select
              id="productSlug"
              name="productSlug"
              value={slug}
              onChange={(e) => pickProduct(e.target.value)}
              className={`input cursor-pointer ${errors.productSlug ? "input-error" : ""}`}
            >
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.productSlug && (
              <p className="mt-1 text-[12.5px] text-red-600">
                {errors.productSlug}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="variantId" className="label">
              Option
            </label>
            {needsOption ? (
              <select
                id="variantId"
                name="variantId"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="input cursor-pointer"
              >
                <option value="">Choose an option</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.stock} in stock
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="variantId" value="" />
                <p className="input cursor-not-allowed bg-gray-50 text-gray-500">
                  No options — the product itself is stocked
                </p>
              </>
            )}
          </div>

          <div>
            <span className="label">Change</span>
            <div className="flex h-[42px] overflow-hidden rounded-lg border border-gray-200">
              {ADJUST_MODES.map((m) => (
                <label
                  key={m}
                  className={`flex flex-1 cursor-pointer items-center justify-center text-[12.5px] font-medium transition-colors ${
                    mode === m
                      ? "bg-brand text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {ADJUST_MODE_LABEL[m]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="quantity" className="label">
              Units
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={0}
              step={1}
              defaultValue={1}
              className={`input tnum ${errors.quantity ? "input-error" : ""}`}
            />
            {errors.quantity && (
              <p className="mt-1 text-[12.5px] text-red-600">{errors.quantity}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <div>
            <label htmlFor="reason" className="label">
              Reason
            </label>
            <select
              id="reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`input cursor-pointer ${errors.reason ? "input-error" : ""}`}
            >
              {STOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="mt-1 text-[12.5px] text-red-600">{errors.reason}</p>
            )}
          </div>

          <div>
            <label htmlFor="note" className="label">
              Note {reason === OTHER_REASON ? "(required)" : "(optional)"}
            </label>
            <input
              id="note"
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                reason === OTHER_REASON
                  ? "What happened, in a few words."
                  : "Anything worth remembering about this change."
              }
              className="input"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary">
            Save the change
          </button>
          {chosen && (
            <p className="text-[12.5px] text-gray-500">
              {chosen.name} currently has{" "}
              <span className="tnum font-semibold text-ink">{chosen.stock}</span>{" "}
              in stock.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
