"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { loginAction, registerAction, type AuthState } from "@/lib/actions";

const initial: AuthState = { ok: false };

export function AuthForm({
  mode,
  next = "/",
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const isRegister = mode === "register";
  const [state, formAction] = useActionState(
    isRegister ? registerAction : loginAction,
    initial
  );
  const [showPassword, setShowPassword] = useState(false);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.message && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700"
        >
          {state.message}
        </p>
      )}
      {errors.form && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700"
        >
          {errors.form}
        </p>
      )}

      {isRegister && (
        <Field
          label="Full name"
          name="name"
          placeholder="Arjun Mehta"
          autoComplete="name"
          error={errors.name}
        />
      )}

      <Field
        label="Email address"
        name="email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        error={errors.email}
      />

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="password" className="label mb-0">
            Password
          </label>
          {!isRegister && (
            <Link
              href="/login"
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              Forgot password?
            </Link>
          )}
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder={isRegister ? "At least 8 characters" : "••••••••"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            aria-invalid={Boolean(errors.password)}
            className={`input h-11 pr-11 ${errors.password ? "input-error" : ""}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 transition-colors hover:text-ink"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 text-[12.5px] text-red-600">{errors.password}</p>
        )}
        {isRegister && !errors.password && (
          <p className="mt-1.5 text-[12.5px] text-gray-500">
            Use at least 8 characters, including a number.
          </p>
        )}
      </div>

      {isRegister && (
        <>
          <Field
            label="Confirm password"
            name="confirm"
            type="password"
            placeholder="Repeat your password"
            autoComplete="new-password"
            error={errors.confirm}
          />

          <label className="flex cursor-pointer items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              name="terms"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <span className="text-[13px] leading-relaxed text-gray-500">
              I agree to the{" "}
              <span className="font-medium text-brand">Terms of Service</span>{" "}
              and{" "}
              <span className="font-medium text-brand">Privacy Policy</span>.
            </span>
          </label>
          {errors.terms && (
            <p className="text-[12.5px] text-red-600">{errors.terms}</p>
          )}
        </>
      )}

      <button type="submit" className="btn btn-primary btn-lg w-full">
        <SubmitLabel isRegister={isRegister} />
      </button>

      <p className="pt-1 text-center text-[13.5px] text-gray-500">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to ConsoleSeller?{" "}
            <Link
              href="/register"
              className="font-semibold text-brand hover:underline"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function SubmitLabel({ isRegister }: { isRegister: boolean }) {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        {isRegister ? "Creating account…" : "Signing in…"}
      </>
    );
  }
  return (
    <>
      {isRegister ? "Create account" : "Sign in"}
      <ArrowRight className="h-4 w-4" />
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
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
        className={`input h-11 ${error ? "input-error" : ""}`}
      />
      {error && <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
