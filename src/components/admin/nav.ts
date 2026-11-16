import type { Permission } from "@/lib/roles";

/**
 * The back office's navigation. One entry per destination, with the
 * permission it needs — the shell hides anything the signed-in role cannot
 * reach.
 *
 * The entries are grouped into the sections of the shop's work. The
 * grouping is presentation only: every destination stays exactly where it
 * was, and every entry is still decided by the permission beside it.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  group: AdminNavGroup;
  icon:
    | "dashboard"
    | "orders"
    | "returns"
    | "messages"
    | "users"
    | "products"
    | "inventory"
    | "categories"
    | "import";
  permission: Permission;
};

/** The sections the navigation is divided into, in the order they appear. */
export const ADMIN_NAV_GROUPS = [
  "Store",
  "Sales",
  "Stock",
  "Catalogue",
  "Customers",
] as const;

export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    description: "The store at a glance",
    group: "Store",
    icon: "dashboard",
    permission: "dashboard.view",
  },
  {
    href: "/admin/orders",
    label: "Orders",
    description: "Every order and where it is",
    group: "Sales",
    icon: "orders",
    permission: "orders.view",
  },
  {
    href: "/admin/returns",
    label: "Returns & Refunds",
    description: "Return requests, replacements and refunds",
    group: "Sales",
    icon: "returns",
    permission: "returns.view",
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    description: "Stock levels and their history",
    group: "Stock",
    icon: "inventory",
    permission: "inventory.view",
  },
  {
    href: "/admin/products",
    label: "Catalogue",
    description: "List, delist and edit products",
    group: "Catalogue",
    icon: "products",
    permission: "catalog.view",
  },
  {
    href: "/admin/categories",
    label: "Categories",
    description: "Categories, subcategories and brands",
    group: "Catalogue",
    icon: "categories",
    permission: "catalog.view",
  },
  {
    href: "/admin/import",
    label: "Import",
    description: "The catalogue, in and out as a spreadsheet",
    group: "Catalogue",
    icon: "import",
    permission: "catalog.view",
  },
  {
    href: "/admin/messages",
    label: "Enquiries",
    description: "Messages from the contact page",
    group: "Customers",
    icon: "messages",
    permission: "messages.view",
  },
  {
    href: "/admin/users",
    label: "Customers",
    description: "Accounts, roles and spend",
    group: "Customers",
    icon: "users",
    permission: "customers.view",
  },
];
