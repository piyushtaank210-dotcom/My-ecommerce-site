"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { money } from "@/lib/format";
import { STATES } from "@/lib/states";
import type { Address } from "@/lib/types";
import { toast } from "./Toaster";

/**
 * Razorpay's own checkout.
 *
 * The script is Razorpay's; it opens a window on their site where the
 * customer chooses how to pay — UPI, a card, netbanking, a wallet, an
 * EMI. It is loaded here rather than in the layout because it is only
 * needed at the checkout, and it is loaded after the page is ready
 * because nothing happens until the customer asks to pay.
 */
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** The colour the gateway's window is shown in. */
const BRAND = "#0071c5";

/** The shop's name, as the gateway shows it. */
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "ConsoleSeller";

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void; onescape?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** What the shop's own endpoint answered with. */
type GatewayOrder = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string | null;
  shop_order_id: string;
  pending_token: string;
};

export function CheckoutForm({
  account,
  savedAddresses = [],
  total = 0,
}: {
  /** The signed-in customer's details, if there is one. */
  account?: { name: string; email: string; phone: string | null } | null;
  savedAddresses?: Address[];
  /** What the order comes to, so the button can say so. */
  total?: number;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<"online" | "cod">("online");
  const formRef = useRef<HTMLFormElement>(null);
  // Whether the money has been taken. It stops a closed payment window
  // from putting away an order that has in fact been paid for.
  const paid = useRef(false);

  const preferred =
    savedAddresses.find((a) => a.is_default) ?? savedAddresses[0] ?? null;

  /** Fills the address fields from a saved address. */
  function useSaved(id: string) {
    const saved = savedAddresses.find((a) => a.id === Number(id));
    const form = formRef.current;
    if (!saved || !form) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        el.value = value;
      }
    };
    set("name", saved.name);
    set("phone", saved.phone);
    set("address1", saved.address1);
    set("address2", saved.address2 ?? "");
    set("city", saved.city);
    set("state", saved.state);
    set("pincode", saved.pincode);
  }

  /** What the customer has typed into a field. */
  function field(name: string): string {
    const form = formRef.current;
    if (!form) return "";
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.value.trim() : "";
  }

  /**
   * Starts the order.
   *
   * The shop is asked for an order to pay against, and it answers with
   * the gateway's order, the amount and the currency. Money taken at the
   * door is finished here instead.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = formRef.current;
    if (!form) return;

    setBusy(true);
    setMessage(null);
    setErrors({});

    const details = Object.fromEntries(new FormData(form).entries());

    let response: Response;
    try {
      response = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      });
    } catch {
      setBusy(false);
      setMessage(
        "We could not reach the shop. Please check your connection and try again."
      );
      return;
    }

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      errors?: Record<string, string>;
      mode?: string;
      order_id?: string;
      amount?: number;
      currency?: string;
      key_id?: string | null;
      shop_order_id?: string;
      pending_token?: string;
    };

    if (!response.ok || !body.ok) {
      setBusy(false);
      setErrors(body.errors ?? {});
      setMessage(body.error ?? "We could not start the order. Please try again.");
      return;
    }

    // Money taken at the door — the order is in.
    if (body.mode === "cod") {
      router.push(`/order/${body.order_id}`);
      return;
    }

    await openGateway({
      order_id: body.order_id ?? "",
      amount: body.amount ?? 0,
      currency: body.currency ?? "INR",
      key_id: body.key_id ?? null,
      shop_order_id: body.shop_order_id ?? "",
      pending_token: body.pending_token ?? "",
    });
  }

  /**
   * Opens the gateway's own window.
   */
  async function openGateway(order: GatewayOrder) {
    const ready = await gatewayIsReady();
    if (!ready || !window.Razorpay) {
      setBusy(false);
      setMessage(
        "The payment window could not be loaded. Please check your connection and try again."
      );
      return;
    }

    const razorpay = new window.Razorpay({
      // The key that opens the checkout is the key that can verify the
      // payment, so it is the one the shop's own answer carried.
      key: order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: STORE_NAME,
      description: `Order ${order.shop_order_id}`,
      prefill: {
        name: field("name"),
        email: field("email"),
        contact: contactForGateway(field("phone")),
      },
      notes: { shop_order_id: order.shop_order_id },
      theme: { color: BRAND },
      handler: (response) => {
        void confirmPayment(response, order);
      },
      modal: {
        // The window was closed without paying. Nothing has been paid,
        // so the order the shop wrote is put away again.
        ondismiss: () => {
          void abandonOrder(order);
        },
      },
    });

    // A payment that was refused. The customer can try again inside the
    // window, so the order is left alone until the window is closed.
    razorpay.on("payment.failed", (response) => {
      setMessage(failedMessage(response));
    });

    razorpay.open();
  }

  /**
   * Checks that the payment is real, and finishes the order.
   */
  async function confirmPayment(
    response: RazorpayResponse,
    order: GatewayOrder
  ) {
    paid.current = true;

    let verified: Response;
    try {
      verified = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
      });
    } catch {
      setBusy(false);
      setMessage(
        "We could not confirm your payment just now. If you have been charged, please do not pay again — we will confirm your order by email."
      );
      return;
    }

    const body = (await verified.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      order_id?: string;
    };

    if (!verified.ok || !body.ok) {
      setBusy(false);
      setMessage(
        body.error ??
          "We could not confirm your payment just now. If you have been charged, please do not pay again — we will confirm your order by email."
      );
      return;
    }

    toast("Payment received — your order is in.", "success");
    router.push(`/order/${body.order_id}`);
  }

  /**
   * Puts away an order the customer did not pay for.
   *
   * The basket is left as it was, so they can simply try again.
   */
  async function abandonOrder(order: GatewayOrder, reason?: string) {
    if (paid.current) return;

    setBusy(false);
    setMessage(
      reason ??
        "The payment was not completed, so no order has been placed. Your basket is untouched — you can try again."
    );

    try {
      await fetch("/api/cancel-pending-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.shop_order_id,
          pending_token: order.pending_token,
        }),
      });
    } catch {
      // The shop will sort it out — an order that was never paid for is
      // not one the customer has to worry about.
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-6"
      noValidate
    >
      <Script src={RAZORPAY_SCRIPT} strategy="afterInteractive" />

      {message && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
        >
          {message}
        </p>
      )}

      <Section title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="name"
            placeholder="Write your name"
            error={errors.name}
            autoComplete="name"
            defaultValue={account?.name ?? preferred?.name ?? ""}
          />
          <Field
            label="Email address"
            name="email"
            type="email"
            placeholder="you@example.com"
            error={errors.email}
            autoComplete="email"
            defaultValue={account?.email ?? ""}
          />
          <Field
            label="Phone number"
            name="phone"
            type="tel"
            placeholder="98765 43210"
            error={errors.phone}
            autoComplete="tel"
            className="sm:col-span-2"
            defaultValue={account?.phone ?? preferred?.phone ?? ""}
          />
        </div>
      </Section>

      <Section title="Delivery address">
        {savedAddresses.length > 0 && (
          <div className="mb-4">
            <label htmlFor="savedAddress" className="label">
              Use a saved address
            </label>
            <select
              id="savedAddress"
              name="savedAddress"
              defaultValue=""
              onChange={(e) => useSaved(e.target.value)}
              className="input cursor-pointer"
            >
              <option value="">Type a new address</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.address1}, {a.city}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Address line 1"
            name="address1"
            placeholder="Flat / House no., Street"
            error={errors.address1}
            autoComplete="address-line1"
            className="sm:col-span-2"
            defaultValue={preferred?.address1 ?? ""}
          />
          <Field
            label="Address line 2 (optional)"
            name="address2"
            placeholder="Area, landmark"
            error={errors.address2}
            autoComplete="address-line2"
            className="sm:col-span-2"
            defaultValue={preferred?.address2 ?? ""}
          />
          <Field
            label="City"
            name="city"
            placeholder="Pune"
            error={errors.city}
            autoComplete="address-level2"
            defaultValue={preferred?.city ?? ""}
          />
          <div>
            <label htmlFor="state" className="label">
              State
            </label>
            <select
              id="state"
              name="state"
              defaultValue={preferred?.state ?? ""}
              className={`input h-[42px] cursor-pointer ${errors.state ? "input-error" : ""}`}
            >
              <option value="" disabled>
                Select state
              </option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.state && (
              <p className="mt-1 text-[12.5px] text-red-600">{errors.state}</p>
            )}
          </div>
          <Field
            label="PIN code"
            name="pincode"
            placeholder="411001"
            error={errors.pincode}
            autoComplete="postal-code"
            defaultValue={preferred?.pincode ?? ""}
          />
          <div>
            <label htmlFor="notes" className="label">
              Order notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Delivery instructions…"
              className="input resize-none"
            />
          </div>
        </div>

        {account && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="saveAddress"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <span className="text-[13px] leading-relaxed text-gray-500">
              Save this address to my account for next time.
            </span>
          </label>
        )}
      </Section>

      <Section title="Payment method">
        <p className="-mt-2 mb-4 text-[12.5px] text-gray-500">
          Paying now is done on our payment provider&rsquo;s secure page.
          Your card details never reach our servers.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <PaymentOption
            value="online"
            label="Pay now"
            sub="UPI, card, netbanking, EMI"
            Icon={Smartphone}
            checked={method === "online"}
            onSelect={setMethod}
          />
          <PaymentOption
            value="cod"
            label="Cash on Delivery"
            sub="Pay when it arrives"
            Icon={Banknote}
            checked={method === "cod"}
            onSelect={setMethod}
          />
        </div>
      </Section>

      <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {method === "cod" ? "Placing your order…" : "Opening the payment window…"}
          </>
        ) : method === "cod" ? (
          <>
            <Lock className="h-4 w-4" />
            Place order
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Pay {total > 0 ? money(total) : "now"}
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-gray-500">
        <Lock className="h-3.5 w-3.5" />
        Your details stay on this server and are never shared.
      </p>
    </form>
  );
}

