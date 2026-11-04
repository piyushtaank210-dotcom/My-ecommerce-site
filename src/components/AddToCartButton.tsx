"use client";

import { useState, useTransition } from "react";
import { ShoppingCart, Loader2, Check } from "lucide-react";
import { addToCartAction } from "@/lib/actions";
import { toast } from "./Toaster";

export function AddToCartButton({
  productSlug,
  variantId = null,
  quantity = 1,
  disabled = false,
  label = "Add to cart",
  className = "btn btn-primary w-full",
}: {
  productSlug: string;
  variantId?: string | null;
  quantity?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const res = await addToCartAction(productSlug, variantId, quantity);
      if (res.ok) {
        setAdded(true);
        toast(res.message, "success");
        window.setTimeout(() => setAdded(false), 1800);
      } else {
        toast(res.message, "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || disabled}
      className={className}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : added ? (
        <>
          <Check className="h-4 w-4" />
          Added
        </>
      ) : (
        <>
          <ShoppingCart className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}
