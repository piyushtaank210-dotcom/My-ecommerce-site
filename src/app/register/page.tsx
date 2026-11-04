import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, AUTH_POINTS } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser, safeNext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a ConsoleSeller account to track orders and check out faster.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/account");

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="One account for orders, saved addresses and faster checkout. It takes a minute."
      points={AUTH_POINTS}
    >
      <AuthForm mode="register" next={safeNext(next)} />
    </AuthShell>
  );
}
