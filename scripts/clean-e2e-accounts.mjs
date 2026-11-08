/**
 * Removes the accounts that earlier runs of the end-to-end suite left
 * behind.
 *
 *   node scripts/clean-e2e-accounts.mjs
 *
 * Each run of the suite registers a throwaway customer account. The suite
 * now removes its own at the end, but the ones from before it did are still
 * in the database. They are removed through the back office's own delete
 * endpoint, and only accounts shaped like the suite's own fixture are ever
 * touched — a real customer's account can never be caught by this.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shopDb, tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** The shape of an account the end-to-end suite registers. */
const FIXTURE = /^e2e\d+@example\.com$/;

const pool = shopDb();
const admin = await tokenForRole("admin");

const { rows: fixtures } = await pool.query(
  "SELECT id, email FROM users WHERE email LIKE 'e2e%@example.com'"
);
await pool.end();

if (fixtures.length === 0) {
  console.log("✓ no leftover test accounts");
  process.exit(0);
}

let removed = 0;
let refused = 0;

for (const f of fixtures) {
  if (!FIXTURE.test(f.email)) {
    console.log(`· ${f.email} is not a suite fixture — left alone`);
    refused++;
    continue;
  }

  const res = await fetch(`${BASE}/api/admin/users/${f.id}`, {
    method: "DELETE",
    headers: { cookie: `pf_auth=${admin}` },
  });

  if (res.ok) {
    console.log(`✓ removed ${f.email}`);
    removed++;
  } else {
    console.log(`✗ ${f.email} — ${res.status} ${(await res.text()).slice(0, 80)}`);
    refused++;
  }
}

console.log(`\n${removed} removed, ${refused} left alone`);
