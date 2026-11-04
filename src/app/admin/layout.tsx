import type { Metadata } from "next";
import { logoutAction } from "@/lib/actions";
import { requireStaff } from "@/lib/guard";
import { can } from "@/lib/roles";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_NAV } from "@/components/admin/nav";

export const metadata: Metadata = {
  title: "Admin",
  description: "ConsoleSeller back office.",
};

/**
 * The back office. Its own chrome — no site header or footer — and a guard
 * that keeps members out. What each role can reach inside is decided by
 * the nav items, not by the pages.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaff("/admin");
  const items = ADMIN_NAV.filter((item) => can(user.role, item.permission));

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role }}
      items={items}
      signOut={logoutAction}
    >
      {children}
    </AdminShell>
  );
}
