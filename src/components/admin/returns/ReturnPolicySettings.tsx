"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2, Save } from "lucide-react";
import { toast } from "@/components/Toaster";

/**
 * The shop's return policy.
 *
 * These are the switches that decide whether the shop takes returns at
 * all, how long the window is, what a customer has to send with a
 * claim, and what they are told. They are set here, in the Returns &
 * Refunds section, so that the person working the queue can change
 * them without going anywhere else.
 */
export function ReturnPolicySettings({
  enabled,
  windowDays,
  description,
  photoRequired,
  pickupRequired,
  canManage,
}: {
  enabled: boolean;
  windowDays: number;
  description: string;
  photoRequired: boolean;
  pickupRequired: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(windowDays);
  const [text, setText] = useState(description);
  const [on, setOn] = useState(enabled);
  const [photo, setPhoto] = useState(photoRequired);
  const [pickup, setPickup] = useState(pickupRequired);
  const router = useRouter();

  async function save(next: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? "The policy could not be changed.", "error");
        return;
      }
      toast("The return policy has been changed.", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand" />
          <h2 className="text-[14px] font-bold text-ink">Return policy</h2>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              enabled
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {enabled ? "Returns on" : "Returns off"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn btn-outline btn-xs"
          disabled={!canManage}
        >
          {open ? "Close" : "Change the policy"}
        </button>
      </div>

      <p className="mt-2 text-[12.5px] text-gray-600">
        {enabled ? (
          <>
            Returns and replacements are open. A customer has{" "}
            <strong className="text-ink">{windowDays} days</strong> from
            delivery to report an issue
            {photoRequired ? ", and must send a photograph" : ""}
            {pickupRequired ? ", and we arrange the pickup" : ""}.
          </>
        ) : (
          <>
            Returns and replacements are closed. The request form is not
            offered, and no new claim can be raised. The claims that are
            already open are left alone.
          </>
        )}
      </p>

      {open && canManage && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {/* The switches. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch
              id="returns-enabled"
              label="Take returns and replacements"
              hint="Turn this off to stop new claims being raised."
              checked={on}
              disabled={busy}
              onChange={(v) => {
                setOn(v);
                void save({ returnsEnabled: v });
              }}
            />
            <Switch
              id="return-photo-required"
              label="Require a photograph"
              hint="A claim without one is still looked at, but the shop asks for it."
              checked={photo}
              disabled={busy}
              onChange={(v) => {
                setPhoto(v);
                void save({ returnPhotoRequired: v });
              }}
            />
            <Switch
              id="return-pickup-required"
              label="Arrange the pickup"
              hint="Turn this off and the customer sends the parcel back themselves."
              checked={pickup}
              disabled={busy}
              onChange={(v) => {
                setPickup(v);
                void save({ returnPickupRequired: v });
              }}
            />

            <div>
              <label
                htmlFor="return-window-days"
                className="block text-[12.5px] font-semibold text-ink"
              >
                Return window (days)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="return-window-days"
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  disabled={busy}
                  onChange={(e) => setDays(Number(e.target.value))}
                  onBlur={() => {
                    if (days !== windowDays) void save({ returnWindowDays: days });
                  }}
                  className="input h-9 w-24 text-[13px]"
                />
                <span className="text-[12px] text-gray-500">
                  from the day the parcel arrived
                </span>
              </div>
            </div>
          </div>

          {/* The policy the customer is shown. */}
          <div>
            <label
              htmlFor="return-policy-description"
              className="block text-[12.5px] font-semibold text-ink"
            >
              Policy shown to the customer
            </label>
            <textarea
              id="return-policy-description"
              rows={3}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (text.trim() !== description) {
                  void save({ returnPolicyDescription: text });
                }
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-[13px] text-ink"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={busy || text.trim() === description}
                onClick={() => void save({ returnPolicyDescription: text })}
                className="btn btn-outline btn-xs"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save the wording
              </button>
              <span className="text-[11.5px] text-gray-500">
                This is shown on the request form and on the policy page.
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** One switch, with its own label and explanation. */
function Switch({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="block text-[11.5px] text-gray-500">{hint}</span>
      </span>
    </label>
  );
}
