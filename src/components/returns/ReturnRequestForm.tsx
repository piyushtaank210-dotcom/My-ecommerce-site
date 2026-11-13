"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import Link from "next/link";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  Clock,
  Video,
  ImageIcon,
  CheckCircle2,
  FileWarning,
} from "lucide-react";
import {
  createReturnRequestAction,
  type ReturnActionState,
} from "@/lib/return-actions";
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
  /** The shop's own words about its return policy. */
  policyDescription?: string;
};

const initial: ReturnActionState = { ok: false };

const MAX_PHOTOS = 6;
const MAX_VIDEOS = 2;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/** What the customer has chosen each file is evidence of. */
const EVIDENCE_KIND_OPTIONS = [
  { value: "product", label: "The product itself" },
  { value: "package", label: "The packaging it came in" },
  { value: "serial", label: "The serial number" },
  { value: "unboxing", label: "The unboxing" },
  { value: "other", label: "Something else" },
] as const;

/**
 * A file the customer has chosen, and how far it has got.
 */
type Evidence = {
  /** The shop's own name for the file, once it has arrived. */
  id: string | null;
  file: File;
  url: string;
  kind: "photo" | "video";
  evidenceKind: string;
  /** How far the upload has got, from 0 to 100. */
  progress: number;
  /** "uploading", "done" or "error". */
  status: "uploading" | "done" | "error";
  error?: string;
};

/**
 * The date as the browser's date field wants it.
 */
function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * The customer's return request.
 *
 * The form is driven by the rules for the reason that is chosen: what
 * may be asked for, what has to be sent with it, and which remedy comes
 * first. The rules are the same ones the back office works to, so the
 * customer is never asked for something that will be refused later.
 *
 * Where a customer cannot send a piece of evidence, they are asked to
 * say why instead. That is not a way of refusing a claim — the claim
 * still goes forward and a person still looks at it.
 */
