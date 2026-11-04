"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Archive, Eye, EyeOff, Loader2, X } from "lucide-react";
import { bulkProductAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";
import type { CatalogueFilters } from "@/lib/types";

/**
 * Bulk selection for the catalogue table.
 *
 * The rows stay on the server; this holds only which ones are ticked. The
 * toolbar sits above the table and the checkboxes sit in it, so the two
 * share one piece of state through the context below.
 *
 * There are two scopes. `page` is the products ticked on this page — a
 * selection never outlives the page it was made on. `all` is every product
 * matching the filters the admin is looking at, however many pages that is.
 * The scope `all` is worked out again on the server when the action runs,
 * so it can never reach a product the admin was not looking at.
 */

type BulkScope = "page" | "all";

type BulkContextValue = {
  selected: string[];
  scope: BulkScope;
  /** Products on this page. */
  total: number;
  /** Products matching the filters, across every page. */
  matchingTotal: number;
  filters: CatalogueFilters;
  isChecked: (slug: string) => boolean;
  toggle: (slug: string) => void;
  toggleAll: () => void;
  selectAllMatching: () => void;
  clear: () => void;
};

const BulkContext = createContext<BulkContextValue | null>(null);

function useBulk() {
  const ctx = useContext(BulkContext);
  if (!ctx) throw new Error("BulkProvider is missing");
  return ctx;
}

export function BulkProvider({
  slugs,
  matchingTotal,
  filters,
  children,
}: {
  slugs: string[];
  matchingTotal: number;
  filters: CatalogueFilters;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [scope, setScope] = useState<BulkScope>("page");

  // A selection only ever covers what is on the page. Changing a filter
  // swaps the rows out, so anything ticked that is no longer visible is
  // dropped — otherwise a bulk action would quietly reach a product the
  // admin cannot see.
  const listKey = slugs.join(",");
  useEffect(() => {
    setSelected((s) => {
      const live = new Set(slugs);
      const kept = s.filter((slug) => live.has(slug));
      return kept.length === s.length ? s : kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const value = useMemo<BulkContextValue>(
    () => ({
      selected,
      scope,
      total: slugs.length,
      matchingTotal,
      filters,
      isChecked: (slug) => scope === "all" || selected.includes(slug),
      toggle: (slug) => {
        // Ticking a row while everything is selected steps back out of
        // "everything matching", keeping this page's rows but that one.
        if (scope === "all") {
          setScope("page");
          setSelected(slugs.filter((s) => s !== slug));
          return;
        }
        setSelected((s) =>
          s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]
        );
      },
      toggleAll: () => {
        if (scope === "all") {
          setScope("page");
          setSelected([]);
          return;
        }
        setSelected((s) => (s.length === slugs.length ? [] : [...slugs]));
      },
      selectAllMatching: () => {
        setScope("all");
        setSelected([...slugs]);
      },
      clear: () => {
        setScope("page");
        setSelected([]);
      },
    }),
    [selected, scope, slugs, matchingTotal, filters]
  );

  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

/** The tick box in one row. */
export function BulkCheckbox({ slug }: { slug: string }) {
  const { isChecked, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      checked={isChecked(slug)}
      onChange={() => toggle(slug)}
      aria-label={`Select ${slug}`}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand accent-brand"
    />
  );
}

/** The tick box in the header that selects the whole page. */
export function BulkSelectAll() {
  const { scope, selected, toggleAll, total } = useBulk();
  const all = scope === "all" || (total > 0 && selected.length === total);
  return (
    <input
      type="checkbox"
      checked={all}
      onChange={toggleAll}
      aria-label="Select every product on this page"
      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand"
    />
  );
}

/**
 * Selects every product matching the filters, not just this page.
 *
 * The action works the list out again on the server, so this is a promise
 * about the filters, not about a snapshot of the page.
 */
export function SelectAllMatching() {
  const { scope, matchingTotal, total, selectAllMatching } = useBulk();
  if (scope === "all" || matchingTotal <= total) return null;

  return (
    <button
      type="button"
      onClick={selectAllMatching}
      className="text-[12.5px] font-medium text-brand hover:underline"
    >
      Select all {matchingTotal} matching products
    </button>
  );
}

const ACTIONS = [
  {
    value: "publish" as const,
    label: "Publish",
    confirm: "publish",
    Icon: Eye,
    hint: "Put these products on sale.",
  },
  {
    value: "delist" as const,
    label: "Delist",
    confirm: "take off sale",
    Icon: EyeOff,
    hint: "Hide these from the shop, keeping their data.",
  },
  {
    value: "archive" as const,
    label: "Archive",
    confirm: "archive",
    Icon: Archive,
    hint: "Retire these, keeping their history. Restorable.",
  },
];

const initial: PanelState = { ok: false };

/**
 * The toolbar that appears once something is ticked. Every action asks
 * first, and there is no bulk delete — a product that should go needs its
 * own look first.
 */
export function BulkToolbar() {
  const { selected, scope, matchingTotal, filters, clear } = useBulk();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const router = useRouter();

  if (scope !== "all" && selected.length === 0) return null;

  const count = scope === "all" ? matchingTotal : selected.length;

  function submit(action: string) {
    const data = new FormData();
    data.set("bulkAction", action);
    data.set("scope", scope);
    if (scope === "all") {
      // The filters go with it, so the server can work out the list itself.
      for (const [key, value] of Object.entries(filters)) {
        if (value) data.set(key, value);
      }
    } else {
      for (const slug of selected) data.append("slugs", slug);
    }
    setConfirming(null);
    startTransition(async () => {
      const res = await bulkProductAction(initial, data);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        clear();
        router.refresh();
      }
    });
  }

  const pendingAction = ACTIONS.find((a) => a.value === confirming);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/25 bg-brand-tint px-4 py-3">
      <span className="text-[13px] font-semibold text-ink">
        {scope === "all"
          ? `All ${count} matching product${count === 1 ? "" : "s"} selected`
          : `${count} selected`}
      </span>

      {pendingAction ? (
        <>
          <span className="text-[13px] text-gray-600">
            {pendingAction.confirm} {count} product
            {count === 1 ? "" : "s"}?
          </span>
          <button
            type="button"
            onClick={() => submit(pendingAction.value)}
            disabled={pending}
            className="btn btn-primary btn-sm"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <pendingAction.Icon className="h-4 w-4" />
            )}
            Yes, {pendingAction.confirm}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
        </>
      ) : (
        ACTIONS.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setConfirming(a.value)}
            title={a.hint}
            className="btn btn-outline btn-sm"
          >
            <a.Icon className="h-4 w-4" />
            {a.label}
          </button>
        ))
      )}

      <button
        type="button"
        onClick={clear}
        aria-label="Clear the selection"
        className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
