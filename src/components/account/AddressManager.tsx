"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Pencil, Trash2, Star, Loader2, X } from "lucide-react";
import {
  deleteAddressAction,
  makeDefaultAddressAction,
  saveAddressAction,
  type AccountState,
} from "@/lib/account-actions";
import { STATES } from "@/lib/states";
import { toast } from "@/components/Toaster";
import type { Address } from "@/lib/types";

const initial: AccountState = { ok: false };

/**
 * The customer's address book — add, edit, choose a default and remove.
 */
export function AddressManager({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  return (
    <div className="space-y-5">
      {addresses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => setEditing(a)}
            />
          ))}
        </div>
      )}

      {addresses.length === 0 && editing === null && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-400">
            <MapPin className="h-5 w-5" />
          </span>
          <p className="mt-4 text-[15px] font-semibold text-ink">
            No saved addresses
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] text-gray-500">
            Save one now and checking out takes half the time.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="btn btn-primary btn-sm mt-5"
          >
            <Plus className="h-4 w-4" />
            Add an address
          </button>
        </div>
      )}

      {addresses.length > 0 && editing === null && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="btn btn-outline btn-sm"
        >
          <Plus className="h-4 w-4" />
          Add another address
        </button>
      )}

      {editing !== null && (
        <AddressForm
          address={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
}: {
  address: Address;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function makeDefault() {
    startTransition(async () => {
      const res = await makeDefaultAddressAction(initial, formOf(address.id));
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteAddressAction(initial, formOf(address.id));
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-ink">{address.label}</p>
          {address.is_default && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11.5px] font-semibold text-brand">
              <Star className="h-3 w-3" />
              Default
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${address.label}`}
            className="grid h-10 w-10 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink sm:h-8 sm:w-8"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Remove ${address.label}`}
            className="grid h-10 w-10 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:h-8 sm:w-8"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <address className="text-[13px] not-italic leading-relaxed text-gray-500">
        <span className="block font-semibold text-ink">{address.name}</span>
        {address.address1}
        {address.address2 && (
          <>
            <br />
            {address.address2}
          </>
        )}
        <br />
        {address.city}, {address.state} — {address.pincode}
        <br />
        <span className="tnum">{address.phone}</span>
      </address>

      {!address.is_default && (
        <button
          type="button"
          onClick={makeDefault}
          disabled={pending}
          className="mt-4 inline-flex min-h-[40px] items-center text-[12.5px] font-medium text-brand hover:underline disabled:opacity-50"
        >
          Make this my default
        </button>
      )}
    </article>
  );
}

function AddressForm({
  address,
  onDone,
  onCancel,
}: {
  address: Address | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(saveAddressAction, initial);
  const seen = useRef<string | undefined>(undefined);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={formAction}
      className="rounded-xl border border-gray-200 bg-white p-5"
      noValidate
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink">
          {address ? `Edit ${address.label}` : "Add an address"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-10 w-10 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-ink sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {address && <input type="hidden" name="id" value={address.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="label" className="label">
            Label
          </label>
          <input
            id="label"
            name="label"
            defaultValue={address?.label ?? "Home"}
            placeholder="Home, Office, Mumma's place…"
            className={`input ${errors.label ? "input-error" : ""}`}
          />
          {errors.label && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.label}</p>
          )}
        </div>
        <div>
          <label htmlFor="name" className="label">
            Recipient
          </label>
          <input
            id="name"
            name="name"
            defaultValue={address?.name ?? ""}
            autoComplete="name"
            className={`input ${errors.name ? "input-error" : ""}`}
          />
          {errors.name && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.name}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="address1" className="label">
            Address line 1
          </label>
          <input
            id="address1"
            name="address1"
            defaultValue={address?.address1 ?? ""}
            placeholder="Flat / House no., Street"
            autoComplete="address-line1"
            className={`input ${errors.address1 ? "input-error" : ""}`}
          />
          {errors.address1 && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.address1}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="address2" className="label">
            Address line 2 (optional)
          </label>
          <input
            id="address2"
            name="address2"
            defaultValue={address?.address2 ?? ""}
            placeholder="Area, landmark"
            autoComplete="address-line2"
            className="input"
          />
        </div>

        <div>
          <label htmlFor="city" className="label">
            City
          </label>
          <input
            id="city"
            name="city"
            defaultValue={address?.city ?? ""}
            autoComplete="address-level2"
            className={`input ${errors.city ? "input-error" : ""}`}
          />
          {errors.city && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.city}</p>
          )}
        </div>

        <div>
          <label htmlFor="state" className="label">
            State
          </label>
          <select
            id="state"
            name="state"
            defaultValue={address?.state ?? ""}
            className={`input cursor-pointer ${errors.state ? "input-error" : ""}`}
          >
            <option value="" disabled>
              Select state
            </option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {errors.state && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.state}</p>
          )}
        </div>

        <div>
          <label htmlFor="pincode" className="label">
            PIN code
          </label>
          <input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            defaultValue={address?.pincode ?? ""}
            autoComplete="postal-code"
            className={`input tnum ${errors.pincode ? "input-error" : ""}`}
          />
          {errors.pincode && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.pincode}</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="label">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={address?.phone ?? ""}
            autoComplete="tel"
            className={`input ${errors.phone ? "input-error" : ""}`}
          />
          {errors.phone && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.phone}</p>
          )}
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.is_default ?? false}
          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <span className="text-[13px] text-gray-600">
          Use this as my default address
        </span>
      </label>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className="btn btn-primary">
          Save address
        </button>
        <button type="button" onClick={onCancel} className="btn btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function formOf(id: number): FormData {
  const data = new FormData();
  data.set("id", String(id));
  return data;
}
