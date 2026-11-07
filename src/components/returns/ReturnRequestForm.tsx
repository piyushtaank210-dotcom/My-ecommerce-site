"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import Link from "next/link";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  Clock,
  Video,
  ImageIcon,
} from "lucide-react";
import { createReturnRequestAction, type ReturnActionState } from "@/lib/return-actions";
import {
  OPENED_PRODUCT_NOTICE,
  policyForReason,
  REASON_POLICIES,
  type EvidenceItem,
} from "@/lib/return-policy";
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

const MAX_PHOTOS = 6;
const MAX_VIDEOS = 2;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

type Evidence = {
  file: File;
  url: string;
  kind: "photo" | "video";
};

/**
 * The customer's return request.
 *
 * The form is driven by the rules for the reason that is chosen: what
 * may be asked for, what has to be sent with it, and which remedy comes
 * first. The rules are the same ones the back office works to, so the
 * customer is never asked for something that will be refused later.
 */
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

  const [reason, setReason] = useState<string>("product_damaged");
  const [customerNotes, setCustomerNotes] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [missingAccessories, setMissingAccessories] = useState("");
  const [sealed, setSealed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);

  const policy = useMemo(() => policyForReason(reason), [reason]);

  /**
   * The remedies this reason allows, the one we would rather give
   * first.
   */
  const remedies = useMemo(() => {
    if (policy.preferredRemedy === "accessories") {
      return [
        {
          value: "accessories" as const,
          title: "Send the missing accessories",
          detail:
            "You keep the console or controller, and we send the parts that were missing.",
        },
      ];
    }
    const options: { value: "replacement" | "return"; title: string; detail: string }[] = [];
    if (policy.allowReplacement) {
      options.push({
        value: "replacement",
        title: "Replace the product (new unit)",
        detail:
          "A brand-new unit is sent to you once the unit that came back has been checked.",
      });
    }
    if (policy.allowRefund) {
      options.push({
        value: "return",
        title: "Return the product for a refund",
        detail:
          "You send the unit back, we inspect it, and the refund is raised to your payment method.",
      });
    }
    // The remedy the shop would rather give comes first.
    return options.sort((a, b) => {
      const aFirst = a.value === policy.preferredRemedy ? 0 : 1;
      const bFirst = b.value === policy.preferredRemedy ? 0 : 1;
      return aFirst - bFirst;
    });
  }, [policy]);

  const [type, setType] = useState<string>(
    policy.preferredRemedy === "accessories" ? "accessories" : initialType
  );

  // A different reason means different remedies, so the choice follows
  // the rules rather than staying where it was.
  useEffect(() => {
    const first = remedies[0];
    if (first && !remedies.some((r) => r.value === type)) {
      setType(first.value);
    }
  }, [remedies, type]);

  // Items selection state: map item.id -> { selected: boolean, quantity: number }
  const [selectedItems, setSelectedItems] = useState<
    Record<number, { selected: boolean; quantity: number }>
  >(() => {
    const map: Record<number, { selected: boolean; quantity: number }> = {};
    order.items.forEach((item, index) => {
      const key = item.id ?? index + 1;
      const isEligible = item.eligibility ? item.eligibility.canReturn : true;
      map[key] = {
        selected:
          initialItemId !== undefined ? key === initialItemId && isEligible : isEligible,
        quantity: item.quantity,
      };
    });
    return map;
  });

  const handleToggleItem = (key: number) => {
    setSelectedItems((prev) => ({
      ...prev,
      [key]: { ...prev[key], selected: !prev[key]?.selected },
    }));
  };

  const handleChangeQty = (key: number, max: number, delta: number) => {
    setSelectedItems((prev) => {
      const current = prev[key]?.quantity ?? 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [key]: { ...prev[key], quantity: next } };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const accepted: Evidence[] = [];
    for (const f of files) {
      if (PHOTO_TYPES.includes(f.type)) {
        if (f.size > MAX_PHOTO_BYTES) {
          setUploadError(`"${f.name}" is over 5MB. Please upload a smaller photograph.`);
          e.target.value = "";
          return;
        }
        accepted.push({ file: f, url: URL.createObjectURL(f), kind: "photo" });
      } else if (VIDEO_TYPES.includes(f.type)) {
        if (f.size > MAX_VIDEO_BYTES) {
          setUploadError(`"${f.name}" is over 60MB. Please upload a shorter video.`);
          e.target.value = "";
          return;
        }
        accepted.push({ file: f, url: URL.createObjectURL(f), kind: "video" });
      } else {
        setUploadError(
          `"${f.name}" is not a photograph or a video we can play. Use JPG, PNG or WebP for a photograph, and MP4, WebM or MOV for a video.`
        );
        e.target.value = "";
        return;
      }
    }

    const photos = evidence.filter((x) => x.kind === "photo");
    const videos = evidence.filter((x) => x.kind === "video");
    const tooManyPhotos =
      photos.length + accepted.filter((x) => x.kind === "photo").length > MAX_PHOTOS;
    const tooManyVideos =
      videos.length + accepted.filter((x) => x.kind === "video").length > MAX_VIDEOS;

    if (tooManyPhotos || tooManyVideos) {
      setUploadError(
        `You can upload up to ${MAX_PHOTOS} photographs and ${MAX_VIDEOS} videos.`
      );
      e.target.value = "";
      return;
    }

    setEvidence((prev) => [...prev, ...accepted]);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    setEvidence((prev) => {
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

  const photos = evidence.filter((x) => x.kind === "photo");
  const videos = evidence.filter((x) => x.kind === "video");

  const blocked = policy.requiresSealed && !sealed;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="items" value={JSON.stringify(itemsPayload)} />
      <input type="hidden" name="sealedState" value={sealed ? "sealed" : "opened"} />

      {/* The order, and the day the claim has to be made by. */}
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
            <p className="tnum mt-1 text-[18px] font-bold text-ink">{order.id}</p>
          </div>

          {formattedDeadline && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[12px] font-semibold text-ink">
                <Clock className="h-3.5 w-3.5 text-brand" />
                {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
              </div>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Report it by {formattedDeadline}
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

      {/* 1. The reason — it decides everything that follows. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">1. What is wrong?</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          Choose the reason that fits. It decides what we can do and what
          we need to see.
        </p>

        <div className="mt-4">
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
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-2 rounded-lg bg-brand-tint/10 p-3 text-[12.5px] text-gray-700">
            {policy.summary}
          </p>
        </div>
      </section>

      {/* 2. The items. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">
            2. Select item(s) this is about
          </h2>
          <span className="text-[12.5px] text-gray-500">
            {itemsPayload.length} selected
          </span>
        </div>

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

      {/* 3. The remedy. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">3. How would you like this put right?</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          {policy.preferredRemedy === "replacement" &&
            "Where we can, the first thing we do for a damaged or faulty unit is send a replacement."}
          {policy.preferredRemedy === "refund" &&
            "A voluntary return is refunded once the unit has come back and we have looked at it."}
          {policy.preferredRemedy === "accessories" &&
            "You keep the unit and we send what was missing."}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {remedies.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                type === r.value
                  ? "border-brand bg-brand-tint/10"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="type_selector"
                value={r.value}
                checked={type === r.value}
                onChange={() => setType(r.value)}
                className="mt-1 h-4 w-4 text-brand focus:ring-brand"
              />
              <div>
                <span className="block text-[14px] font-bold text-ink">
                  {r.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-gray-500">
                  {r.value === "return" ? (
                    <>
                      Send the item back for inspection and receive a refund of{" "}
                      <strong className="text-ink">{money(estimatedRefund)}</strong>{" "}
                      to your payment account.
                    </>
                  ) : (
                    r.detail
                  )}
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* 4. The details. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">4. Tell us what happened</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="customerNotes"
              className="block text-[13px] font-semibold text-ink"
            >
              Description of the problem *
            </label>
            <textarea
              id="customerNotes"
              name="customerNotes"
              rows={3}
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="What is wrong, and what you expected instead."
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {policy.kind === "damage" && (
            <div>
              <label
                htmlFor="serialNumber"
                className="block text-[13px] font-semibold text-ink"
              >
                Serial number
              </label>
              <input
                id="serialNumber"
                name="serialNumber"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="On the underside of the unit, if it has one"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1 text-[12px] text-gray-500">
                If you can, add a photograph of it to the evidence below.
              </p>
            </div>
          )}

          {policy.kind === "missing_accessories" && (
            <div>
              <label
                htmlFor="missingAccessories"
                className="block text-[13px] font-semibold text-ink"
              >
                Which accessories are missing? *
              </label>
              <textarea
                id="missingAccessories"
                name="missingAccessories"
                rows={2}
                value={missingAccessories}
                onChange={(e) => setMissingAccessories(e.target.value)}
                placeholder="One per line — for example: power adapter, HDMI cable, controller charging cable."
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          )}

          {policy.requiresSealed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={sealed}
                  onChange={(e) => setSealed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-brand focus:ring-brand"
                />
                <span className="text-[13px] text-amber-900">
                  <span className="block font-bold">
                    I confirm the unit is completely sealed
                  </span>
                  <span className="mt-1 block">
                    The manufacturer&apos;s packaging and seals are intact,
                    the unit has not been activated, registered, used or
                    tampered with, and every accessory, document and piece
                    of packaging is still in the box.
                  </span>
                </span>
              </label>
              <p className="mt-3 border-t border-amber-200 pt-3 text-[12.5px] text-amber-900">
                {OPENED_PRODUCT_NOTICE}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 5. The evidence. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink">5. Send us the evidence</h2>
          <span className="text-[12.5px] text-gray-500">
            {photos.length} photo{photos.length === 1 ? "" : "s"},{" "}
            {videos.length} video{videos.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* What is needed, and what is only useful. */}
        <ul className="mt-4 space-y-2.5">
          {policy.evidence.map((e: EvidenceItem) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
                  e.required
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {e.required ? "Needed" : "Helpful"}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">
                  {e.label}
                </span>
                <span className="block text-[12px] text-gray-500">{e.hint}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-[12.5px] text-gray-600">
          A claim is never turned away only because a photograph or an
          unboxing video is missing. If you cannot send one of them, tell
          us and we will look at the claim on what we have.
        </p>

        {uploadError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] font-medium text-red-700">
            {uploadError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {evidence.map((p, idx) => (
            <div
              key={idx}
              className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            >
              {p.kind === "video" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <video
                    src={p.url}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Video className="mr-1 inline h-2.5 w-2.5" />
                    VIDEO
                  </span>
                </>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.url}
                  alt="Evidence preview"
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                aria-label="Remove file"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-colors hover:border-brand hover:text-brand">
            <Upload className="h-5 w-5" />
            <span className="mt-1 text-[11px] font-semibold">Add file</span>
            <input
              type="file"
              name="evidence"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500">
          <ImageIcon className="h-3.5 w-3.5" />
          Photographs: JPG, PNG or WebP up to 5MB each, up to {MAX_PHOTOS}.
          Videos: MP4, WebM or MOV up to 60MB, up to {MAX_VIDEOS}.
        </p>
      </section>

      {/* The send. */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <Link href={`/order/${order.id}`} className="btn btn-outline">
          Cancel
        </Link>

        <button
          type="submit"
          disabled={isPending || itemsPayload.length === 0 || blocked}
          className="btn btn-primary"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting Request...
            </>
          ) : type === "replacement" ? (
            "Submit Replacement Request"
          ) : type === "accessories" ? (
            "Submit Missing Accessories Request"
          ) : (
            "Submit Return Request"
          )}
        </button>
      </div>
    </form>
  );
}

/**
 * The reasons the customer may pick from.
 *
 * They come from the policy so that the form, the back office and the
 * published rules cannot drift apart.
 */
const REASON_OPTIONS = REASON_POLICIES.map((p) => ({
  value: p.value,
  label: p.label,
}));