/**
 * The customer's number, as the gateway wants it.
 *
 * The gateway shows the country the number belongs to, and it wants the
 * number with that country on the front of it — "9876543210" on its own
 * is not enough for it to know where the number is from, and it asks
 * the customer for it again. The shop is in India and takes Indian
 * numbers, so the country is put on the front of the number when it is
 * not there already.
 */
function contactForGateway(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

/**
 * Whether the gateway's script has arrived.
 *
 * It is loaded in the background, so it may not be there yet when the
 * customer presses the button. This waits a little for it rather than
 * telling them to try again.
 */
async function gatewayIsReady(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    let waited = 0;
    const timer = window.setInterval(() => {
      if (window.Razorpay) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      waited += 100;
      if (waited >= 10000) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * What the gateway said when it refused the payment.
 */
function failedMessage(response: unknown): string {
  const error = (response as { error?: { description?: string; message?: string } })
    ?.error;
  return (
    error?.description ??
    error?.message ??
    "The payment was not completed, so no order has been placed. Your basket is untouched — you can try again."
  );
}

function PaymentOption({
  value,
  label,
  sub,
  Icon,
  checked,
  onSelect,
}: {
  value: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
  checked: boolean;
  onSelect: (value: "online" | "cod") => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3.5 transition-colors hover:border-gray-300 ${
        checked ? "border-brand bg-brand-tint" : "border-gray-200"
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={checked}
        onChange={() => onSelect(value as "online" | "cod")}
        className="sr-only"
      />
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-ink">
          {label}
        </span>
        <span className="block text-[12px] text-gray-500">{sub}</span>
      </span>
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink">
        {title === "Delivery address" && (
          <MapPin className="h-4 w-4 text-brand" />
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  error,
  type = "text",
  placeholder,
  autoComplete,
  className = "",
  defaultValue = "",
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        className={`input h-[42px] ${error ? "input-error" : ""}`}
      />
      {error && <p className="mt-1 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
