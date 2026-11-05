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
  const target = safeNext(next);

  // Someone who is already signed in has no business on this page — but
  // they should land where they were going. A staff member who follows a
  // link to /login?next=/admin is sent to the back office, not to their
  // customer account, so they are not turned away from the page they
  // wanted. With no destination in the link, they go to their account.
  if (await getCurrentUser()) redirect(next ? target : "/account");

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your account"
      subtitle="Track your orders, save your details and check out in a couple of taps."
      points={AUTH_POINTS}
    >
      <AuthForm mode="login" next={target} />
    </AuthShell>
  );
}
