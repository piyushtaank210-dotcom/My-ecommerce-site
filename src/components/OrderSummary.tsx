import { money } from "@/lib/format";

export function OrderSummary({
  subtotal,
  savings,
  shipping,
  total,
  itemCount,
  children,
}: {
  subtotal: number;
  savings: number;
  shipping: number;
  total: number;
  itemCount: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-[16px] font-bold text-ink">Order summary</h2>

      <dl className="mt-5 space-y-2.5 text-[13.5px]">
        <div className="flex justify-between">
          <dt className="text-gray-500">
            Subtotal <span className="text-gray-400">({itemCount} items)</span>
          </dt>
          <dd className="tnum font-semibold text-ink">{money(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Delivery</dt>
          <dd className="tnum font-semibold text-ink">
            {shipping === 0 ? (
              <span className="text-green-600">{money(0)}</span>
            ) : (
              money(shipping)
            )}
          </dd>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3">
          <dt className="text-[15px] font-bold text-ink">Total</dt>
          <dd className="tnum text-[22px] font-bold text-ink">{money(total)}</dd>
        </div>
      </dl>

      {savings > 0 && (
        <p className="mt-2 text-[12.5px] font-medium text-green-600">
          You saved {money(savings)} against MRP
        </p>
      )}

      {children}
    </div>
  );
}
