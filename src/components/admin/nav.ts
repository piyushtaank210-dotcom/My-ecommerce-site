import type { Permission } from "@/lib/roles";

/**
 * The back office's navigation. One entry per destination, with the
 * permission it needs — the shell hides anything the signed-in role cannot
 * reach.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
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

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    description: "The store at a glance",
    icon: "dashboard",
    permission: "dashboard.view",
  },
  {
    href: "/admin/orders",
    label: "Orders",
    description: "Every order and where it is",
    icon: "orders",
    permission: "orders.view",
  },
  {
    href: "/admin/returns",
    label: "Returns & Refunds",
    description: "Return requests, replacements and refunds",
    icon: "returns",
    permission: "returns.view",
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    description: "Stock levels and their history",
    icon: "inventory",
    permission: "inventory.view",
  },
  {
    href: "/admin/categories",
    label: "Categories",
    description: "Categories, subcategories and brands",
    icon: "categories",
    permission: "catalog.view",
  },
  {
    href: "/admin/import",
    label: "Import",
    description: "The catalogue, in and out as a spreadsheet",
    icon: "import",
    permission: "catalog.view",
  },
  {
    href: "/admin/messages",
    label: "Enquiries",
    description: "Messages from the contact page",
    icon: "messages",
    permission: "messages.view",
  },
  {
    href: "/admin/users",
    label: "Customers",
    description: "Accounts, roles and spend",
    icon: "users",
    permission: "customers.view",
  },
  {
    href: "/admin/products",
    label: "Catalogue",
    description: "List, delist and edit products",
    icon: "products",
    permission: "catalog.view",
  },
];
