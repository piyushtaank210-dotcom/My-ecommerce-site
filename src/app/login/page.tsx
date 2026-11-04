import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, AUTH_POINTS } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser, safeNext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ConsoleSeller account to track orders and check out faster.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/account");

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your account"
      subtitle="Track your orders, save your details and check out in a couple of taps."
      points={AUTH_POINTS}
    >
      <AuthForm mode="login" next={safeNext(next)} />
    </AuthShell>
  );
}
