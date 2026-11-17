import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, AUTH_POINTS } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { SIGN_IN_REQUIRED } from "@/lib/sign-in";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a ConsoleSeller account to track orders and check out faster.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; resume?: string }>;
}) {
  const { next, resume } = await searchParams;
  if (await getCurrentUser()) redirect("/account");

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="One account for orders, saved addresses and faster checkout. It takes a minute."
      points={AUTH_POINTS}
      note={resume === "1" ? SIGN_IN_REQUIRED : undefined}
    >
      <AuthForm
        mode="register"
        next={safeNext(next)}
        resume={resume === "1"}
      />
    </AuthShell>
  );
}
