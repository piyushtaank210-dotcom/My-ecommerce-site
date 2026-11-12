import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { isStaff, ROLE_LABEL } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { AccountNav, ACCOUNT_NAV } from "@/components/account/AccountNav";

export const metadata = {
  title: "My account",
  description: "Your ConsoleSeller orders, addresses and account details.",
};

/**
 * The customer's own panel. It sits inside the shop chrome, so the header
 * and footer stay put — this is the same store, signed in.
 */
export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser("/account");

  return (
    <div className="container-x py-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-[17px] font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h1 className="text-[24px] font-bold text-ink">{user.name}</h1>
              <p className="text-[13.5px] text-gray-500">{user.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-semibold text-gray-600">
              {ROLE_LABEL[user.role]}
            </span>
            {isStaff(user.role) && (
              <Link
                href="/admin"
                className="btn btn-outline btn-sm"
              >
                <Shield className="h-3.5 w-3.5" />
                Back office
              </Link>
            )}
            <form action={logoutAction}>
              <button type="submit" className="btn btn-outline btn-sm">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </header>

        <AccountNav items={ACCOUNT_NAV} />

        <div className="pt-7">{children}</div>

        <p className="mt-10 text-[12.5px] text-gray-400">
          Account created {formatDate(user.created_at)}.
        </p>
      </div>
    </div>
  );
}
