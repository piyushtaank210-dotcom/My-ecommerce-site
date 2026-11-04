"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export type SpecRow = { label: string; value: string };

/**
 * The labels worth suggesting.
 *
 * These are the things a buyer asks about a console, a controller or an
 * accessory. They are a shortcut, not a limit — anything can be typed.
 */
const SUGGESTIONS = [
  "Storage",
  "Connectivity",
  "Compatibility",
  "Battery life",
  "Ports",
  "Output",
  "Wi-Fi",
  "Colours",
  "Weight",
  "In the box",
  "Warranty",
  "Dimensions",
];

/**
 * The specifications on the product form.
 *
 * Each row is a label and a value. A row with no label is not a
 * specification, so it is dropped when the form is saved.
 */
export function ProductSpecs({
  specs,
  disabled = false,
}: {
  specs: SpecRow[];
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<SpecRow[]>(
    specs.length ? specs : [{ label: "", value: "" }]
  );

  function setRow(index: number, patch: Partial<SpecRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow(label = "") {
    setRows((current) => [...current, { label, value: "" }]);
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [{ label: "", value: "" }];
    });
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} className="mb-2 flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              name="specLabel"
              value={row.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
              disabled={disabled}
              placeholder="Storage"
              aria-label={`Specification ${i + 1} name`}
              className="input h-9 text-[13px]"
            />
            <input
              type="text"
              name="specValue"
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              disabled={disabled}
              placeholder="1TB NVMe SSD"
              aria-label={`Specification ${i + 1} value`}
              className="input h-9 text-[13px]"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            disabled={disabled}
            aria-label={`Remove specification ${i + 1}`}
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addRow()}
          disabled={disabled}
          className="btn btn-outline btn-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a specification
        </button>
        <span className="text-[12px] text-gray-400">Or start from one of:</span>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addRow(s)}
              disabled={disabled}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-600 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
