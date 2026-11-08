import Link from "next/link";
import { Users as UsersIcon } from "lucide-react";
import { countCustomers, listCustomers } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { Pagination } from "@/components/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";

export const metadata = { title: "Customers" };

const PER_PAGE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const viewer = await requirePermission("customers.view");
  const sp = await searchParams;
  const canManage = can(viewer.role, "users.manage");

  const q = one(sp.q).trim() || undefined;
  const roleParam = one(sp.role) || "all";
  const role: Role | "all" = (ROLES as readonly string[]).includes(roleParam)
    ? (roleParam as Role)
    : "all";
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    role,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const customers = (await listCustomers(query));
  const total = (await countCustomers(query));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (role !== "all") p.set("role", role);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Customers</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          {total} account{total === 1 ? "" : "s"}. Change what someone is
          allowed to do, or remove the account entirely.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PanelSearch placeholder="Search name or email" />
        <PanelFilter
          name="role"
          label="Role"
          value={role}
          options={[
            { value: "all", label: "Every role" },
            ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
          ]}
        />
      </div>

      {customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <UsersIcon className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No accounts match
          </h2>
          <Link href="/admin/users" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[880px] text-left text-[13.5px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Spent</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-semibold">Remove</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((c) => (
                <tr key={c.id} className="bg-white">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-bold text-brand">
                        {c.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {c.name}
                          {c.id === viewer.id && (
                            <span className="ml-2 text-[11.5px] font-medium text-gray-400">
                              you
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[12px] text-gray-500">
                          {c.email}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <UserRoleSelect
                        userId={c.id}
                        role={c.role}
                        disabled={c.id === viewer.id}
                      />
                    ) : (
                      <span className="text-[12.5px] font-medium text-gray-600">
                        {ROLE_LABEL[c.role]}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-4 py-3 text-gray-500">
                    {c.order_count}
                  </td>
                  <td className="tnum px-4 py-3 font-semibold text-ink">
                    {money(c.total_spent)}
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-gray-500">
                    {formatDate(c.created_at)}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {c.id === viewer.id ? (
                        <span className="text-[12px] text-gray-300">
                          —
                        </span>
                      ) : (
                        <DeleteUserButton userId={c.id} name={c.name} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
