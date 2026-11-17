import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CheckoutForm } from "@/components/CheckoutForm";
import { OrderSummary } from "@/components/OrderSummary";
import { checkoutView } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/auth";
import { listAddresses } from "@/lib/addresses";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your ConsoleSeller order.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ buy?: string }>;
}) {
  const { buy } = await searchParams;
  const token = buy?.trim() ? buy.trim() : null;

  // The checkout belongs to an account. The order is written against it,
  // the addresses on it are the customer's own, and a guest is sent to
  // sign in before they get here.
  const user = await getCurrentUser();
  if (!user) {
    const here = `/checkout${token ? `?buy=${encodeURIComponent(token)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(here)}&resume=1`);
  }

  const view = await checkoutView(token, user);
  const savedAddresses = await listAddresses(user.id);

  if (view.problem) {
    return (
      <div className="container-x py-10">
        <Breadcrumbs items={[{ label: "Checkout" }]} />
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="text-[18px] font-bold text-amber-900">
            This one cannot be bought
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-amber-800">
            {view.problem}
          </p>
          <Link href="/cart" className="btn btn-primary mt-5">
            Back to your cart
          </Link>
        </div>
      </div>
    );
  }

  if (view.lines.length === 0) redirect("/cart");

  // A basket bought with "buy now" is not in the cart, so there is no
  // cart to go back to — the product is where it came from.
  const backTo =
    view.source === "buy-now" && view.lines[0]
      ? `/product/${view.lines[0].productSlug}`
      : "/cart";

  return (
    <div className="container-x py-8">
      <Breadcrumbs
        items={[
          ...(view.source === "cart"
            ? [{ label: "Cart", href: "/cart" }]
            : []),
          { label: "Checkout" },
        ]}
      />

      <h1 className="mb-2 text-[28px] font-bold text-ink">Checkout</h1>
      <p className="mb-7 text-[13.5px] text-gray-500">
        Pay by UPI, card, netbanking or No Cost EMI on our payment
        provider&rsquo;s secure page — or have cash on delivery.
      </p>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <CheckoutForm
            account={{
              name: user.name,
              email: user.email,
              phone: user.phone,
            }}
            savedAddresses={savedAddresses}
            total={view.totals.total}
            buy={token}
          />
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <OrderSummary
            subtotal={view.totals.subtotal}
            savings={view.savings}
            shipping={view.totals.shipping}
            total={view.totals.total}
            itemCount={view.itemCount}
          >
            <ul className="mt-5 space-y-3 border-t border-gray-200 pt-4">
              {view.lines.map((l) => (
                <li key={`${l.productSlug}-${l.variantId ?? ""}`} className="flex items-center gap-3">
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-50">
                    {l.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={l.image}
                        alt=""
                        className="h-full w-full object-contain p-1"
                      />
                    )}
                    <span className="tnum absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                      {l.quantity}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {l.name}
                    </span>
                    {l.variantName && (
                      <span className="block text-[11.5px] text-gray-500">
                        {l.variantName}
                      </span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                    ₹{l.lineTotal.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={backTo}
              className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {view.source === "buy-now" ? "Back to the product" : "Edit cart"}
            </Link>
          </OrderSummary>

          <Link
            href="/category/consoles"
            className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-gray-500 hover:text-ink"
          >
            Continue shopping
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
