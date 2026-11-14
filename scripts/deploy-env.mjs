/**
 * Puts the shop's payment keys on the deployment, through Vercel's API.
 *
 *   node scripts/deploy-env.mjs <project-id-or-slug>
 *
 * The keys come from `.env.local.live` — the same file `npm run gateway:
 * mode` uses — so they are never written down twice and never typed by
 * hand.
 *
 * A variable that starts with `NEXT_PUBLIC_` is sent to the browser, so
 * it is stored as a plain value: Vercel can only inline one of those
 * into the build if it is readable there. Everything else is stored
 * encrypted, which is how the project's other secrets are stored.
 *
 * The webhook secret is not in `.env.local.live` — it is made in
 * Razorpay's dashboard, or by `npm run gateway:secret`. It is read from
 * `.env.local` if it is there, and the script says so and moves on if it
 * is not.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = join(ROOT, ".env.local.live");
const ENV = join(ROOT, ".env.local");
const AUTH_FILE =
  process.env.VERCEL_AUTH_FILE ??
  join(
    process.env.APPDATA ?? join(process.env.HOME ?? "", "AppData", "Roaming"),
    "com.vercel.cli",
    "Data",
    "auth.json"
  );

const project = process.argv[2];
if (!project) {
  console.error(
    "\n✗ Which project? Pass its name or id:\n\n" +
      "    node scripts/deploy-env.mjs my-ecommerce-site"
  );
  process.exit(1);
}

/** The token, from the environment or from the Vercel CLI's own file. */
function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (existsSync(AUTH_FILE)) {
    const a = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
    if (a.token && a.expiresAt * 1000 > Date.now()) return a.token;
  }
  return null;
}

const theToken = token();
if (!theToken) {
  console.error(
    "\n✗ No Vercel token.\n\n" +
      "  Log in with `npx vercel login`, or set VERCEL_TOKEN in the\n" +
      "  environment for this command."
  );
  process.exit(1);
}

/** Reads a variable out of a file. */
function readVar(file, name) {
  if (!existsSync(file)) return null;
  const m = new RegExp(`^${name}="?(.*?)"?$`, "m").exec(readFileSync(file, "utf8"));
  return m ? m[1] : null;
}

const keyId = readVar(LIVE, "RAZORPAY_KEY_ID");
const keySecret = readVar(LIVE, "RAZORPAY_KEY_SECRET");
const webhookSecret = readVar(ENV, "RAZORPAY_WEBHOOK_SECRET");

if (!keyId || !keySecret) {
  console.error(
    "\n✗ There are no live keys in .env.local.live.\n\n" +
      "  Put them there:\n\n" +
      "    RAZORPAY_KEY_ID=\"rzp_live_...\"\n" +
      "    RAZORPAY_KEY_SECRET=\"...\"\n"
  );
  process.exit(1);
}

/**
 * Whether a value is one of the test ones.
 *
 * The shop's webhook secret is made in Razorpay's dashboard. While the
 * shop is still being tested there is a stand-in in `.env.local`
 * instead, and pushing that to the deployment would leave the live site
 * checking webhooks against a secret that is printed in this
 * repository's history.
 */
function isTestValue(value) {
  if (!value) return true;
  return /test|mock|placeholder|example/i.test(value);
}

const VARIABLES = [
  { name: "RAZORPAY_KEY_ID", value: keyId, type: "encrypted" },
  { name: "RAZORPAY_KEY_SECRET", value: keySecret, type: "encrypted" },
  // Public by nature — it goes to the browser to open the checkout — so
  // it has to be readable at build time.
  { name: "NEXT_PUBLIC_RAZORPAY_KEY_ID", value: keyId, type: "plain" },
  {
    name: "RAZORPAY_WEBHOOK_SECRET",
    value: isTestValue(webhookSecret) ? null : webhookSecret,
    type: "encrypted",
    optional: true,
  },
  { name: "RAZORPAY_API_BASE", value: "https://api.razorpay.com", type: "plain" },
];

for (const v of VARIABLES) {
  if (v.type === "encrypted" && v.name.startsWith("NEXT_PUBLIC_")) {
    console.error(`\n✗ ${v.name} would be encrypted, and the browser needs it.`);
    process.exit(1);
  }
}

/** The project, by name or by id. */
async function findProject() {
  const res = await fetch("https://api.vercel.com/v9/projects?limit=50", {
    headers: { Authorization: `Bearer ${theToken}` },
  });
  const body = await res.json();
  return (body.projects ?? []).find(
    (p) => p.id === project || p.name === project
  );
}

const found = await findProject();
if (!found) {
  console.error(`\n✗ There is no project called "${project}".`);
  process.exit(1);
}
console.log(`setting the payment keys on "${found.name}" (${found.id})…\n`);

/** Adds a variable to every environment, replacing any that is there. */
async function addVariable(v) {
  // Vercel will not let two variables share a name and a target, so the
  // ones that are already there are removed first. That is what makes
  // this script safe to run twice — the second run replaces the first
  // run's values rather than failing.
  const existing = await fetch(
    `https://api.vercel.com/v9/projects/${found.id}/env`,
    { headers: { Authorization: `Bearer ${theToken}` } }
  ).then((r) => r.json());

  for (const e of existing.envs ?? []) {
    if (e.key !== v.name) continue;
    await fetch(
      `https://api.vercel.com/v9/projects/${found.id}/env/${e.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${theToken}` } }
    );
  }

  const res = await fetch(
    `https://api.vercel.com/v10/projects/${found.id}/env`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${theToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: v.name,
        value: v.value,
        type: v.type,
        target: ["production", "preview", "development"],
      }),
    }
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

let failed = 0;
for (const v of VARIABLES) {
  if (!v.value) {
    if (v.optional) {
      console.log(`  – ${v.name} — not set, skipped`);
      continue;
    }
    console.log(`  ✗ ${v.name} — not set`);
    failed++;
    continue;
  }

  const r = await addVariable(v);
  if (r.ok) {
    console.log(`  ✓ ${v.name} (${v.type})`);
  } else {
    console.log(
      `  ✗ ${v.name} — ${r.body?.error?.message ?? JSON.stringify(r.body).slice(0, 120)}`
    );
    failed++;
  }
}

/** What is on the project now, so that it can be seen to be right. */
const listed = await fetch(
  `https://api.vercel.com/v9/projects/${found.id}/env`,
  { headers: { Authorization: `Bearer ${theToken}` } }
).then((r) => r.json());

console.log("\nthe payment variables on the project now:");
for (const e of listed.envs ?? []) {
  if (!e.key.startsWith("RAZORPAY") && !e.key.startsWith("NEXT_PUBLIC_RAZORPAY")) {
    continue;
  }
  console.log(`  ${e.key.padEnd(28)} ${e.type.padEnd(10)} [${e.target.join(", ")}]`);
}

console.log(
  failed
    ? `\n✗ ${failed} variable(s) did not go on. The reasons are above.`
    : "\n✓ every variable is on the deployment."
);

if (!failed) {
  console.log(
    "\nNext: redeploy, so that the new variables are in the running site.\n\n" +
      "    npx vercel --prod --token " +
      theToken.slice(0, 6) +
      "…\n\n" +
      "(or let Vercel build it from the next push)."
  );
}

process.exit(failed ? 1 : 0);
