import Link from "next/link";
import { Users as UsersIcon } from "lucide-react";
import { countCustomers, listCustomers } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { money, formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { Pagination } from "@/components/admin/ui/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";

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
    <>
      <PageHeader
        eyebrow="People"
        title="Customers"
        description={`${total} account${total === 1 ? "" : "s"}. Change what someone is allowed to do, or remove the account entirely.`}
      />

      <div className="admin-toolbar">
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
        <EmptyState
          icon={UsersIcon}
          title="No accounts match"
          description="Nothing here matches the search and the filters. Clear them and the whole list comes back."
          action={
            <Link href="/admin/users" className="btn btn-outline btn-sm">
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th className="admin-th-num">Orders</th>
                  <th className="admin-th-num">Spent</th>
                  <th>Joined</th>
                  {canManage && <th className="admin-th-num">Remove</th>}
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="admin-cell-product">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-bold text-brand">
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="admin-cell-title">
                            {c.name}
                            {c.id === viewer.id && (
                              <span className="ml-2 text-[11.5px] font-medium text-gray-400">
                                you
                              </span>
                            )}
                          </span>
                          <span className="admin-cell-sub">
                            {c.email}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
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
                    <td className="admin-td-num text-gray-500">{c.order_count}</td>
                    <td className="admin-td-num font-semibold text-ink">
                      {money(c.total_spent)}
                    </td>
                    <td className="text-[12.5px] text-gray-500">
                      {formatDate(c.created_at)}
                    </td>
                    {canManage && (
                      <td className="admin-td-actions">
                        {c.id === viewer.id ? (
                          <span className="text-[12px] text-gray-300">—</span>
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

          <div className="admin-table-foot">
            <span className="tnum">
              Showing {(page - 1) * PER_PAGE + 1}–
              {(page - 1) * PER_PAGE + customers.length} of {total}
            </span>
            <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
          </div>
        </>
      )}
    </>
  );
}
