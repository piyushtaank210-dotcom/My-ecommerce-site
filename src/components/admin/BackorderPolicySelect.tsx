"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  BACKORDER_POLICIES,
  BACKORDER_POLICY_LABEL,
  type BackorderPolicy,
} from "@/lib/variations";
import { toast } from "@/components/Toaster";

/**
 * Whether the store takes orders for things it does not have.
 *
 * With backorders off, an option that is not on the shelf cannot be bought.
 * With them on, the order goes through, the units that are there are taken,
 * and the missing ones are recorded for the warehouse to chase.
 */
export function BackorderPolicySelect({
  policy,
  canManage,
}: {
  policy: BackorderPolicy;
  canManage: boolean;
}) {
  const [value, setValue] = useState<BackorderPolicy>(policy);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save(next: BackorderPolicy) {
    setValue(next);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backorderPolicy: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setValue(policy);
        toast(data?.error ?? "The policy could not be changed.", "error");
        return;
      }
      toast("The backorder policy has been changed.", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="backorder-policy" className="text-[13px] font-medium text-ink">
        Backorders
      </label>
      <select
        id="backorder-policy"
        value={value}
        disabled={!canManage || busy}
        onChange={(e) => save(e.target.value as BackorderPolicy)}
        className="input h-9 w-auto cursor-pointer text-[13px]"
      >
        {BACKORDER_POLICIES.map((p) => (
          <option key={p} value={p}>
            {BACKORDER_POLICY_LABEL[p]}
          </option>
        ))}
      </select>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      <p className="text-[12.5px] text-gray-500">
        {value === "allow"
          ? "A shopper may order something the shelf does not have. The missing units are recorded on the order."
          : "A shopper may not order something the shelf does not have."}
      </p>
    </div>
  );
}
