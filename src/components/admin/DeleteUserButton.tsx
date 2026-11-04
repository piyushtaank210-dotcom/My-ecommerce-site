"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteUserAction } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

/** Deletes an account. Asks first — this one cannot be undone. */
export function DeleteUserButton({
  userId,
  name,
}: {
  userId: number;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const res = await deleteUserAction(undefined as never, formData(userId));
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${name}`}
        className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-red-600 px-2 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-1 text-[12px] font-medium text-gray-500 hover:bg-gray-100"
      >
        Cancel
      </button>
    </span>
  );
}

/** The action takes a FormData; the button builds one in the browser. */
function formData(id: number): FormData {
  const data = new FormData();
  data.set("id", String(id));
  return data;
}
