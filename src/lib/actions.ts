"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "./db";
import { getCart } from "./cart";
import { createContactMessage } from "./contact";
import { ensureSessionId, readSessionId } from "./session";
import { createOrder } from "./orders";
import { InventoryError } from "./inventory";
import { getBackorderPolicy } from "./settings";
import { backordersAllowed } from "./variations";
import { getProduct } from "./queries";
import { createAddress } from "./addresses";
import { STORE } from "./store-info";
import {
  createUser,
  endSession,
  findUserByEmail,
  getCurrentUser,
  safeNext,
  startSession,
  verifyPassword,
} from "./auth";

/* ------------------------------------------------------------------- auth */

export type AuthState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  confirm: z.string(),
  terms: z.literal("on", { error: "Accept the terms to continue." }),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match.",
  path: ["confirm"],
});

export async function registerAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    terms: formData.get("terms"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  if (await findUserByEmail(parsed.data.email)) {
    return {
      ok: false,
      errors: { email: "An account with this email already exists." },
      message: "Check the highlighted fields.",
    };
  }

  const user = await createUser(parsed.data.name, parsed.data.email, parsed.data.password);
  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect(safeNext(String(formData.get("next") ?? "")));
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    // Deliberately vague: don't reveal whether the email exists.
    return {
      ok: false,
      errors: { form: "That email and password combination is not correct." },
      message: "",
    };
  }

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/* ------------------------------------------------------------------- cart */

export async function addToCartAction(
  productSlug: string,
  variantId: string | null,
  quantity: number
): Promise<{ ok: boolean; message: string }> {
  const product = (await getProduct(productSlug));
  if (!product) return { ok: false, message: "Product not found." };

  const variant = variantId
    ? product.variants.find((v) => v.id === variantId) ?? null
    : null;

  // A product with options is stocked by its options, so a basket line
  // without one has nothing to be counted against.
  if (product.variants.length > 0 && !variant) {
    return { ok: false, message: "Choose an option first." };
  }

  const available = variant ? variant.stock : product.stock;
  const qty = Math.max(1, Math.min(quantity || 1, 10));

  // A shopper may only buy what is on the shelf — unless the store takes
  // backorders, in which case the missing units are ordered in.
  const allowBackorder = backordersAllowed((await getBackorderPolicy()));

  if (available <= 0 && !allowBackorder) {
    return { ok: false, message: "That option is out of stock." };
  }
  if (qty > available && !allowBackorder) {
    return { ok: false, message: `Only ${available} left in stock.` };
  }

  const sessionId = await ensureSessionId();
  const db = getDb();

  const existing = (await db
    .prepare(
      `SELECT id, quantity FROM cart_items
       WHERE session_id = ? AND product_slug = ? AND (variant_id IS ? OR variant_id = ?)`
    )
    .get(sessionId, productSlug, variantId, variantId)) as
    | { id: number; quantity: number }
    | undefined;

  if (existing) {
    (await db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(
      Math.min(existing.quantity + qty, allowBackorder ? 10 : available),
      existing.id
    ));
  } else {
    (await db.prepare(
      `INSERT INTO cart_items (session_id, product_slug, variant_id, quantity)
       VALUES (?,?,?,?)`
    ).run(sessionId, productSlug, variantId, qty));
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `${product.name} added to cart` };
}

export async function updateCartAction(
  lineId: number,
  quantity: number
): Promise<void> {
  const sessionId = await readSessionId();
  if (!sessionId) return;
  const db = getDb();
  if (quantity <= 0) {
    (await db.prepare("DELETE FROM cart_items WHERE id = ? AND session_id = ?").run(
      lineId,
      sessionId
    ));
  } else {
    (await db.prepare(
      "UPDATE cart_items SET quantity = ? WHERE id = ? AND session_id = ?"
    ).run(Math.min(quantity, 10), lineId, sessionId));
  }
  revalidatePath("/", "layout");
}

export async function removeFromCartAction(lineId: number): Promise<void> {
  const sessionId = await readSessionId();
  if (!sessionId) return;
  (await getDb()
    .prepare("DELETE FROM cart_items WHERE id = ? AND session_id = ?")
    .run(lineId, sessionId));
  revalidatePath("/", "layout");
}

