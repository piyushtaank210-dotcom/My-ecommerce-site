"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Save } from "lucide-react";
import { updateProfileAction, type AccountState } from "@/lib/account-actions";
import { toast } from "@/components/Toaster";

const initial: AccountState = { ok: false };

/** Name, email and phone on the account. */
export function ProfileForm({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string | null;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initial);
  const seen = useRef<string | undefined>(undefined);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="label">
          Full name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          className={`input ${errors.name ? "input-error" : ""}`}
        />
        {errors.name && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.name}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          autoComplete="email"
          className={`input ${errors.email ? "input-error" : ""}`}
        />
        {errors.email && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.email}</p>
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
          defaultValue={phone ?? ""}
          placeholder="98765 43210"
          autoComplete="tel"
          className={`input ${errors.phone ? "input-error" : ""}`}
        />
        {errors.phone && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.phone}</p>
        )}
      </div>

      <button type="submit" className="btn btn-primary">
        <Save className="h-4 w-4" />
        Save details
      </button>
    </form>
  );
}
