"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { Upload, X, Loader2, CheckCircle2, ShieldCheck, AlertCircle, Clock } from "lucide-react";
import { createReturnRequestAction, type ReturnActionState } from "@/lib/return-actions";
import { RETURN_REASONS, type ReturnReason } from "@/lib/return-status";
import { money } from "@/lib/format";
import type { Order, OrderItem } from "@/lib/types";

type EnrichedOrderItem = OrderItem & {
  image?: string | null;
  eligibility?: {
    canReturn: boolean;
    canReplace: boolean;
    reason?: string;
    hasActiveRequest?: boolean;
  };
};

type Props = {
  order: Omit<Order, "items"> & { items: EnrichedOrderItem[] };
  formattedDeadline?: string;
  daysRemaining?: number;
  initialItemId?: number;
  initialType?: "return" | "replacement";
};

const initial: ReturnActionState = { ok: false };

export function ReturnRequestForm({
  order,
  formattedDeadline,
  daysRemaining,
  initialItemId,
  initialType = "return",
}: Props) {
  const [state, formAction, isPending] = useActionState(
    createReturnRequestAction,
    initial
  );

  const [type, setType] = useState<"return" | "replacement">(initialType);
  const [reason, setReason] = useState<string>("product_damaged");
  const [customerNotes, setCustomerNotes] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Items selection state: map item.id -> { selected: boolean, quantity: number }
  const [selectedItems, setSelectedItems] = useState<
    Record<number, { selected: boolean; quantity: number }>
  >(() => {
    const map: Record<number, { selected: boolean; quantity: number }> = {};
    order.items.forEach((item, index) => {
      const key = item.id ?? index + 1;
      const isEligible = item.eligibility ? item.eligibility.canReturn : true;
      if (initialItemId !== undefined) {
        map[key] = {
          selected: key === initialItemId && isEligible,
          quantity: item.quantity,
        };
      } else {
        map[key] = {
          selected: isEligible,
          quantity: item.quantity,
        };
      }
    });
    return map;
  });

  // Client-side photo previews with metadata
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; url: string }[]>(
    []
  );

  const handleToggleItem = (key: number) => {
    setSelectedItems((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        selected: !prev[key]?.selected,
      },
    }));
  };

  const handleChangeQty = (key: number, max: number, delta: number) => {
    setSelectedItems((prev) => {
      const current = prev[key]?.quantity ?? 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return {
        ...prev,
        [key]: {
          ...prev[key],
          quantity: next,
        },
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxBytes = 5 * 1024 * 1024; // 5MB limit

    const validFiles: File[] = [];
    for (const f of files) {
      if (!allowedTypes.includes(f.type)) {
        setUploadError(`"${f.name}" is not a supported format. Please upload JPG, PNG, or WebP.`);
        e.target.value = "";
        return;
      }
      if (f.size > maxBytes) {
        setUploadError(`"${f.name}" exceeds the 5MB size limit. Please upload a smaller photo.`);
        e.target.value = "";
        return;
      }
      validFiles.push(f);
    }

    const remainingSlots = 4 - photoPreviews.length;
    if (validFiles.length > remainingSlots) {
      setUploadError(`You can only upload up to 4 evidence photographs.`);
    }

    const toAdd = validFiles.slice(0, remainingSlots).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));

    setPhotoPreviews((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].url);
      copy.splice(index, 1);
      return copy;
    });
  };

  // Compile JSON items payload for formData
  const itemsPayload = order.items
    .map((item, index) => {
      const key = item.id ?? index + 1;
      const sel = selectedItems[key];
      if (!sel?.selected) return null;
      return {
        orderItemId: item.id ?? key,
        productSlug: item.product_slug,
        variantId: item.variant_id,
        name: item.name,
        price: item.price,
        quantity: sel.quantity,
      };
    })
    .filter(Boolean);

  const estimatedRefund = itemsPayload.reduce(
    (sum, it) => sum + (it ? it.price * it.quantity : 0),
    0
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden inputs to pass data safely without manual typing */}
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="items" value={JSON.stringify(itemsPayload)} />

      {/* Auto-populated Order Summary Banner */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-gray-500">
                Order ID
              </span>
              <span className="rounded bg-brand-tint px-2 py-0.5 text-[12px] font-semibold text-brand">
                Auto-Verified
              </span>
            </div>
            <p className="tnum mt-1 text-[18px] font-bold text-ink">
              {order.id}
            </p>
          </div>

          {formattedDeadline && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[12px] font-semibold text-ink">
                <Clock className="h-3.5 w-3.5 text-brand" />
                Return Window Active
              </div>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Valid until {formattedDeadline} ({daysRemaining} {daysRemaining === 1 ? "day" : "days"} left)
              </p>
            </div>
          )}
        </div>
      </div>

      {state.message && !state.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13.5px] font-medium text-red-700">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {/* Step 1: Select Items */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">
            1. Select item(s) to return or replace
          </h2>
          <span className="text-[12.5px] text-gray-500">
            {itemsPayload.length} selected
          </span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">
          Choose the product and quantity you wish to return or exchange.
        </p>

        <ul className="mt-5 divide-y divide-gray-100">
          {order.items.map((item, index) => {
            const key = item.id ?? index + 1;
            const sel = selectedItems[key] ?? { selected: false, quantity: item.quantity };
            const isEligible = item.eligibility ? item.eligibility.canReturn : true;
            const eligibilityReason = item.eligibility?.reason;

            return (
              <li
                key={key}
                className={`flex flex-wrap items-center gap-4 py-4 ${
                  !isEligible ? "opacity-60" : ""
                }`}
              >
                <input
                  type="checkbox"
                  id={`item-${key}`}
                  checked={sel.selected}
                  disabled={!isEligible}
                  onChange={() => handleToggleItem(key)}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand disabled:cursor-not-allowed"
                />

                {/* Product Image */}
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-gray-100 bg-gray-50">
                  {item.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-400">ITEM</span>
                  )}
                </span>

                <label
                  htmlFor={`item-${key}`}
                  className={`min-w-0 flex-1 ${isEligible ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <span className="block text-[14px] font-semibold text-ink">
                    {item.name}
                  </span>
                  {item.variant_name && (
                    <span className="block text-[12px] text-gray-500">
                      Variant: {item.variant_name}
                    </span>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="tnum text-[12.5px] font-medium text-gray-600">
                      {money(item.price)} each
                    </span>
                    {!isEligible && eligibilityReason && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {eligibilityReason}
                      </span>
                    )}
                  </div>
                </label>

                {isEligible && sel.selected && item.quantity > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-gray-500">Qty:</span>
                    <button
                      type="button"
                      onClick={() => handleChangeQty(key, item.quantity, -1)}
                      className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="tnum w-5 text-center text-[13px] font-bold text-ink">
                      {sel.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChangeQty(key, item.quantity, 1)}
                      className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                )}

                <span className="tnum shrink-0 text-[14px] font-bold text-ink">
                  {money(item.price * (sel.selected ? sel.quantity : 1))}
                </span>
              </li>
            );
          })}
        </ul>

        {itemsPayload.length === 0 && (
          <p className="mt-3 text-[12.5px] font-medium text-amber-600">
            Please check the box next to at least one eligible product.
          </p>
        )}
      </section>

      {/* Step 2: Resolution Type */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">2. Choose your request type</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              type === "return"
                ? "border-brand bg-brand-tint/10"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="type_selector"
              value="return"
              checked={type === "return"}
              onChange={() => setType("return")}
              className="mt-1 h-4 w-4 text-brand focus:ring-brand"
            />
            <div>
              <span className="block text-[14px] font-bold text-ink">
                Return Product (Refund)
              </span>
              <span className="mt-0.5 block text-[12.5px] text-gray-500">
                Send the item back for QC inspection and receive a full refund of{" "}
                <strong className="text-ink">{money(estimatedRefund)}</strong> to your payment account.
              </span>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              type === "replacement"
                ? "border-brand bg-brand-tint/10"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="type_selector"
              value="replacement"
              checked={type === "replacement"}
              onChange={() => setType("replacement")}
              className="mt-1 h-4 w-4 text-brand focus:ring-brand"
            />
            <div>
              <span className="block text-[14px] font-bold text-ink">
                Replace Product (New Unit)
              </span>
              <span className="mt-0.5 block text-[12.5px] text-gray-500">
                Receive an identical brand-new replacement unit dispatched directly to your address upon pickup verification.
              </span>
            </div>
          </label>
        </div>
      </section>

      {/* Step 3: Reason & Additional Description */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">3. Reason and details</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="reason"
              className="block text-[13px] font-semibold text-ink"
            >
              Reason for request *
            </label>
            <select
              id="reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="customerNotes"
              className="block text-[13px] font-semibold text-ink"
            >
              Additional description
            </label>
            <textarea
              id="customerNotes"
              name="customerNotes"
              rows={3}
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Please provide any additional details describing the issue (e.g. stick drift, power failure, packaging condition)..."
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
      </section>

      {/* Step 4: Multiple Product Image Uploads */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">
            4. Upload evidence photographs
          </h2>
          <span className="text-[12.5px] text-gray-500">
            {photoPreviews.length} of 4 photos
          </span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">
          Upload clear photos of the defect, damage, or product serial barcode (JPG, PNG, or WebP up to 5MB each).
        </p>

        {uploadError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] font-medium text-red-700">
            {uploadError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {photoPreviews.map((p, idx) => (
            <div
              key={idx}
              className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="Evidence preview"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemovePhoto(idx)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {photoPreviews.length < 4 && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-colors hover:border-brand hover:text-brand">
              <Upload className="h-5 w-5" />
              <span className="mt-1 text-[11px] font-semibold">Add Photo</span>
              <input
                type="file"
                name="photos"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </section>

      {/* Submission Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <Link
          href={`/order/${order.id}`}
          className="btn btn-outline"
        >
          Cancel
        </Link>

        <button
          type="submit"
          disabled={isPending || itemsPayload.length === 0}
          className="btn btn-primary"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting Request...
            </>
          ) : type === "replacement" ? (
            "Submit Replacement Request"
          ) : (
            "Submit Return Request"
          )}
        </button>
      </div>
    </form>
  );
}
