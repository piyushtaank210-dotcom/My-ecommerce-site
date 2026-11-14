import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CheckoutForm } from "@/components/CheckoutForm";
import { OrderSummary } from "@/components/OrderSummary";
import { getCart } from "@/lib/cart";
import { getCurrentUser } from "@/lib/auth";
import { listAddresses } from "@/lib/addresses";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your ConsoleSeller order.",
};

export default async function CheckoutPage() {
  const cart = await getCart();
  if (cart.lines.length === 0) redirect("/cart");

  const user = await getCurrentUser();
  const savedAddresses = user ? await listAddresses(user.id) : [];

  return (
    <div className="container-x py-8">
      <Breadcrumbs items={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} />

      <h1 className="mb-2 text-[28px] font-bold text-ink">Checkout</h1>
      <p className="mb-7 text-[13.5px] text-gray-500">
        Pay by UPI, card, netbanking or No Cost EMI on our payment
        provider&rsquo;s secure page — or have cash on delivery.
      </p>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <CheckoutForm
            account={
              user
                ? { name: user.name, email: user.email, phone: user.phone }
                : null
            }
            savedAddresses={savedAddresses}
            total={cart.total}
          />
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <OrderSummary
            subtotal={cart.subtotal}
            savings={cart.savings}
            shipping={cart.shipping}
            total={cart.total}
            itemCount={cart.itemCount}
          >
            <ul className="mt-5 space-y-3 border-t border-gray-200 pt-4">
              {cart.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-50">
                    {l.product.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={l.product.image}
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
                      {l.product.name}
                    </span>
                    {l.variant && (
                      <span className="block text-[11.5px] text-gray-500">
                        {l.variant.name}
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
              href="/cart"
              className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Edit cart
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
