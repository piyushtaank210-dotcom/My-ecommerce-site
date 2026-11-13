"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  Smartphone,
  CreditCard,
  Banknote,
  Layers,
  Loader2,
  Lock,
  MapPin,
} from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/lib/actions";
import { STATES } from "@/lib/states";
import type { Address } from "@/lib/types";

const PAYMENTS = [
  { value: "upi", label: "UPI", sub: "GPay, PhonePe, Paytm", Icon: Smartphone },
  { value: "card", label: "Card", sub: "Visa, Mastercard, RuPay", Icon: CreditCard },
  { value: "emi", label: "No Cost EMI", sub: "3 / 6 / 9 months", Icon: Layers },
  { value: "cod", label: "Cash on Delivery", sub: "Pay when it arrives", Icon: Banknote },
];

const initial: CheckoutState = { ok: false };

export function CheckoutForm({
  account,
  savedAddresses = [],
}: {
  /** The signed-in customer's details, if there is one. */
  account?: { name: string; email: string; phone: string | null } | null;
  savedAddresses?: Address[];
}) {
  const [state, formAction] = useActionState(placeOrderAction, initial);
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  const preferred =
    savedAddresses.find((a) => a.is_default) ?? savedAddresses[0] ?? null;

  /** Fills the address fields from a saved address. */
  function useSaved(id: string) {
    const saved = savedAddresses.find((a) => a.id === Number(id));
    const form = formRef.current;
    if (!saved || !form) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        el.value = value;
      }
    };
    set("name", saved.name);
    set("phone", saved.phone);
    set("address1", saved.address1);
    set("address2", saved.address2 ?? "");
    set("city", saved.city);
    set("state", saved.state);
    set("pincode", saved.pincode);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6" noValidate>
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {state.message}
        </p>
      )}

      <Section title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="name"
            placeholder="Write your name"
            error={errors.name}
            autoComplete="name"
            defaultValue={account?.name ?? preferred?.name ?? ""}
          />
          <Field
            label="Email address"
            name="email"
            type="email"
            placeholder="you@example.com"
            error={errors.email}
            autoComplete="email"
            defaultValue={account?.email ?? ""}
          />
          <Field
            label="Phone number"
            name="phone"
            type="tel"
            placeholder="98765 43210"
            error={errors.phone}
            autoComplete="tel"
            className="sm:col-span-2"
            defaultValue={account?.phone ?? preferred?.phone ?? ""}
          />
        </div>
      </Section>

      <Section title="Delivery address">
        {savedAddresses.length > 0 && (
          <div className="mb-4">
            <label htmlFor="savedAddress" className="label">
              Use a saved address
            </label>
            <select
              id="savedAddress"
              name="savedAddress"
              defaultValue=""
              onChange={(e) => useSaved(e.target.value)}
              className="input cursor-pointer"
            >
              <option value="">Type a new address</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.address1}, {a.city}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Address line 1"
            name="address1"
            placeholder="Flat / House no., Street"
            error={errors.address1}
            autoComplete="address-line1"
            className="sm:col-span-2"
            defaultValue={preferred?.address1 ?? ""}
          />
          <Field
            label="Address line 2 (optional)"
            name="address2"
            placeholder="Area, landmark"
            error={errors.address2}
            autoComplete="address-line2"
            className="sm:col-span-2"
            defaultValue={preferred?.address2 ?? ""}
          />
          <Field
            label="City"
            name="city"
            placeholder="Pune"
            error={errors.city}
            autoComplete="address-level2"
            defaultValue={preferred?.city ?? ""}
          />
          <div>
            <label htmlFor="state" className="label">
              State
            </label>
            <select
              id="state"
              name="state"
              defaultValue={preferred?.state ?? ""}
              className={`input h-[42px] cursor-pointer ${errors.state ? "input-error" : ""}`}
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
          <Field
            label="PIN code"
            name="pincode"
            placeholder="411001"
            error={errors.pincode}
            autoComplete="postal-code"
            defaultValue={preferred?.pincode ?? ""}
          />
          <div>
            <label htmlFor="notes" className="label">
              Order notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Delivery instructions…"
              className="input resize-none"
            />
          </div>
        </div>

        {account && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="saveAddress"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <span className="text-[13px] leading-relaxed text-gray-500">
              Save this address to my account for next time.
            </span>
          </label>
        )}
      </Section>

      <Section title="Payment method">
        <p className="-mt-2 mb-4 text-[12.5px] text-gray-500">
          Demo store — no real payment is taken and no card details are collected.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PAYMENTS.map(({ value, label, sub, Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-3.5 transition-colors hover:border-gray-300 has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={value}
                defaultChecked={value === "upi"}
                className="sr-only"
              />
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">
                  {label}
                </span>
                <span className="block text-[12px] text-gray-500">{sub}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <button type="submit" className="btn btn-primary btn-lg w-full">
        <SubmitLabel />
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-gray-500">
        <Lock className="h-3.5 w-3.5" />
        Your details stay on this server and are never shared.
      </p>
    </form>
  );
}

function SubmitLabel() {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        Placing your order…
      </>
    );
  }
  return (
    <>
      <Lock className="h-4 w-4" />
      Place order
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink">
        {title === "Delivery address" && (
          <MapPin className="h-4 w-4 text-brand" />
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  error,
  type = "text",
  placeholder,
  autoComplete,
  className = "",
  defaultValue = "",
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        className={`input h-[42px] ${error ? "input-error" : ""}`}
      />
      {error && <p className="mt-1 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
