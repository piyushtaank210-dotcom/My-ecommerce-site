import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle, RotateCcw } from "lucide-react";
import { getOrder } from "@/lib/orders";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { getProduct } from "@/lib/queries";
import { getOrderReturnEligibility } from "@/lib/returns";
import { ReturnRequestForm } from "@/components/returns/ReturnRequestForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Request Return - Order ${id}` };
}

export default async function OrderReturnRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ itemId?: string; type?: string }>;
}) {
  const { id } = await params;
  const { itemId, type } = await searchParams;

  const order = (await getOrder(id));
  if (!order) notFound();

  const user = await getCurrentUser();
  if (
    user &&
    order.user_id !== null &&
    order.user_id !== user.id &&
    !isStaff(user.role)
  ) {
    notFound();
  }

  const eligibility = (await getOrderReturnEligibility(order));

  // Augment items with product images and item-level eligibility
  const enrichedItems = await Promise.all(
    order.items.map(async (it) => {
      const key = it.id ?? 0;
      return {
        ...it,
        image: (await getProduct(it.product_slug))?.image ?? null,
        eligibility: eligibility.itemEligibilities[key],
      };
    })
  );

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <Link
            href={`/order/${order.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to order {order.id}
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-brand">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[24px] font-bold text-ink">
                Request Return or Replacement
              </h1>
              <p className="mt-0.5 text-[13.5px] text-gray-500">
                Order <span className="font-semibold text-ink">{order.id}</span> · Delivering to {order.city}, {order.state}
              </p>
            </div>
          </div>
        </header>

        {!eligibility.eligible ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
              <AlertCircle className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-[17px] font-bold text-amber-900">
              Not eligible for return
            </h2>
            <p className="mt-2 text-[14px] text-amber-800">
              {eligibility.reason}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href={`/order/${order.id}`} className="btn btn-outline btn-sm">
                Return to order
              </Link>
              <Link href="/contact" className="btn btn-primary btn-sm">
                Contact Customer Support
              </Link>
            </div>
          </div>
        ) : (
          <ReturnRequestForm
            order={{ ...order, items: enrichedItems }}
            formattedDeadline={eligibility.formattedDeadline}
            daysRemaining={eligibility.daysRemaining}
            initialItemId={itemId ? parseInt(itemId, 10) : undefined}
            initialType={type === "replacement" ? "replacement" : "return"}
          />
        )}
      </div>
    </div>
  );
}

