"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { sendContactMessageAction, type ContactState } from "@/lib/actions";

const SUBJECTS = [
  { value: "product", label: "A product I am considering" },
  { value: "order", label: "An order I have placed" },
  { value: "support", label: "Setting something up" },
  { value: "returns", label: "A return, replacement or warranty" },
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
      <div className="rounded-xl border border-green-200 bg-green-50/60 p-5 sm:p-6">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-[17px] font-bold text-ink">Message received</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-600">
          {state.message}
        </p>

        <dl className="mt-4 space-y-1.5 border-t border-green-200/70 pt-4 text-[12.5px] text-gray-600">
          <div className="flex gap-2">
            <dt className="font-semibold text-ink">Next</dt>
            <dd>A person reads it, usually within one working day.</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-ink">Where</dt>
            <dd>Your message is in our enquiry queue, in the order it arrived.</dd>
          </div>
        </dl>

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
          placeholder="Write your name"
          error={errors.name}
          autoComplete="name"
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          placeholder="you@email.com"
          error={errors.email}
          autoComplete="email"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          placeholder="+91 98765 43210"
          error={errors.phone}
          autoComplete="tel"
          hint="Optional — it is the quickest way to reach you."
        />
        <Field
          label="Order ID"
          name="orderId"
          placeholder="PFJTTPT7"
          error={errors.orderId}
          hint="Optional — it is in your order confirmation."
        />
      </div>

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

      <div>
        <label htmlFor="message" className="label">
          Your message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          placeholder="Tell us what you need — the product, the order, or the problem."
          aria-invalid={Boolean(errors.message)}
          className={`input resize-none ${errors.message ? "input-error" : ""}`}
        />
        {errors.message ? (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.message}</p>
        ) : (
          <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
            The more you tell us, the less we have to ask you back.
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary btn-lg w-full">
        <SubmitLabel />
      </button>

      {/* What actually happens to the message — which is what a person
          buying a console is really asking when they see this form. */}
      <div className="space-y-2 border-t border-gray-200 pt-4">
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-gray-600">
          <Clock className="mt-[2px] h-3.5 w-3.5 shrink-0 text-gray-400" />
          A person reads every message, usually within one working day.
        </p>
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-gray-600">
          <ShieldCheck className="mt-[2px] h-3.5 w-3.5 shrink-0 text-gray-400" />
          Your details stay with us. We do not pass them on — read the{" "}
          <Link href="/privacy-policy" className="font-medium text-brand hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
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
  hint,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  /** A line under the field that says what it is for. */
  hint?: string;
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
      {error ? (
        <p className="mt-1 text-[12.5px] text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