/* --------------------------------------------------------------- contact */

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid email address."),
  // The phone number is optional, but when the customer gives one it
  // goes in the notification the shop gets.
  phone: z.string().trim().max(20, "That phone number is too long.").optional(),
  subject: z.enum(["product", "order", "support", "returns", "other"]),
  orderId: z.string().trim().optional(),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more — at least 10 characters."),
});

export type ContactState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

export async function sendContactMessageAction(
  _prev: ContactState,
  formData: FormData
): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    subject: formData.get("subject"),
    orderId: formData.get("orderId") ?? undefined,
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  // The enquiry is saved first and always, and the notification is
  // sent after it. If the mail service is not set up, or it refuses the
  // message, the enquiry is still in the shop's queue.
  let saved: { id: number; emailStatus: string };
  try {
    saved = await createContactMessage({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject,
      orderId: parsed.data.orderId || null,
      message: parsed.data.message,
    });
  } catch (err) {
    // A write that failed is not a message that arrived. Saying so, and
    // giving the customer a way through, is better than letting the
    // form fall over and losing what they wrote.
    console.error("[contact] the enquiry could not be recorded:", err);
    return {
      ok: false,
      message: `We could not record your message just now. Please email us at ${STORE.email} and we will pick it up.`,
    };
  }

  return {
    ok: true,
    message: `Thanks — your message is with our team, reference ${saved.id}. We reply to every enquiry within one working day.`,
  };
}

/* --------------------------------------------------------------- checkout */

const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid phone number."),
  address1: z.string().trim().min(5, "Enter your street address."),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter your city."),
  state: z.string().trim().min(2, "Select your state."),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "PIN code must be 6 digits."),
  notes: z.string().trim().optional(),
  paymentMethod: z.enum(["upi", "card", "cod", "emi"]),
  // The payment provider that took the money, and its own reference
  // for the payment. They are what a refund is sent against, so a
  // checkout that talks to a gateway writes them down.
  paymentGateway: z.string().trim().optional(),
  paymentReference: z.string().trim().optional(),
  saveAddress: z.string().trim().optional(),
});

export type CheckoutState = {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
};

export async function placeOrderAction(
  _prev: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address1: formData.get("address1"),
    address2: formData.get("address2") ?? undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    notes: formData.get("notes") ?? undefined,
    paymentMethod: formData.get("paymentMethod"),
    paymentGateway: formData.get("paymentGateway") ?? undefined,
    paymentReference: formData.get("paymentReference") ?? undefined,
    saveAddress: formData.get("saveAddress") ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const cart = await getCart();
  if (cart.lines.length === 0) {
    return { ok: false, message: "Your cart is empty." };
  }

  let orderId: string;
  try {
    orderId = await createOrder(
      parsed.data,
      cart.lines.map((l) => ({
        productSlug: l.product.slug,
        variantId: l.variant?.id ?? null,
        variantName: l.variant?.name ?? null,
        name: l.product.name,
        price: l.unitPrice,
        quantity: l.quantity,
      })),
      {
        subtotal: cart.subtotal,
        shipping: cart.shipping,
        total: cart.total,
      }
    );
  } catch (err) {
    // The stock ran out between the basket and the checkout. Nothing was
    // charged and nothing was taken off the shelf.
    if (err instanceof InventoryError) {
      return {
        ok: false,
        message: `${err.message} Nothing has been ordered — please adjust your basket.`,
      };
    }
    throw err;
  }

  const sessionId = await readSessionId();
  if (sessionId) {
    (await getDb().prepare("DELETE FROM cart_items WHERE session_id = ?").run(sessionId));
  }

  // "Save this address" — keep it on the account for next time.
  if (parsed.data.saveAddress) {
    const user = await getCurrentUser();
    if (user) {
      await createAddress(user.id, {
        label: "Checkout",
        name: parsed.data.name,
        phone: parsed.data.phone,
        address1: parsed.data.address1,
        address2: parsed.data.address2,
        city: parsed.data.city,
        state: parsed.data.state,
        pincode: parsed.data.pincode,
      });
    }
  }

  revalidatePath("/", "layout");
  redirect(`/order/${orderId}`);
}
