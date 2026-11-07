"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findUserByEmail, updateUserPassword, updateUserProfile, endSession, verifyPassword } from "./auth";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "./addresses";
import { requireUser } from "./guard";
import { getDb } from "./db";

export type AccountState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid phone number.")
    .or(z.literal(""))
    .optional(),
});

export async function updateProfileAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  // The address on the account is unique — another person may have it.
  const clash = await findUserByEmail(parsed.data.email);
  if (clash && clash.id !== user.id) {
    return {
      ok: false,
      errors: { email: "An account with this email already exists." },
      message: "Check the highlighted fields.",
    };
  }

  await updateUserProfile(user.id, {
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || "",
  });

  revalidatePath("/", "layout");
  revalidatePath("/account");
  return { ok: true, message: "Your details are saved." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const record = await findUserByEmail(user.email);
  if (!record || !verifyPassword(parsed.data.current, record.password_hash)) {
    return {
      ok: false,
      errors: { current: "That is not your current password." },
      message: "",
    };
  }

  await updateUserPassword(user.id, parsed.data.password);
  return { ok: true, message: "Your password has been changed." };
}

/* -------------------------------------------------------------- addresses */

const addressSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(1, "Name this address.").max(40),
  name: z.string().trim().min(2, "Enter the recipient's name."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, "Enter a valid phone number."),
  address1: z.string().trim().min(5, "Enter the street address."),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(2, "Enter the city."),
  state: z.string().trim().min(2, "Select the state."),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "PIN code must be 6 digits."),
  isDefault: z.string().trim().optional(),
});

export async function saveAddressAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = addressSchema.safeParse({
    id: formData.get("id") ?? undefined,
    label: formData.get("label"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    address1: formData.get("address1"),
    address2: formData.get("address2") ?? undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    isDefault: formData.get("isDefault") ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors, message: "Check the highlighted fields." };
  }

  const d = parsed.data;
  const input = {
    label: d.label,
    name: d.name,
    phone: d.phone,
    address1: d.address1,
    address2: d.address2,
    city: d.city,
    state: d.state,
    pincode: d.pincode,
    isDefault: d.isDefault === "on",
  };

  if (d.id) {
    const id = Number(d.id);
    const updated = await updateAddress(id, user.id, input);
    if (!updated) {
      return { ok: false, message: "That address no longer exists." };
    }
  } else {
    await createAddress(user.id, input);
  }

  revalidatePath("/account/addresses");
  return { ok: true, message: "Address saved." };
}

export async function deleteAddressAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That address no longer exists." };
  }
  await deleteAddress(id, user.id);
  revalidatePath("/account/addresses");
  return { ok: true, message: "Address removed." };
}

export async function makeDefaultAddressAction(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "That address no longer exists." };
  }
  await setDefaultAddress(id, user.id);
  revalidatePath("/account/addresses");
  return { ok: true, message: "Default address updated." };
}

/* ------------------------------------------------------------------ misc */

export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser();
  getDb().prepare("DELETE FROM users WHERE id = ?").run(user.id);
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}
