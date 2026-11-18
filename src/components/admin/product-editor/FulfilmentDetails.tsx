"use client";

import { useState } from "react";
import { Info, Ruler } from "lucide-react";
import { Field } from "@/components/admin/ui/Field";
import { EditorNote } from "./fields";

/**
 * The third section of the editor: how big the thing is and how heavy it
 * is, which is what the shop needs to know to send it.
 *
 * The shop keeps its sizes in centimetres and its weights in grams, so
 * that every product is measured the same way. The unit dropdowns are
 * there so that a size may be typed in the unit it is written down in;
 * what is saved is always the same.
 */

/** How many centimetres one of each unit is. */
const LENGTH_UNITS = {
  cm: { label: "cm", factor: 1 },
  mm: { label: "mm", factor: 0.1 },
  inch: { label: "in", factor: 2.54 },
} as const;

/** How many grams one of each unit is. */
const WEIGHT_UNITS = {
  g: { label: "g", factor: 1 },
  kg: { label: "kg", factor: 1000 },
  lb: { label: "lb", factor: 453.592 },
} as const;

type LengthUnit = keyof typeof LENGTH_UNITS;
type WeightUnit = keyof typeof WEIGHT_UNITS;

/** The measurements the shop keeps, as they are now. */
export type Measurements = {
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
};

/**
 * One measurement, in the unit the reader is using.
 *
 * The value that is typed is turned into the shop's own unit before it is
 * saved, so the same product is always stored the same way however it was
 * measured. What is saved is carried in a hidden box, so that the field
 * the reader types in and the number that is stored cannot drift apart.
 */
function Measurement({
  id,
  name,
  label,
  base,
  units,
  unit,
  onUnit,
  onBase,
  hint,
  error,
  step = "any",
}: {
  id: string;
  /** The name the measurement is submitted under. */
  name: string;
  label: string;
  /** The measurement in the shop's own unit. */
  base: number | null;
  /** The units the reader may measure it in. */
  units: Record<string, { label: string; factor: number }>;
  unit: string;
  onUnit: (unit: string) => void;
  onBase: (value: number | null) => void;
  hint?: string;
  error?: string;
  step?: string;
}) {
  // How many of the chosen unit one of the shop's unit is.
  const factor = units[unit]?.factor ?? 1;

  const shown =
    base === null || base === undefined
      ? ""
      : String(Math.round((base / factor) * 1000) / 1000);

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          min={0}
          step={step}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onBase(null);
              return;
            }
            const value = Number(raw);
            if (!Number.isFinite(value)) return;
            onBase(Math.round(value * factor));
          }}
          className="input tnum min-w-0 flex-1"
        />
        <select
          aria-label={`The unit of ${label}`}
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
          className="input !w-[84px] shrink-0 cursor-pointer"
        >
          {Object.entries(units).map(([key, u]) => (
            <option key={key} value={key}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {/* What the form carries is always in the shop's own unit. */}
      <input type="hidden" name={name} value={base ?? ""} />
    </Field>
  );
}

export function FulfilmentDetails({
  initial,
  onDirty,
}: {
  /** The measurements the product already has. */
  initial: Measurements;
  /** Says that something has been changed and not yet saved. */
  onDirty: () => void;
}) {
  const [dimUnit, setDimUnit] = useState<LengthUnit>("cm");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("g");

  const [length, setLength] = useState(initial.length);
  const [width, setWidth] = useState(initial.width);
  const [height, setHeight] = useState(initial.height);
  const [weight, setWeight] = useState(initial.weight);

  const box = [length, width, height].filter(
    (n): n is number => typeof n === "number"
  );

  return (
    <section id="section-fulfilment" className="admin-editor-section">
      <div className="admin-editor-section-head">
        <div>
          <h2 className="admin-editor-section-title">Fulfilment details</h2>
          <p className="admin-editor-section-sub">
            How big the box is and how heavy it is. The shop sends the same
            way-up packaging for everything, so these are what the courier
            is asked for.
          </p>
        </div>
      </div>

      <div className="admin-editor-split">
        {/* Dimensions */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["packageLength", "Length", length, setLength],
                ["packageWidth", "Width", width, setWidth],
                ["packageHeight", "Height", height, setHeight],
              ] as const
            ).map(([name, label, value, setValue]) => (
              <Measurement
                key={name}
                id={name}
                name={name}
                label={label}
                base={value}
                units={LENGTH_UNITS}
                unit={dimUnit}
                onUnit={(u) => setDimUnit(u as LengthUnit)}
                onBase={(v) => {
                  setValue(v);
                  onDirty();
                }}
                step="0.01"
              />
            ))}
          </div>

          <p className="admin-hint">
            Length × Width × Height
            {box.length === 3 && (
              <>
                {" — "}
                {box.join(" × ")} {LENGTH_UNITS[dimUnit].label}
                {dimUnit !== "cm" && (
                  <>
                    {" ("}
                    {length} × {width} × {height} cm)
                  </>
                )}
              </>
            )}
          </p>
        </div>

        {/* Weight */}
        <div className="space-y-4">
          <div className="max-w-[300px]">
            <Measurement
              id="weightGrams"
              name="weightGrams"
              label="Weight"
              base={weight}
              units={WEIGHT_UNITS}
              unit={weightUnit}
              onUnit={(u) => setWeightUnit(u as WeightUnit)}
              onBase={(v) => {
                setWeight(v);
                onDirty();
              }}
              step="0.01"
            />
          </div>

          <EditorNote icon={<Ruler className="h-4 w-4" />}>
            Sizes are kept in centimetres and weights in grams, whatever unit
            they are typed in. The shop shows them that way on the product
            page.
          </EditorNote>

          <p className="admin-hint flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              The shipping method and the courier are chosen per order in the
              back office, rather than per product.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
