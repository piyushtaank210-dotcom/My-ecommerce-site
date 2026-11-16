"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Loader2, Trash2 } from "lucide-react";
import {
  archiveProductAction,
  deleteProductAction,
  duplicateProductAction,
  restoreProductAction,
} from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

/**
 * The row actions on the catalogue table.
 *
 * Archiving is the default way to retire a product: it comes off sale and
 * keeps its data, its stock and its order history. Duplicating makes a copy
 * as a draft, so it cannot go on sale before somebody has looked at it.
 * Deleting is the last resort, is only offered to administrators, and asks
 * first.
 */
export function ProductRowActions({
  slug,
  name,
  archived,
  canDelete,
}: {
  slug: string;
  name: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function run(action: "archive" | "restore" | "delete" | "duplicate") {
    startTransition(async () => {
      const res =
        action === "archive"
          ? await archiveProductAction(slug)
          : action === "restore"
            ? await restoreProductAction(slug)
            : action === "duplicate"
              ? await duplicateProductAction(slug)
              : await deleteProductAction(slug);

      toast(res.message, res.ok ? "success" : "error");
      if (!res.ok) {
        setConfirming(false);
        return;
      }
      // A copy lands at the end of the catalogue as a draft, so it is
      // opened straight away rather than left to be looked for.
      if (res.href) router.push(res.href);
      else router.refresh();
    });
  }

  return (
    <span className="admin-row-actions">
      <button
        type="button"
        onClick={() => run("duplicate")}
        disabled={pending}
        title="Make a copy as a draft"
        aria-label={`Duplicate ${name}`}
        className="admin-icon-btn admin-icon-btn--brand"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>

      {archived ? (
        <button
          type="button"
          onClick={() => run("restore")}
          disabled={pending}
          title="Put this product back on sale"
          aria-label={`Restore ${name}`}
          className="admin-icon-btn admin-icon-btn--good"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArchiveRestore className="h-4 w-4" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => run("archive")}
          disabled={pending}
          title="Take this product off sale, keeping its data and history"
          aria-label={`Archive ${name}`}
          className="admin-icon-btn admin-icon-btn--warn"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
      )}

      {canDelete &&
        (confirming ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => run("delete")}
              disabled={pending}
              className="btn btn-danger btn-sm disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Delete"
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Delete this product for good"
            aria-label={`Delete ${name}`}
            className="admin-icon-btn admin-icon-btn--bad"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ))}
    </span>
  );
}
