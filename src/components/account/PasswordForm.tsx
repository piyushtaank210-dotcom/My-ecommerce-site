"use client";

import { useActionState, useEffect, useRef } from "react";
import { KeyRound } from "lucide-react";
import { changePasswordAction, type AccountState } from "@/lib/account-actions";
import { toast } from "@/components/Toaster";

const initial: AccountState = { ok: false };

/** Changes the password on the account. */
export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initial);
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
        <label htmlFor="current" className="label">
          Current password
        </label>
        <input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          className={`input ${errors.current ? "input-error" : ""}`}
        />
        {errors.current && (
          <p className="mt-1 text-[12.5px] text-red-600">{errors.current}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="label">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className={`input ${errors.password ? "input-error" : ""}`}
          />
          {errors.password && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.password}</p>
          )}
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            className={`input ${errors.confirm ? "input-error" : ""}`}
          />
          {errors.confirm && (
            <p className="mt-1 text-[12.5px] text-red-600">{errors.confirm}</p>
          )}
        </div>
      </div>

      <p className="text-[12.5px] text-gray-500">
        At least 8 characters, including a number.
      </p>

      <button type="submit" className="btn btn-primary">
        <KeyRound className="h-4 w-4" />
        Change password
      </button>
    </form>
  );
}
