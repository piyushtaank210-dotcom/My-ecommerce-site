import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CartLineItem } from "@/components/CartLineItem";
import { OrderSummary } from "@/components/OrderSummary";
import { ProductGrid } from "@/components/ProductGrid";
import { getCart } from "@/lib/cart";
import { getProducts } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review the items in your ConsoleSeller cart before checkout.",
};

export default async function CartPage() {
  const cart = await getCart();

  if (cart.lines.length === 0) {
    const suggestions = (await getProducts({ sort: "discount", limit: 4 }));
    return (
      <div className="container-x py-10">
        <Breadcrumbs items={[{ label: "Cart" }]} />
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 px-6 py-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-gray-400">
            <ShoppingCart className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-[20px] font-bold text-ink">Your cart is empty</h1>
          <p className="mt-2 max-w-sm text-[14px] text-gray-500">
            Nothing here yet. Start with a console or a controller.
          </p>
          <Link href="/category/consoles" className="btn btn-primary btn-lg mt-6">
            Shop consoles
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="mt-14">
          <h2 className="mb-6 text-[20px] font-bold text-ink">
            Biggest discounts
          </h2>
          <ProductGrid products={suggestions} />
        </section>
      </div>
    );
  }

  return (
    <div className="container-x py-8">
      <Breadcrumbs items={[{ label: "Cart" }]} />

      <h1 className="mb-6 text-[28px] font-bold text-ink">
        Your cart{" "}
        <span className="text-[14px] font-medium text-gray-500">
          {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
        </span>
      </h1>

      <div className="mx-auto grid max-w-[1600px] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {cart.lines.map((line) => (
            <CartLineItem key={line.id} line={line} />
          ))}
          <Link
            href="/category/consoles"
            className="inline-block pt-2 text-[13.5px] font-medium text-brand hover:underline"
          >
            ← Continue shopping
          </Link>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <OrderSummary
            subtotal={cart.subtotal}
            savings={cart.savings}
            shipping={cart.shipping}
            total={cart.total}
            itemCount={cart.itemCount}
          >
            <Link href="/checkout" className="btn btn-primary btn-lg mt-5 w-full">
              Proceed to checkout
              <ArrowRight className="h-4 w-4" />
            </Link>
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}