export function ReturnRequestForm({
  order,
  formattedDeadline,
  daysRemaining,
  initialItemId,
  initialType = "return",
  policyDescription,
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
  const [evidenceKind, setEvidenceKind] = useState<string>("product");
  const [evidenceExcused, setEvidenceExcused] = useState("");

  // The facts the customer confirms and how to reach them.
  const [deliveryDate, setDeliveryDate] = useState<string>(
    toDateInput(order.delivered_at)
  );
  const [contactName, setContactName] = useState<string>(order.name ?? "");
  const [contactEmail, setContactEmail] = useState<string>(order.email ?? "");
  const [contactPhone, setContactPhone] = useState<string>(order.phone ?? "");

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /**
   * Sends one file up, and shows how it is getting on.
   *
   * The file goes on its own so that the customer can see each one
   * finish, and so that one large video does not hold up the rest.
   */
  const uploadFile = (file: File, kind: "photo" | "video") => {
    return new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("files", file);
      form.append("evidenceKind", evidenceKind);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/returns/evidence");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setEvidence((prev) =>
          prev.map((e) =>
            e.file === file ? { ...e, progress: percent, status: "uploading" } : e
          )
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let id: string | null = null;
          try {
            const body = JSON.parse(xhr.responseText);
            id = body?.uploads?.[0]?.id ?? null;
          } catch {
            id = null;
          }
          setEvidence((prev) =>
            prev.map((e) =>
              e.file === file
                ? { ...e, id, progress: 100, status: id ? "done" : "error", error: id ? undefined : "The upload could not be read." }
                : e
            )
          );
          resolve();
          return;
        }
        let message = "The file could not be sent.";
        try {
          message = JSON.parse(xhr.responseText)?.error ?? message;
        } catch {
          // The answer was not the one we expected.
        }
        setEvidence((prev) =>
          prev.map((e) =>
            e.file === file ? { ...e, status: "error", error: message } : e
          )
        );
        resolve();
      };

      xhr.onerror = () => {
        setEvidence((prev) =>
          prev.map((e) =>
            e.file === file
              ? { ...e, status: "error", error: "The file could not be sent. Check your connection and try again." }
              : e
          )
        );
        resolve();
      };

      xhr.send(form);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        accepted.push({
          id: null,
          file: f,
          url: URL.createObjectURL(f),
          kind: "photo",
          evidenceKind,
          progress: 0,
          status: "uploading",
        });
      } else if (VIDEO_TYPES.includes(f.type)) {
        if (f.size > MAX_VIDEO_BYTES) {
          setUploadError(`"${f.name}" is over 60MB. Please upload a shorter video.`);
          e.target.value = "";
          return;
        }
        accepted.push({
          id: null,
          file: f,
          url: URL.createObjectURL(f),
          kind: "video",
          evidenceKind,
          progress: 0,
          status: "uploading",
        });
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

    // Each file is sent on its own, so the customer sees each one
    // finish rather than one bar for the lot.
    for (const item of accepted) {
      await uploadFile(item.file, item.kind);
    }
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
  const uploadedIds = evidence
    .filter((x) => x.status === "done" && x.id)
    .map((x) => x.id as string);
  const uploading = evidence.some(
    (x) => x.status === "uploading"
  );
  const uploadFailed = evidence.some((x) => x.status === "error");

  /**
   * The evidence the rules ask for, and whether it has arrived.
   *
   * What is missing is not a reason to refuse the claim — it is a reason
   * to ask the customer to say why, so that a person can decide.
   */
  const missingEvidence = policy.evidence.filter((e) => {
    if (!e.required) return false;
    if (e.id === "order_id" || e.id === "description") return false;
    if (e.id === "missing_list") return missingAccessories.trim().length < 3;
    if (e.id === "unboxing_video" || e.id === "sealed_video")
      return videos.length === 0;
    return photos.length === 0;
  });

  const blocked = policy.requiresSealed && !sealed;
  const missingDetails =
    customerNotes.trim().length < 10 ||
    !deliveryDate ||
    contactName.trim().length < 2 ||
    !contactEmail.includes("@");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="items" value={JSON.stringify(itemsPayload)} />
      <input type="hidden" name="sealedState" value={sealed ? "sealed" : "opened"} />
      <input type="hidden" name="uploadIds" value={uploadedIds.join(",")} />

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

      {/* The shop's own words about its return policy. It is what the
          shop has written, and it is shown before anything is filled in. */}
      {policyDescription && (
        <div className="rounded-xl border border-brand/20 bg-brand-tint/10 p-4">
          <p className="text-[12px] font-bold uppercase tracking-wider text-brand">
            Our return policy
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-700">
            {policyDescription}
          </p>
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
            {customerNotes.trim().length > 0 && customerNotes.trim().length < 10 && (
              <p className="mt-1 text-[12px] font-medium text-amber-600">
                Please write a little more so we can help quickly.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="deliveryDate"
              className="block text-[13px] font-semibold text-ink"
            >
              Date of delivery *
            </label>
            <input
              id="deliveryDate"
              name="deliveryDate"
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-[12px] text-gray-500">
              We have filled this in from our record of the delivery. Please
              correct it if it is wrong — the return window is counted from
              the day the parcel arrived.
            </p>
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

        {/* What each file is evidence of, so the back office can sort it. */}
        <div className="mt-4">
          <label
            htmlFor="evidenceKind"
            className="block text-[13px] font-semibold text-ink"
          >
            What are you sending?
          </label>
          <select
            id="evidenceKind"
            value={evidenceKind}
            onChange={(e) => setEvidenceKind(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand sm:w-auto"
          >
            {EVIDENCE_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-gray-500">
            Choose this before you pick your files. You can send some of
            each kind by changing it between uploads.
          </p>
        </div>

        {uploadError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] font-medium text-red-700">
            {uploadError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {evidence.map((p, idx) => (
            <div key={idx} className="w-24">
              <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
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

              {/* How the upload is getting on, and that it worked. */}
              <div className="mt-1.5">
                {p.status === "uploading" && (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-gray-500">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      {p.progress}%
                    </p>
                  </>
                )}
                {p.status === "done" && (
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Uploaded
                  </p>
                )}
                {p.status === "error" && (
                  <p className="flex items-start gap-1 text-[10.5px] font-semibold text-red-600">
                    <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                    <span>{p.error ?? "Upload failed"}</span>
                  </p>
                )}
              </div>
            </div>
          ))}

          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-colors hover:border-brand hover:text-brand">
            <Upload className="h-5 w-5" />
            <span className="mt-1 text-[11px] font-semibold">Add file</span>
            <input
              ref={fileInputRef}
              type="file"
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

        {/* The way out for a customer who cannot send something. */}
        {missingEvidence.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2.5">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-amber-900">
                  We cannot see{" "}
                  {missingEvidence.length === 1
                    ? "one piece of evidence"
                    : `${missingEvidence.length} pieces of evidence`}{" "}
                  just yet
                </p>
                <ul className="mt-1.5 list-inside list-disc text-[12.5px] text-amber-800">
                  {missingEvidence.map((e) => (
                    <li key={e.id}>{e.label}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px] text-amber-800">
                  If you cannot send it, tell us why below. Your claim
                  still goes forward and a person still looks at it.
                </p>
                <label
                  htmlFor="evidenceExcused"
                  className="mt-3 block text-[13px] font-semibold text-amber-900"
                >
                  Why you cannot send it
                </label>
                <textarea
                  id="evidenceExcused"
                  name="evidenceExcused"
                  rows={2}
                  value={evidenceExcused}
                  onChange={(e) => setEvidenceExcused(e.target.value)}
                  placeholder="For example: the box was opened before it reached me, so there is no unboxing video."
                  className="mt-1.5 w-full rounded-lg border border-amber-200 bg-white p-3 text-[13.5px] text-ink focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 6. How to reach you. */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-[16px] font-bold text-ink">6. How we reach you</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          We have filled these in from your order. Change them if they are
          out of date — we will use these to tell you what is happening
          with your request.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contactName"
              className="block text-[13px] font-semibold text-ink"
            >
              Your name *
            </label>
            <input
              id="contactName"
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="contactEmail"
              className="block text-[13px] font-semibold text-ink"
            >
              Email address *
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="contactPhone"
              className="block text-[13px] font-semibold text-ink"
            >
              Phone number
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
      </section>

      {/* The send. */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <Link href={`/order/${order.id}`} className="btn btn-outline">
          Cancel
        </Link>

        <div className="flex flex-col items-end gap-2">
          {uploadFailed && (
            <p className="text-[12px] font-medium text-red-600">
              One of your files did not upload. Remove it and add it again,
              or send the request without it and tell us why.
            </p>
          )}
          {uploading && (
            <p className="text-[12px] font-medium text-gray-500">
              Your files are still uploading — the request will be sent when
              they are done.
            </p>
          )}
          <button
            type="submit"
            disabled={
              isPending ||
              uploading ||
              itemsPayload.length === 0 ||
              blocked ||
              missingDetails
            }
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
