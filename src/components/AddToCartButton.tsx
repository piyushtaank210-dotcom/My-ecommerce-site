"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Loader2, Check } from "lucide-react";
import { addToCartAction } from "@/lib/purchase-actions";
import { SIGN_IN_REQUIRED } from "@/lib/sign-in";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  /**
   * The guard that stops a second click.
   *
   * Two clicks in the same moment both find the button still enabled,
   * because the page has not been drawn again between them. This is set
   * the moment a click arrives, so the second one is turned away.
   */
  const working = useRef(false);

  function handleClick() {
    if (working.current) return;
    working.current = true;

    startTransition(async () => {
      const res = await addToCartAction(productSlug, variantId, quantity);

      // The cart belongs to the customer, so the shop asks for a sign-in
      // before anything goes in it. The toast is raised at once, and the
      // move to the sign-in page waits a moment so that it can be read.
      if (res.needsLogin) {
        toast(SIGN_IN_REQUIRED, "info");
        const loginUrl = res.loginUrl;
        if (loginUrl) {
          // The guard stays on: the page is about to change.
          window.setTimeout(() => router.push(loginUrl), 1200);
        } else {
          working.current = false;
        }
        return;
      }

      working.current = false;

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
