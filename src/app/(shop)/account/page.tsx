import Link from "next/link";
import { Package, MapPin, Wallet, CalendarDays, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/guard";
import { getOrdersForUser } from "@/lib/orders";
import { listAddresses } from "@/lib/addresses";
import { money, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders";

export const metadata = {
  title: "My account",
  description: "Your ConsoleSeller orders and account details.",
};

/** The customer's landing page — what they have bought and what is coming. */
export default async function AccountPage() {
  const user = await requireUser("/account");

  const orders = getOrdersForUser(user.id);
  const addresses = await listAddresses(user.id);

  const spend = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const inFlight = orders.filter(
    (o) => o.status === "confirmed" || o.status === "packed" || o.status === "shipped"
  ).length;

  const tiles = [
    {
      label: "Orders",
      value: String(orders.length),
      hint: inFlight > 0 ? `${inFlight} still on the way` : "Nothing on the way",
      icon: Package,
    },
    {
      label: "Total spent",
      value: money(spend),
      hint: "Across every order",
      icon: Wallet,
    },
    {
      label: "Saved addresses",
      value: String(addresses.length),
      hint: addresses.length ? "Ready at checkout" : "Add one to check out faster",
      icon: MapPin,
    },
    {
      label: "Member since",
      value: formatDate(user.created_at),
      hint: "Thanks for shopping with us",
      icon: CalendarDays,
    },
  ];

  const recent = orders.slice(0, 4);
  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0];

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, value, hint, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12.5px] font-medium text-gray-500">{label}</p>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="tnum mt-2 text-[22px] font-bold leading-none text-ink">
              {value}
            </p>
            <p className="mt-1.5 text-[12px] text-gray-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Recent orders */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <h2 className="text-[15px] font-bold text-ink">Recent orders</h2>
            <Link
              href="/account/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
            >
              All orders
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {recent.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-400">
                <Package className="h-5 w-5" />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-ink">
                No orders yet
              </p>
              <p className="mt-1.5 text-[13.5px] text-gray-500">
                When you place an order it will show up here.
              </p>
              <Link
                href="/category/consoles"
                className="btn btn-primary btn-sm mt-5"
              >
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/account/orders/${o.id}`}
                      className="tnum text-[13.5px] font-semibold text-brand hover:underline"
                    >
                      {o.id}
                    </Link>
                    <p className="text-[12.5px] text-gray-500">
                      {formatDate(o.created_at)} · {o.items.length} item
                      {o.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[13.5px] font-semibold text-ink">
                    {money(o.total)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[12px] font-medium capitalize text-gray-600">
                    {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {/* Default address */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">Delivery address</h2>
              <Link
                href="/account/addresses"
                className="text-[13px] font-medium text-brand hover:underline"
              >
                Manage
              </Link>
            </div>
            {defaultAddress ? (
              <address className="text-[13px] not-italic leading-relaxed text-gray-500">
                <span className="block font-semibold text-ink">
                  {defaultAddress.label}
                  {defaultAddress.is_default && (
                    <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand">
                      Default
                    </span>
                  )}
                </span>
                <span className="block">{defaultAddress.name}</span>
                {defaultAddress.address1}
                {defaultAddress.address2 && (
                  <>
                    <br />
                    {defaultAddress.address2}
                  </>
                )}
                <br />
                {defaultAddress.city}, {defaultAddress.state} —{" "}
                {defaultAddress.pincode}
                <br />
                <span className="tnum">{defaultAddress.phone}</span>
              </address>
            ) : (
              <p className="text-[13.5px] text-gray-500">
                No saved address yet.
              </p>
            )}
          </section>

          {/* Quick links */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-[15px] font-bold text-ink">Quick links</h2>
            <ul className="space-y-1">
              {[
                { href: "/account/orders", label: "Track an order" },
                { href: "/account/addresses", label: "Add a delivery address" },
                { href: "/account/profile", label: "Change your password" },
                { href: "/contact", label: "Contact the team" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[13.5px] font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-ink"
                  >
                    {l.label}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
