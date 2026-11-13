"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { sendContactMessageAction, type ContactState } from "@/lib/actions";

const SUBJECTS = [
  { value: "product", label: "Product inquiry" },
  { value: "order", label: "Order or delivery" },
  { value: "support", label: "Setup and support" },
  { value: "returns", label: "Returns and warranty" },
  { value: "other", label: "Something else" },
];

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessageAction, initial);
  const [sent, setSent] = useState(false);
  const errors = state.errors ?? {};

  // `state` gets a new identity on every completed submission, so this
  // tracks the latest result rather than the first one.
  useEffect(() => {
    setSent(state.ok);
  }, [state]);

  if (sent) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-tint text-brand">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-[17px] font-bold text-ink">Message received</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="btn btn-outline btn-sm mt-5"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your name"
          name="name"
          placeholder="Arjun Mehta"
          error={errors.name}
          autoComplete="name"
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          placeholder="you@example.com"
          error={errors.email}
          autoComplete="email"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          placeholder="+91 98760 22697"
          error={errors.phone}
          autoComplete="tel"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="subject" className="label">
            What is this about?
          </label>
          <select
            id="subject"
            name="subject"
            defaultValue="product"
            className={`input h-[42px] cursor-pointer ${errors.subject ? "input-error" : ""}`}
          >
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {errors.subject && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.subject}</p>
          )}
        </div>

        <Field
          label="Order ID (optional)"
          name="orderId"
          placeholder="PFJTTPT7"
          error={errors.orderId}
        />
      </div>

      <div>
        <label htmlFor="message" className="label">
          Your message
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          placeholder="Tell us what you need — the product, the order, or the problem."
          aria-invalid={Boolean(errors.message)}
          className={`input resize-none ${errors.message ? "input-error" : ""}`}
        />
        {errors.message && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.message}</p>
        )}
      </div>

      <button type="submit" className="btn btn-primary btn-lg w-full">
        <SubmitLabel />
      </button>

      <p className="text-center text-[12.5px] text-gray-500">
        Demo store — your message is recorded here, and no email is sent.
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
        Sending…
      </>
    );
  }
  return (
    <>
      <Send className="h-4 w-4" />
      Send message
    </>
  );
}

function Field({
  label,
  name,
  error,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={`input h-[42px] ${error ? "input-error" : ""}`}
      />
      {error && <p className="mt-1 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
