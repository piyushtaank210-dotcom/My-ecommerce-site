"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "./db";
import { createContactMessage } from "./contact";
import { addToCart, cartOwnerKey } from "./cart";
import { STORE } from "./store-info";
import { FLASH_COOKIE, encodeFlash, type FlashKind } from "./flash";
import {
  claimIntent,
  clearPendingIntentId,
  readPendingIntentId,
} from "./purchase";
import {
  createUser,
  endSession,
  findUserByEmail,
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
  await carryOnPendingPurchase(user.id, formData.get("resume") === "1");
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
  await carryOnPendingPurchase(user.id, formData.get("resume") === "1");
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/* ------------------------------------------------------- the waiting cart */

/**
 * Leaves a message for the page the customer lands on next.
 *
 * A server action cannot raise a toast — the toast lives in the browser —
 * so the message is written down in a cookie, and the page reads it and
 * shows it.
 */
async function writeFlash(message: string, kind: FlashKind): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeFlash({ message, kind }), {
    sameSite: "lax",
    path: "/",
    maxAge: 60,
  });
}

/**
 * Carries on with the purchase the customer was making before they were
 * asked to sign in.
 *
 * The purchase is claimed once: the claim is a single statement, so two
 * sign-ins arriving at the same moment cannot both have it, and the thing
 * they asked for is done once and once only.
 *
 * A sign-in that did not come from a purchase button — the customer
 * signing in from the header, hours later — carries on with nothing. The
 * purchase is let go rather than surprising them with it.
 */
async function carryOnPendingPurchase(
  userId: number,
  resume: boolean
): Promise<void> {
  const pendingId = await readPendingIntentId();
  if (!pendingId) return;

  // The waiting is over: this purchase is not waiting for another
  // sign-in, whatever happens next.
  await clearPendingIntentId();
  if (!resume) return;

  const intent = await claimIntent(pendingId, userId);
  if (!intent) return;

  if (intent.kind === "buy-now") {
    // Straight to the checkout, with the one thing they chose in it and
    // nothing else.
    redirect(`/checkout?buy=${intent.id}`);
  }

  // An item for the cart: the ordinary thing, with the ordinary message.
  const res = await addToCart(
    userId,
    intent.product_slug,
    intent.variant_id,
    intent.quantity
  );
  await writeFlash(res.message, res.ok ? "success" : "error");
  revalidatePath("/", "layout");
  redirect(safeNext(intent.next_path ?? ""));
}

/* ------------------------------------------------------------------- cart */

export async function updateCartAction(
  lineId: number,
  quantity: number
): Promise<void> {
  const owner = await cartOwnerKey();
  if (!owner) return;
  const db = getDb();
  if (quantity <= 0) {
    (await db.prepare("DELETE FROM cart_items WHERE id = ? AND session_id = ?").run(
      lineId,
      owner
    ));
  } else {
    (await db.prepare(
      "UPDATE cart_items SET quantity = ? WHERE id = ? AND session_id = ?"
    ).run(Math.min(quantity, 10), lineId, owner));
  }
  revalidatePath("/", "layout");
}

export async function removeFromCartAction(lineId: number): Promise<void> {
  const owner = await cartOwnerKey();
  if (!owner) return;
  (await getDb()
    .prepare("DELETE FROM cart_items WHERE id = ? AND session_id = ?")
    .run(lineId, owner));
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

/*
 * Placing an order is not a server action any more: it goes through
 * POST /api/create-order, because the payment has to be started from the
 * browser and the two halves of it — the order and the gateway's order —
 * are made together. The checkout itself lives in src/lib/checkout.ts.
 */

