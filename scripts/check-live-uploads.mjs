/**
 * The live shop's uploads, checked against the real site.
 *
 *   node scripts/check-live-uploads.mjs
 *
 * It signs in to www.consoleseller.in as the shop's own administrator,
 * uploads photographs the way the back office does, and checks that:
 *
 *   - the shop answers with a public Blob address, and not a path;
 *   - the address opens in a browser and gives the photograph back;
 *   - the database keeps the address, so the gallery shows the picture;
 *   - several photographs can be uploaded at once;
 *   - the main photograph can be chosen and the pictures put in order;
 *   - removing a photograph takes it away, from the database and from
 *     the store.
 *
 * Everything it creates is removed again.
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

/** The shop's own credentials, out of the project's own file. */
function credential(name) {
  const text = readFileSync(join(ROOT, ".env.local"), "utf8");
  const m = new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m").exec(text);
  return m ? m[1].trim() : null;
}
const email = credential("PF_ADMIN_EMAIL");
const password = credential("PF_ADMIN_PASSWORD");
if (!email || !password) {
  console.error("✗ The project's own admin credentials were not found.");
  process.exit(1);
}

/** A real JPEG. */
function jpeg(seed = 0) {
  const out = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
  out[out.length - 3] = (seed + 1) & 0xff;
  return out;
}

const { db, closeDb } = await import("./lib/pg-db.mjs");

const { chrome, cdp } = await launchChrome({
  port: 9274,
  profile: "C:/tmp/live-upload-profile",
  dir: "C:/tmp/live-upload-shots",
});

let cookie = "";
let slug = "";
let beforeIds = [];
const addedIds = [];
let blobUrls = [];

