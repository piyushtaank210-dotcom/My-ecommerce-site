"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import { setUserRoleAction, type PanelState } from "@/lib/admin-actions";
import { toast } from "@/components/Toaster";

const initial: PanelState = { ok: false };

/** Changes what an account is allowed to do. */
export function UserRoleSelect({
  userId,
  role,
  disabled = false,
}: {
  userId: number;
  role: Role;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(setUserRoleAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const seen = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.message || state.message === seen.current) return;
    seen.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={disabled}
        aria-label={`Role for account ${userId}`}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </form>
  );
}
