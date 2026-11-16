"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toggleProductListingAction } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

/**
 * The delist switch. A listed product shows in the shop; a delisted one is
 * pulled out of every listing but keeps its page, its history and its stock.
 */
export function ProductListingToggle({
  slug,
  listed,
}: {
  slug: string;
  listed: boolean;
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

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
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