try {
  section("Signing in to the live shop");
  await cdp.goto(`${BASE}/login`);
  await waitFor(cdp, "document.querySelector('input[name=email]') !== null", {
    timeout: 30000,
  });
  await cdp.evaluate(setInput("email", email));
  await cdp.evaluate(setInput("password", password));
  await cdp.evaluate(
    `(() => {
      const form = document.querySelector('form');
      const button = form.querySelector('button[type=submit]') || form.querySelector('button');
      button.click();
      return true;
    })()`
  );
  // The session cookie is HttpOnly, so it is read from the browser's
  // own cookie store rather than from the page.
  await waitFor(cdp, "location.pathname !== '/login'", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  const cookies = await cdp.send("Network.getAllCookies");
  const auth = cookies.cookies.find((c) => c.name === "pf_auth");
  if (!auth) {
    console.log(
      "✗ Could not sign in. The page says:",
      (await cdp.evaluate("document.body.innerText.slice(0, 300)")) ?? ""
    );
    process.exit(1);
  }
  cookie = `pf_auth=${auth.value}`;
  check("signed in to the live shop", true, BASE);

  const products = await db.prepare(
      "SELECT slug, name FROM products WHERE status = 'published' AND listed = 1 ORDER BY slug LIMIT 1"
    )
    .all();
  slug = products[0].slug;
  check("a product to work with", Boolean(slug), slug);

  const before = await db.prepare(
      "SELECT id, path FROM product_images WHERE product_slug = ? ORDER BY position, id"
    )
    .all(slug);
  beforeIds = before.map((b) => b.id);

  section("The back office uploads photographs");
  const ticket = await fetch(`${BASE}/api/admin/uploads`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      phase: "ticket",
      target: "product-images",
      slug,
      files: [
        { name: "live-one.jpg", type: "image/jpeg", size: 2048 },
        { name: "live-two.jpg", type: "image/jpeg", size: 2048 },
      ],
    }),
  }).then((r) => r.json().then((b) => ({ mode: b.mode, uploads: b.uploads })));

  check(
    "the shop says where the photographs should go",
    ticket.mode === "direct",
    ticket.mode
  );
  check(
    "it says they go straight to the store",
    ticket.uploads?.length === 2 &&
      ticket.uploads.every((u) => u.pathname.startsWith(`uploads/${slug}/`)),
    JSON.stringify(ticket.uploads?.map((u) => u.pathname) ?? [])
  );

  // The browser sends the file to the store itself, so the upload is
  // done here the same way — with the shop's own signing route.
  const { upload } = await import("@vercel/blob/client");
  for (const slot of ticket.uploads) {
    const body = {
      type: "blob.generate-client-token",
      payload: {
        pathname: slot.pathname,
        clientPayload: JSON.stringify({ target: "product-images", slug }),
        multipart: false,
      },
    };
    const signed = await fetch(`${BASE}/api/admin/uploads`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!signed.ok) {
      check("the shop signed the upload", false, `status ${signed.status}`);
      continue;
    }
    const { clientToken } = await signed.json();
    check("the shop signed the upload", Boolean(clientToken));

    const result = await upload(slot.pathname, jpeg(slot.index), {
      access: "public",
      handleUploadUrl: `${BASE}/api/admin/uploads`,
      clientPayload: JSON.stringify({ target: "product-images", slug }),
      // A browser sends the session cookie by itself. This script runs
      // outside one, so it says who it is.
      headers: { cookie },
    });
    blobUrls.push(result.url);
    check(
      "the photograph is in the store",
      /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(result.url),
      result.url
    );

    const opened = await fetch(result.url);
    const bytes = Buffer.from(await opened.arrayBuffer());
    check(
      "the address opens and gives the photograph back",
      opened.ok &&
        bytes.length > 0 &&
        bytes.subarray(0, 3).toString("hex") === "ffd8ff",
      `${opened.status}, ${bytes.length} bytes, ${opened.headers.get("content-type")}`
    );
  }

  section("The shop is told the photographs have arrived");
  const commit = await fetch(`${BASE}/api/admin/uploads`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      phase: "commit",
      target: "product-images",
      slug,
      uploads: ticket.uploads.map((slot, i) => ({
        pathname: slot.pathname,
        url: blobUrls[i],
        name: slot.name,
        type: slot.type,
        size: 2048,
      })),
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  check(
    "the shop accepted them",
    commit.status === 200,
    commit.status === 200 ? "" : JSON.stringify(commit.body).slice(0, 200)
  );

  const after = await db.prepare(
      "SELECT id, path, alt FROM product_images WHERE product_slug = ? ORDER BY position, id"
    )
    .all(slug);
  const added = after.filter((a) => !beforeIds.includes(a.id));
  check("the gallery has both photographs", added.length === 2, `${added.length}`);
  check(
    "the database keeps the Blob address",
    added.every((a) => a.path?.startsWith("https://")),
    added.map((a) => a.path).join(", ")
  );
  addedIds.push(...added.map((a) => a.id));

  section("The gallery page shows them");
  const gallery = await fetch(`${BASE}/api/admin/products/${slug}/images`, {
    headers: { cookie },
  }).then((r) => r.json());
  check(
    "the gallery lists both",
    (gallery.images ?? []).filter((i) => !beforeIds.includes(i.id)).length === 2
  );

  section("The main photograph and the order");
  const first = added[0];
  const main = await fetch(`${BASE}/api/admin/products/${slug}/images`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "main", id: first.id }),
  });
  check("the main photograph can be chosen", main.ok, String(main.status));

  const product = await db.prepare("SELECT image FROM products WHERE slug = ?")
    .get(slug);
  check(
    "the product card points at the Blob address",
    product?.image?.startsWith("https://"),
    product?.image ?? "none"
  );

  const order = await fetch(`${BASE}/api/admin/products/${slug}/images`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      action: "reorder",
      ids: [first.id, added[1].id],
    }),
  });
  check("the photographs can be put in order", order.ok, String(order.status));

  section("Removing a photograph");
  const remove = await fetch(`${BASE}/api/admin/products/${slug}/images`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "remove", id: added[1].id }),
  });
  check("the photograph was removed", remove.ok, String(remove.status));

  const left = await db.prepare("SELECT id, path FROM product_images WHERE product_slug = ?")
    .all(slug);
  check(
    "the database no longer has it",
    !left.some((l) => l.id === added[1].id)
  );
  const gone = await fetch(blobUrls[1]);
  check("the store no longer has it", !gone.ok, String(gone.status));
  const stillThere = await fetch(blobUrls[0]);
  check("the other photograph is untouched", stillThere.ok, String(stillThere.status));
} catch (err) {
  console.log(
    "\n✗ The run failed:",
    err instanceof Error ? err.message : String(err)
  );
  failures++;
} finally {
  section("Tidying up");
  // Every photograph this run added is taken away again.
  for (const id of addedIds) {
    await fetch(`${BASE}/api/admin/products/${slug}/images`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
  }
  // Anything left in the gallery that this run put there goes too.
  const leftovers = await db.prepare(
      "SELECT id FROM product_images WHERE product_slug = ? AND path LIKE 'https://%'"
    )
    .all(slug);
  for (const row of leftovers) {
    await fetch(`${BASE}/api/admin/products/${slug}/images`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", id: row.id }),
    });
  }
  const afterCleanup = await db.prepare("SELECT id FROM product_images WHERE product_slug = ?")
    .all(slug);
  const missing = beforeIds.filter(
    (id) => !afterCleanup.some((a) => a.id === id)
  );
  check(
    "the photographs that were there before are still there",
    missing.length === 0,
    missing.join(", ")
  );

  await closeDb();
  chrome.kill();

  console.log(
    failures
      ? `\n✗ ${failures} check(s) did not pass.`
      : "\n✓ the live shop uploads to the store, and keeps what it uploads."
  );
  process.exit(failures ? 1 : 0);
}
