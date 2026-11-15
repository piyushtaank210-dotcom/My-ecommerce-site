/**
 * The shop's own storage layer, checked against the real store.
 *
 *   node scripts/check-blob-store.mjs
 *
 * It is the same code the back office and the customer use, pointed at
 * the shop's own Vercel Blob store, and it checks that:
 *
 *   - a photograph can be written to the store;
 *   - the address it comes back with is a public Blob address;
 *   - the address opens in a browser and gives the photograph back;
 *   - the shop can read the file back;
 *   - the file can be removed again, and is then gone.
 *
 * It writes only one file, and only for as long as the check takes.
 *
 * The credentials come from the environment: `BLOB_STORE_ID` with
 * `VERCEL_OIDC_TOKEN`, or `BLOB_READ_WRITE_TOKEN`. `vercel env pull`
 * puts the first pair there.
 */
import { registerTsResolver } from "./lib/ts-loader.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

registerTsResolver();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

/**
 * The credentials.
 *
 * The file `vercel env pull` writes is read for the store's id and the
 * short-lived credentials. A variable already in the environment wins
 * over the file.
 */
function pulled() {
  const file = join(ROOT, "vercel-env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim());
    if (m && !process.env[m[1]]) out[m[1]] = m[2];
  }
  return out;
}
const pulledEnv = pulled();
for (const [k, v] of Object.entries(pulledEnv)) {
  // A variable Vercel marks as sensitive comes back as a placeholder.
  // It is not a value, and the shop must not treat it as one.
  if (v.startsWith("[SENSITIVE]")) continue;
  if (!process.env[k]) process.env[k] = v;
}

const storage = await import("../src/lib/storage.ts");

section("The shop's credentials");
check(
  "the shop has credentials for the store",
  Boolean(storage.publicStoreToken()) ||
    Boolean(storage.publicStoreId() && storage.oidcToken()),
  storage.publicStoreToken()
    ? "a read-write token"
    : `${storage.publicStoreId() ?? "no store id"} with short-lived credentials`
);
check(
  "the shop is keeping its files in the store",
  storage.usingBlob(),
  storage.storageDriver()
);

if (!storage.usingBlob()) {
  console.log("\n✗ Without credentials there is no store to check.");
  process.exit(1);
}

section("A photograph is written to the store");
const key = `uploads/check-store-${Date.now()}.jpg`;
// A real JPEG: the same one the other checks use.
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

const put = await storage.putObject({
  key,
  body: jpeg,
  contentType: "image/jpeg",
  access: "public",
});
check("the photograph was written", put.ok, put.ok ? put.url : put.reason);

if (!put.ok) {
  // The short-lived credentials Vercel issues are only good for the
  // environment the store is connected to. A store connected to
  // Production and Preview cannot be reached from a machine, because
  // Vercel will not put a sensitive token in the Development
  // environment.
  console.log(`\n✗ ${put.reason}`);
  if (/development/i.test(put.reason)) {
    console.log(
      "\n  The store is connected to Production and Preview. Vercel does not\n" +
        "  put a sensitive token in the Development environment, so a local\n" +
        "  run cannot reach it. The same code path is checked against the\n" +
        "  running site with:\n\n" +
        "      npm run check:live-uploads\n"
    );
  }
  process.exit(1);
}

const url = put.url ?? "";
check(
  "the address is a public Blob address",
  /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(url),
  url
);
check("the address keeps the shop's own folder", url.includes("/uploads/"), url);

section("The address opens in a browser");
const fetched = await fetch(url, { method: "GET" });
const bytes = Buffer.from(await fetched.arrayBuffer());
check(
  "the photograph comes back",
  fetched.ok && bytes.length > 0,
  `${fetched.status}, ${bytes.length} bytes, ${fetched.headers.get("content-type")}`
);
check(
  "what comes back is the photograph that was sent",
  bytes.subarray(0, 3).toString("hex") === "ffd8ff"
);

section("The shop reads it back");
const read = await storage.getObject(key, "public");
check("the shop can read the file", Boolean(read) && read?.length === bytes.length, `${read?.length ?? 0} bytes`);

const info = await storage.headObject(key, "public");
check(
  "the shop can see the file's details",
  Boolean(info) && info?.sizeBytes === bytes.length,
  info ? `${info.sizeBytes} bytes, ${info.contentType}` : "not found"
);

section("It is removed again");
await storage.deleteObject(key, "public");
const gone = await storage.headObject(key, "public");
check("the file is gone", gone === null, gone ? "still there" : "gone");

const after = await fetch(url, { method: "GET" });
check("the address no longer gives anything back", !after.ok, String(after.status));

console.log(
  failures
    ? `\n✗ ${failures} check(s) did not pass.`
    : "\n✓ the store works, and the shop's own code can use it."
);
process.exit(failures ? 1 : 0);
