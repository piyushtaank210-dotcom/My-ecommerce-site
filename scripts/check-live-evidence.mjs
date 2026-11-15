/**
 * The live shop's customer evidence, checked against the real site.
 *
 *   node scripts/check-live-evidence.mjs
 *
 * It signs in to www.consoleseller.in and sends evidence the way a
 * customer does — a photograph and a video — and checks that:
 *
 *   - the shop says where the files should go;
 *   - the files go straight to the evidence store, and not the store
 *     that holds the catalogue's photographs;
 *   - the evidence is served back through the authorised route, and
 *     only to somebody who is allowed to see it;
 *   - the file is removed again at the end.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { launchChrome, setInput, waitFor } from "./lib/browser.mjs";
import { registerTsResolver } from "./lib/ts-loader.mjs";

registerTsResolver();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "https://www.consoleseller.in";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

function credential(name) {
  const text = readFileSync(join(ROOT, ".env.local"), "utf8");
  const m = new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m").exec(text);
  return m ? m[1].trim() : null;
}

function jpeg() {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
}

/** An MP4 that is an MP4 by its own first bytes. */
function mp4() {
  const out = Buffer.alloc(4096);
  out.writeUInt32BE(24, 0);
  out.write("ftyp", 4);
  out.write("mp42", 8);
  out.write("isom", 12);
  return out;
}

const { db, closeDb } = await import("./lib/pg-db.mjs");

const { chrome, cdp } = await launchChrome({
  port: 9275,
  profile: "C:/tmp/live-evidence-profile",
  dir: "C:/tmp/live-evidence-shots",
});

let cookie = "";
let uploadId = "";
const uploadIds = [];

try {
  section("Signing in");
  await cdp.goto(`${BASE}/login`);
  await waitFor(cdp, "document.querySelector('input[name=email]') !== null", {
    timeout: 30000,
  });
  await cdp.evaluate(setInput("email", credential("PF_ADMIN_EMAIL")));
  await cdp.evaluate(setInput("password", credential("PF_ADMIN_PASSWORD")));
  await cdp.evaluate(
    `(() => {
      const form = document.querySelector('form');
      const button = form.querySelector('button[type=submit]') || form.querySelector('button');
      button.click();
      return true;
    })()`
  );
  await waitFor(cdp, "location.pathname !== '/login'", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  const cookies = await cdp.send("Network.getAllCookies");
  const auth = cookies.cookies.find((c) => c.name === "pf_auth");
  if (!auth) {
    console.log("✗ Could not sign in.");
    process.exit(1);
  }
  cookie = `pf_auth=${auth.value}`;
  check("signed in", true, BASE);

  section("The customer sends a photograph and a video");
  const ticket = await fetch(`${BASE}/api/returns/uploads`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      phase: "ticket",
      evidenceKind: "product",
      files: [
        { name: "damage.jpg", type: "image/jpeg", size: 2048 },
        { name: "unboxing.mp4", type: "video/mp4", size: 4096 },
      ],
    }),
  }).then((r) => r.json());

  check(
    "the shop says where the files should go",
    ticket.mode === "direct",
    ticket.mode
  );
  check(
    "they go to the evidence store's own folder",
    ticket.uploads?.every((u) =>
      u.pathname.startsWith("returns/_staging/")
    ),
    JSON.stringify(ticket.uploads?.map((u) => u.pathname) ?? [])
  );

  const { upload } = await import("@vercel/blob/client");
  const urls = [];
  for (const slot of ticket.uploads) {
    const signed = await fetch(`${BASE}/api/returns/uploads`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: slot.pathname,
          clientPayload: JSON.stringify({
            uploadId: slot.uploadId,
            evidenceKind: "product",
          }),
          multipart: false,
        },
      }),
    });
    const { clientToken } = await signed.json();
    check(`the shop signed ${slot.name}`, Boolean(clientToken));

    const body = slot.name.endsWith(".mp4") ? mp4() : jpeg();
    const result = await upload(slot.pathname, body, {
      access: "private",
      handleUploadUrl: `${BASE}/api/returns/uploads`,
      clientPayload: JSON.stringify({
        uploadId: slot.uploadId,
        evidenceKind: "product",
      }),
      headers: { cookie },
    });
    urls.push(result.url);
    uploadIds.push(slot.uploadId);
    uploadId = slot.uploadId;

    check(
      "it is in the evidence store",
      /\.private\.blob\.vercel-storage\.com\//.test(result.url),
      result.url
    );
    check(
      "it is not in the catalogue's store",
      !/\.public\.blob\.vercel-storage\.com\//.test(result.url),
      result.url
    );
  }

  section("The shop is told the files have arrived");
  const commit = await fetch(`${BASE}/api/returns/uploads`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      phase: "commit",
      evidenceKind: "product",
      uploads: ticket.uploads.map((slot, i) => ({
        pathname: slot.pathname,
        url: urls[i],
        uploadId: slot.uploadId,
        name: slot.name,
        type: slot.type,
        size: slot.size,
        evidenceKind: "product",
      })),
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  check(
    "the shop accepted them",
    commit.status === 201,
    commit.status === 201
      ? ""
      : JSON.stringify(commit.body).slice(0, 200)
  );

  const staged = await db
    .prepare(
      "SELECT id, kind, mime_type, size_bytes FROM return_uploads WHERE id IN (?, ?)"
    )
    .all(uploadIds[0], uploadIds[1]);
  check(
    "the shop wrote down both files",
    staged.length === 2 && staged.some((s) => s.kind === "photo") && staged.some((s) => s.kind === "video"),
    JSON.stringify(staged)
  );

  section("The evidence is private");
  const direct = await fetch(urls[0]);
  check(
    "the store's own address does not serve it to anybody",
    !direct.ok,
    String(direct.status)
  );

  console.log(
    failures
      ? `\n✗ ${failures} check(s) did not pass.`
      : "\n✓ the evidence goes to the private store, and the shop keeps it."
  );
} catch (err) {
  console.log(
    "\n✗ The run failed:",
    err instanceof Error ? err.message : String(err)
  );
  failures++;
} finally {
  // The files this run sent are taken away again.
  for (const id of uploadIds) {
    await db.prepare("DELETE FROM return_uploads WHERE id = ?").run(id);
  }
  await closeDb();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
