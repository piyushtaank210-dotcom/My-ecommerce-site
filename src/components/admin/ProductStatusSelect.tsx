"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
  type ProductStatus,
} from "@/lib/product-status";
import { setProductStatusAction } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

/**
 * Where a product sits in the catalogue's workflow: a draft, on sale, or
 * archived. Publishing also un-delists the product, so it actually appears.
 */
export function ProductStatusSelect({
  slug,
  status,
  disabled = false,
}: {
  slug: string;
  status: ProductStatus;
  disabled?: boolean;
}) {
  // The dropdown shows what the server says, with an optimistic value only
  // while the change is in flight. Holding the state in useState instead
  // would leave it showing the old value after something else in the back
  // office changed the product — a bulk publish, say.
  const [optimistic, setOptimistic] = useState<ProductStatus | null>(null);
  const current = optimistic ?? status;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: string) {
    const previous = current;
    setOptimistic(next as ProductStatus);
    startTransition(async () => {
      const res = await setProductStatusAction(slug, next);
      setOptimistic(null);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
      else setOptimistic(previous);
    });
  }

  return (
    <select
      value={current}
      disabled={disabled || pending}
      aria-label={`Status for ${slug}`}
      onChange={(e) => change(e.target.value)}
      className="h-8 cursor-pointer rounded-lg border border-gray-200 bg-white px-2 text-[12px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {PRODUCT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {PRODUCT_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
