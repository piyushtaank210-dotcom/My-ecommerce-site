/**
 * Puts the shop's payment keys on the deployment.
 *
 *   npx vercel login
 *   node scripts/deploy-env.mjs <your-project-slug>
 *
 * The keys come from `.env.local.live` — the same file `npm run gateway:
 * mode` uses — so they are never written down twice and never typed by
 * hand. The values are passed to Vercel on the command line, which means
 * they are briefly visible in the machine's process list; nothing else
 * is printed, and the secret is not echoed.
 *
 * It sets the variables for Production, Preview and Development, and it
 * sets them all at once. It does not deploy: Vercel builds a new
 * deployment when the variables change, and that is the next step.
 *
 * The webhook secret is not in `.env.local.live` — it is made in
 * Razorpay's dashboard. It is read from `.env.local` if it is there, and
 * the script says so and moves on if it is not.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = join(ROOT, ".env.local.live");
const ENV = join(ROOT, ".env.local");

const project = process.argv[2];
if (!project) {
  console.error(
    "\n✗ Which project? Pass its name or id:\n\n" +
      "    node scripts/deploy-env.mjs my-ecommerce-site\n\n" +
      "  The project is in the Vercel dashboard, under Settings → General\n" +
      "  → Project ID."
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
 * The shop's own webhook secret is made in Razorpay's dashboard and
 * given to the owner once. While the shop is still being tested there
 * is a stand-in in `.env.local` instead, and pushing that to the
 * deployment would leave the live site checking webhooks against a
 * secret that is printed in this repository's history.
 */
function isTestValue(value) {
  if (!value) return true;
  return /test|mock|placeholder|example/i.test(value);
}

if (isTestValue(webhookSecret)) {
  console.log(
    "\n  The webhook secret in .env.local is a test one, so it is not being\n" +
      "  pushed. Make the real one in Razorpay's dashboard\n" +
      "  (Settings → Webhooks → Add a new webhook) and put it in .env.local\n" +
      "  as RAZORPAY_WEBHOOK_SECRET, then run this again.\n"
  );
}

/**
 * What goes on the deployment, and how.
 *
 * A name that starts with `NEXT_PUBLIC_` is sent to the browser. The
 * key secret and the webhook secret must never be one of those — the
 * list is written out here rather than worked out, so that the mistake
 * of adding a secret as a public variable is impossible to make.
 */
const VARIABLES = [
  { name: "RAZORPAY_KEY_ID", value: keyId, secret: false },
  { name: "RAZORPAY_KEY_SECRET", value: keySecret, secret: true },
  { name: "NEXT_PUBLIC_RAZORPAY_KEY_ID", value: keyId, secret: false },
  {
    name: "RAZORPAY_WEBHOOK_SECRET",
    value: isTestValue(webhookSecret) ? null : webhookSecret,
    secret: true,
    optional: true,
  },
  {
    name: "RAZORPAY_API_BASE",
    value: "https://api.razorpay.com",
    secret: false,
  },
];

for (const v of VARIABLES) {
  if (v.secret && v.name.startsWith("NEXT_PUBLIC_")) {
    console.error(`\n✗ ${v.name} is a secret and would be sent to the browser.`);
    process.exit(1);
  }
}

console.log(`setting the payment keys on "${project}"…\n`);

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

  const args = [
    "vercel",
    "env",
    "add",
    v.name,
    "--value",
    v.value,
    "--project",
    project,
    "--environment",
    "production,preview,development",
    "--force",
    "--yes",
  ];
  if (v.secret) args.push("--sensitive");

  const result = spawnSync("npx", args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    encoding: "utf8",
  });

  if (result.status === 0) {
    console.log(`  ✓ ${v.name} set for production, preview and development`);
  } else {
    console.log(`  ✗ ${v.name} — ${(result.stderr || result.stdout || "").trim().split("\n").slice(-2).join(" ")}`);
    failed++;
  }
}

console.log(
  failed
    ? `\n✗ ${failed} variable(s) did not go on. The reasons are above.`
    : "\n✓ every variable is on the deployment."
);

if (!failed) {
  console.log(
    "\nNext: redeploy, so that the new variables are in the running site.\n\n" +
      "    npx vercel --prod\n\n" +
      "Then set the webhook up in Razorpay — Settings → Webhooks → Add a new\n" +
      "webhook — with the URL\n\n" +
      "    https://consoleseller.in/api/webhooks/razorpay\n\n" +
      "and the events payment.captured and payment.failed. The secret it shows\n" +
      "is RAZORPAY_WEBHOOK_SECRET: put it in .env.local and run this script\n" +
      "again."
  );
}

process.exit(failed ? 1 : 0);
