"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { toggleProductListingAction } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

/**
 * The delist switch. A listed product shows in the shop; a delisted one is
 * pulled out of every listing but keeps its page, its history and its stock.
 *
 * It comes in two shapes. The small one sits in a table row and says
 * "Listed" or "Delisted". The larger one sits in the product editor and
 * answers the question the administrator is actually asking — is this
 * product going to be seen by a customer?
 */
export function ProductListingToggle({
  slug,
  listed,
  disabled = false,
  variant = "pill",
  onLabel = "Listed",
  offLabel = "Delisted",
}: {
  slug: string;
  listed: boolean;
  /** Set when there is no product to switch yet. */
  disabled?: boolean;
  variant?: "pill" | "switch";
  /** What the control says when the product is in the shop. */
  onLabel?: string;
  /** What the control says when it is not. */
  offLabel?: string;
}) {
  // The button shows what the server says, with an optimistic value only
  // while the change is in flight. Holding the state in useState instead
  // would leave the button showing the old value after something else in
  // the back office changed the product — a bulk publish, say.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const isListed = optimistic ?? listed;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    if (disabled) return;
    const next = !isListed;
    setOptimistic(next);
    startTransition(async () => {
      const res = await toggleProductListingAction(slug, next);
      setOptimistic(null);
      if (res.ok) {
        toast(res.message, "success");
      } else {
        toast(res.message, "error");
      }
      router.refresh();
    });
  }

  if (variant === "switch") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || pending}
        aria-pressed={isListed}
        title={
          disabled
            ? "Save the product first, then you can choose whether it shows in the shop."
            : isListed
              ? "Take this product out of the shop"
              : "Put this product back in the shop"
        }
        className="admin-toggle !h-9 !gap-2.5 !px-3 !text-[12.5px]"
        data-on={isListed ? "true" : "false"}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isListed ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
        {isListed ? onLabel : offLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || pending}
      aria-pressed={isListed}
      title={isListed ? "Delist this product" : "Put this product back in the shop"}
      className="admin-toggle"
      data-on={isListed ? "true" : "false"}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isListed ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <EyeOff className="h-3.5 w-3.5" />
      )}
      {isListed ? "Listed" : "Delisted"}
    </button>
  );
}
