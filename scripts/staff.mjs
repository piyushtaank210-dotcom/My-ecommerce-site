/**
 * The demo staff accounts, shared by the seed script and `create-staff`.
 *
 * Override the passwords with PF_ADMIN_PASSWORD and PF_SUPPORT_PASSWORD in
 * the environment before seeding anywhere real.
 */
import { randomBytes, scryptSync } from "node:crypto";

export const STAFF = [
  {
    name: "Store Admin",
    email: process.env.PF_ADMIN_EMAIL ?? "consoleseller.in@gmail.com",
    password: process.env.PF_ADMIN_PASSWORD ?? "myconsole@121",
    role: "admin",
  },
  {
    name: "Support Desk",
    email: process.env.PF_SUPPORT_EMAIL ?? "support@consoleseller.in",
    password: process.env.PF_SUPPORT_PASSWORD ?? "consoleseller-support-1",
    role: "support",
  },
];

/** The same scrypt scheme the app uses — salt:key, both hex. */
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}
