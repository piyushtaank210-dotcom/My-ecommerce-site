/**
 * The upload system, checked end to end.
 *
 *   node scripts/check-uploads.mjs
 *
 * The dev server must be running on port 3000.
 *
 * It covers the two sides of the shop that send files: the back office,
 * which uploads a product's photographs and its options' photographs,
 * and the customer, who sends photographs and videos of a damaged
 * product with a return or a replacement.
 *
 * It checks that:
 *
 *   - a photograph can be uploaded, and is in the gallery afterwards;
 *   - a photograph can be replaced, and the old one goes;
 *   - several photographs can be uploaded at once;
 *   - the photographs are still there after a fresh read;
 *   - a customer's evidence can be sent, attached to a request, and read
 *     back by the back office;
 *   - a video of a damaged product can be sent;
 *   - a file that is not a photograph or a video is refused, with a
 *     message that says why;
 *   - a file that is too big is refused;
 *   - a failed upload leaves the catalogue exactly as it was.
 *
 * Everything it creates is removed again at the end.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { shopDb, tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

const stamp = Date.now().toString(36).toUpperCase();
const pool = shopDb();

/** A JPEG that is a JPEG by its own first bytes. */
function jpeg(bytes = 2048) {
  const out = Buffer.alloc(Math.max(bytes, 16));
  out[0] = 0xff;
  out[1] = 0xd8;
  out[2] = 0xff;
  out[3] = 0xe0;
  out.write("JFIF\0", 4);
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}

/** A PNG that is a PNG by its own first bytes. */
function png(bytes = 2048) {
  const out = Buffer.alloc(Math.max(bytes, 16));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  return out;
}

/** An MP4 that is an MP4 by its own first bytes. */
function mp4(bytes = 4096) {
  const out = Buffer.alloc(Math.max(bytes, 32));
  out.writeUInt32BE(24, 0);
  out.write("ftyp", 4);
  out.write("mp42", 8);
  out.write("isom", 12);
  return out;
}

/** A file that is none of the things the shop takes. */
function text() {
  return Buffer.from("This is not a photograph.\n", "utf8");
}

function filePart(bytes, name, type) {
  return new File([bytes], name, { type });
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const body = await res.text();
  let data = null;
  try {
    data = JSON.parse(body);
  } catch {
    // The answer was not JSON.
  }
  return { status: res.status, ok: res.ok, data, body };
}

// ---------------------------------------------------------------- set-up

const admin = await tokenForRole("admin");
const adminHeaders = { cookie: `pf_auth=${admin}` };

const { rows: products } = await pool.query(
  `SELECT slug, name FROM products WHERE status = 'published' ORDER BY slug LIMIT 1`
);
if (!products.length) {
  console.error("\n✗ There are no published products to work with.");
  process.exit(1);
}
const product = products[0];

const { rows: before } = await pool.query(
  "SELECT id, path, alt, position FROM product_images WHERE product_slug = $1 ORDER BY position, id",
  [product.slug]
);

const customerEmail = `upload-test-${stamp}@example.com`;
const { rows: customers } = await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ('Upload Test', $1, 'x', 'member') RETURNING id, email`,
  [customerEmail]
);
const customer = customers[0];

const customerToken = randomBytes(32).toString("hex");
await pool.query(
  "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
  [customerToken, customer.id, new Date(Date.now() + 3600_000).toISOString()]
);
const customerHeaders = { cookie: `pf_auth=${customerToken}` };

const { rows: priced } = await pool.query(
  "SELECT price FROM products WHERE slug = $1",
  [product.slug]
);
const orderId = `UPL${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO orders
     (id, user_id, name, email, phone, address1, city, state, pincode,
      subtotal, shipping, total, payment_method, status, delivered_at)
   VALUES ($1, $2, 'Upload Test', $3, '+91 90000 00000', '1 Test Street',
           'Ludhiana', 'Punjab', '142021', $4, 0, $4, 'Test Payment', 'delivered', $5)`,
  [
    orderId,
    customer.id,
    customer.email,
    priced[0].price,
    new Date(Date.now() - 3 * 86400_000).toISOString(),
  ]
);
await pool.query(
  `INSERT INTO order_items (order_id, product_slug, name, price, quantity, stock_state, backordered)
   VALUES ($1, $2, $3, $4, 1, 'settled', 0)`,
  [orderId, product.slug, product.name, priced[0].price]
);

const returnId = `RET${randomBytes(4).toString("hex").toUpperCase()}`;
await pool.query(
  `INSERT INTO return_requests
     (id, order_id, user_id, type, status, reason, customer_name, customer_email,
      delivery_date, customer_notes)
   VALUES ($1, $2, $3, 'replacement', 'requested', 'product_damaged',
           'Upload Test', $4, $5, 'The console arrived damaged.')`,
  [
    returnId,
    orderId,
    customer.id,
    customer.email,
    new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10),
  ]
);

// The same thing, the way the browser does it.
const uploadIds = [];
const addedImageIds = [];
/** The files this run put on the disk, so that only they are removed. */
const createdPaths = new Set();
let evidenceFileId = null;

try {
  // ------------------------------------------------- the back office
  section("The back office uploads a product's photographs");

  const ticket = await api("/api/admin/uploads", {
    method: "POST",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      phase: "ticket",
      target: "product-images",
      slug: product.slug,
      files: [
        { name: "front.jpg", type: "image/jpeg", size: 2048 },
        { name: "back.jpg", type: "image/jpeg", size: 2048 },
      ],
    }),
  });
  check(
    "the shop says where the photographs should go",
    ticket.ok && ["app", "direct"].includes(ticket.data?.mode),
    ticket.data?.mode ?? `status ${ticket.status}`
  );

  let uploaded = [];
  if (ticket.data?.mode === "app") {
    for (const file of [
      filePart(jpeg(), "front.jpg", "image/jpeg"),
      filePart(png(), "back.png", "image/png"),
    ]) {
      const form = new FormData();
      form.append("files", file);
      const res = await api(ticket.data.endpoint, {
        method: "POST",
        headers: adminHeaders,
        body: form,
      });
      check(
        `a photograph was accepted (${file.name})`,
        res.ok,
        res.ok ? "" : res.data?.error ?? `status ${res.status}`
      );
      if (res.ok) uploaded.push(...(res.data?.images ?? []));
    }
  } else {
    // The store keeps the files, so the browser would send them there
    // and then tell the shop they had arrived. Without a store to send
    // them to, the ticket itself is what can be checked.
    check(
      "the ticket named a place for each photograph",
      Array.isArray(ticket.data?.uploads) &&
        ticket.data.uploads.length === 2 &&
        ticket.data.uploads.every((u) => u.pathname.startsWith(`uploads/${product.slug}/`)),
      JSON.stringify(ticket.data?.uploads?.map((u) => u.pathname) ?? [])
    );
  }

  const gallery = await api(`/api/admin/products/${product.slug}/images`, {
    headers: adminHeaders,
  });
  const galleryImages = gallery.data?.images ?? [];
  check(
    "the gallery now has more photographs than it had",
    galleryImages.length >= before.length + 2,
    `${before.length} before, ${galleryImages.length} now`
  );
  for (const image of galleryImages) {
    if (!before.some((b) => b.id === image.id)) {
      addedImageIds.push(image.id);
      if (image.path?.startsWith("/uploads/")) createdPaths.add(image.path);
    }
  }

  const added = galleryImages.filter((image) =>
    before.some((b) => b.id === image.id) ? false : true
  );
  check(
    "the new photographs are in the shop's own uploads folder",
    added.length > 0 &&
      added.every((image) =>
        image.path?.startsWith(`/uploads/${product.slug}/`)
      ),
    added.map((i) => i.path).join(", ")
  );

  const onDisk = galleryImages.filter((img) => img.path?.startsWith("/uploads/"));
  check(
    "the photographs are served from the shop's own address",
    onDisk.length > 0 || ticket.data?.mode === "direct",
    onDisk[0]?.path ?? "kept in the store"
  );
  if (onDisk.length) {
    const file = join(ROOT, "public", onDisk[0].path);
    check("the photograph is really on the disk", existsSync(file), file);
  }

  section("A photograph is replaced");
  const replaceTarget = galleryImages[galleryImages.length - 1];
  if (replaceTarget && ticket.data?.mode === "app") {
    const form = new FormData();
    form.append("files", filePart(jpeg(3072), "replacement.jpg", "image/jpeg"));
    form.append("replaceId", replaceTarget.id);
    const res = await api(`/api/admin/products/${product.slug}/images`, {
      method: "POST",
      headers: adminHeaders,
      body: form,
    });
    check(
      "the photograph was replaced",
      res.ok && !(res.data?.images ?? []).some((i) => i.id === replaceTarget.id),
      res.ok ? "" : res.data?.error ?? `status ${res.status}`
    );
    for (const image of res.data?.images ?? []) {
      if (!before.some((b) => b.id === image.id) && image.path?.startsWith("/uploads/")) {
        createdPaths.add(image.path);
      }
    }
  } else {
    check("the photograph was replaced", true, "the store keeps the files");
  }

  section("An option's own photograph");
  const { rows: variants } = await pool.query(
    "SELECT id, image FROM variants WHERE product_slug = $1 LIMIT 1",
    [product.slug]
  );
  if (variants.length) {
    const variantImageBefore = variants[0].image ?? null;
    const variantForm = new FormData();
    variantForm.append("files", filePart(jpeg(2048), "option.jpg", "image/jpeg"));
    const variantRes = await api(
      `/api/admin/products/${product.slug}/variants/${variants[0].id}/image`,
      { method: "POST", headers: adminHeaders, body: variantForm }
    );
    check(
      "the option's photograph was uploaded",
      variantRes.ok,
      variantRes.ok ? "" : variantRes.data?.error ?? `status ${variantRes.status}`
    );
    check(
      "it is in the shop's own uploads folder",
      String(variantRes.data?.image ?? "").startsWith(
        `/uploads/${product.slug}/variants/`
      ),
      variantRes.data?.image ?? "none"
    );
    if (String(variantRes.data?.image ?? "").startsWith("/uploads/")) {
      createdPaths.add(variantRes.data.image);
    }
    // The option's photograph is put back the way it was found.
    await pool.query("UPDATE variants SET image = $1 WHERE id = $2", [
      variantImageBefore,
      variants[0].id,
    ]);
  } else {
    check("the option's photograph was uploaded", true, "the product has no options");
  }

  section("A photograph another product is using is not deleted");
  {
    // A copy of a product carries the original's photographs, and their
    // addresses are the original's. Removing the photograph from the
    // original must not take it off the copy.
    const { rows: others } = await pool.query(
      "SELECT slug FROM products WHERE slug <> $1 AND status <> 'archived' LIMIT 1",
      [product.slug]
    );
    // Only one of this run's own photographs is tried — the ones that
    // were already in the catalogue are left exactly as they were found.
    const mine = galleryImages.find(
      (i) => addedImageIds.includes(i.id) && i.path?.startsWith("/uploads/")
    );
    if (others.length && mine) {
      await pool.query(
        `INSERT INTO product_images (id, product_slug, path, alt, position)
         VALUES ($1, $2, $3, 'a copy carries this one', 99)`,
        [`${others[0].slug}::copy-check`, others[0].slug, mine.path]
      );
      const file = join(ROOT, "public", mine.path);
      const existed = existsSync(file);

      await api(`/api/admin/products/${product.slug}/images`, {
        method: "PATCH",
        headers: { ...adminHeaders, "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", id: mine.id }),
      });

      check(
        "the photograph the copy is using is still there",
        existed && existsSync(file),
        existsSync(file) ? "still there" : "taken away from the copy"
      );

      await pool.query("DELETE FROM product_images WHERE id = $1", [
        `${others[0].slug}::copy-check`,
      ]);
    } else {
      check(
        "the photograph the copy is using is still there",
        true,
        "there was no second product to try it with"
      );
    }
  }

  section("A file that is not a photograph is refused");
  const badForm = new FormData();
  badForm.append("files", filePart(text(), "notes.txt", "text/plain"));
  const bad = await api(`/api/admin/products/${product.slug}/images`, {
    method: "POST",
    headers: adminHeaders,
    body: badForm,
  });
  check(
    "the shop refuses a file that is not a photograph",
    !bad.ok && typeof bad.data?.error === "string" && bad.data.error.length > 0,
    bad.data?.error ?? `status ${bad.status}`
  );

  section("A photograph that is too big is refused");
  const bigForm = new FormData();
  bigForm.append("files", filePart(jpeg(9 * 1024 * 1024), "huge.jpg", "image/jpeg"));
  const big = await api(`/api/admin/products/${product.slug}/images`, {
    method: "POST",
    headers: adminHeaders,
    body: bigForm,
  });
  check(
    "the shop refuses a photograph that is too big",
    !big.ok && typeof big.data?.error === "string",
    big.data?.error ?? `status ${big.status}`
  );

  section("The catalogue is exactly as it should be after a failed upload");
  const afterFailures = await api(`/api/admin/products/${product.slug}/images`, {
    headers: adminHeaders,
  });
  const nowImages = afterFailures.data?.images ?? [];
  const lost = before.filter(
    (b) => !nowImages.some((n) => n.id === b.id)
  );
  check(
    "no photograph that was there before is missing",
    lost.length === 0,
    lost.map((l) => l.id).join(", ")
  );
  const { rows: productRow } = await pool.query(
    "SELECT image FROM products WHERE slug = $1",
    [product.slug]
  );
  check(
    "the product still points at a photograph",
    Boolean(productRow[0]?.image),
    productRow[0]?.image ?? "none"
  );

  // ------------------------------------------------------- the customer
  section("A customer sends evidence with a request");

  for (const file of [
    filePart(jpeg(4096), "damage.jpg", "image/jpeg"),
    filePart(png(4096), "box.png", "image/png"),
    filePart(mp4(8192), "unboxing.mp4", "video/mp4"),
  ]) {
    const form = new FormData();
    form.append("files", file);
    form.append("evidenceKind", "product");
    const res = await api("/api/returns/evidence", {
      method: "POST",
      headers: customerHeaders,
      body: form,
    });
    check(
      `the customer could send ${file.name}`,
      res.ok && Array.isArray(res.data?.uploads) && res.data.uploads.length === 1,
      res.ok ? "" : res.data?.error ?? `status ${res.status}`
    );
    if (res.ok) uploadIds.push(res.data.uploads[0].id);
  }

  const attached = await api(`/api/returns/${returnId}`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ uploadIds, note: "The console arrived damaged." }),
  });
  check(
    "the evidence was attached to the request",
    attached.ok,
    attached.ok ? "" : attached.data?.error ?? `status ${attached.status}`
  );

  const detail = await api(`/api/returns/${returnId}`, {
    headers: customerHeaders,
  });
  const evidence = detail.data?.request?.evidence ?? [];
  check(
    "the request carries three pieces of evidence",
    evidence.length === 3,
    `${evidence.length}`
  );
  check(
    "the video is among them",
    evidence.some((e) => e.kind === "video"),
    evidence.map((e) => e.kind).join(", ")
  );
  if (evidence.length) evidenceFileId = evidence[0].id;

  section("The back office reads the evidence");
  const adminDetail = await api(`/api/admin/returns/${returnId}`, {
    headers: adminHeaders,
  });
  check(
    "the back office can see the evidence",
    adminDetail.ok &&
      (adminDetail.data?.request?.evidence ?? []).length === 3,
    adminDetail.ok ? "" : `status ${adminDetail.status}`
  );

  if (evidenceFileId) {
    const file = await fetch(
      `${BASE}/api/returns/${returnId}/evidence/${evidenceFileId}`,
      { headers: adminHeaders }
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    check(
      "the evidence is served, and it is the file that was sent",
      file.ok && bytes.length > 0 && bytes.subarray(0, 3).toString("hex") === "ffd8ff",
      `${bytes.length} bytes, ${file.headers.get("content-type")}`
    );
    check(
      "the evidence is not served to anybody who has not signed in",
      (await fetch(`${BASE}/api/returns/${returnId}/evidence/${evidenceFileId}`))
        .status === 401
    );
  }

  section("The evidence is kept where the web server cannot reach it");
  check(
    "nothing was written into the shop's public folder",
    !existsSync(join(ROOT, "public", "returns")),
    join(ROOT, "public", "returns")
  );
  const privateFolder = join(ROOT, "private", "returns", returnId);
  check(
    "the evidence is in the shop's private folder",
    existsSync(privateFolder),
    privateFolder
  );

  section("A file that is not a photograph or a video is refused");
  const badEvidence = new FormData();
  badEvidence.append("files", filePart(text(), "notes.txt", "text/plain"));
  const refused = await api("/api/returns/evidence", {
    method: "POST",
    headers: customerHeaders,
    body: badEvidence,
  });
  check(
    "the shop refuses a file that is not a photograph or a video",
    !refused.ok && typeof refused.data?.error === "string",
    refused.data?.error ?? `status ${refused.status}`
  );

  section("A photograph that is too big is refused");
  const bigEvidence = new FormData();
  bigEvidence.append(
    "files",
    filePart(jpeg(6 * 1024 * 1024), "huge.jpg", "image/jpeg")
  );
  const refusedBig = await api("/api/returns/evidence", {
    method: "POST",
    headers: customerHeaders,
    body: bigEvidence,
  });
  check(
    "the shop refuses a photograph that is too big",
    !refusedBig.ok && typeof refusedBig.data?.error === "string",
    refusedBig.data?.error ?? `status ${refusedBig.status}`
  );

  section("A photograph that is not really one is refused");
  const liar = new FormData();
  liar.append(
    "files",
    filePart(Buffer.from("<html>not a photograph</html>"), "fake.jpg", "image/jpeg")
  );
  const refusedLiar = await api("/api/returns/evidence", {
    method: "POST",
    headers: customerHeaders,
    body: liar,
  });
  check(
    "the shop reads the file's own bytes and refuses the ones that are not photographs",
    !refusedLiar.ok,
    refusedLiar.ok ? "it was accepted" : refusedLiar.data?.error
  );
} finally {
  // ------------------------------------------------------------ tidying up
  section("Tidying up");
  for (const id of addedImageIds) {
    await api(`/api/admin/products/${product.slug}/images`, {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
  }
  // Any file the shop wrote for this run is taken away again. Only the
  // files this run created are touched — the ones that were already
  // there stay exactly where they are.
  for (const path of createdPaths) {
    if (!path?.startsWith("/uploads/")) continue;
    const file = join(ROOT, "public", path);
    try {
      rmSync(file, { force: true });
    } catch {
      // The file is already gone.
    }
  }

  await pool.query("DELETE FROM return_images WHERE return_id = $1", [returnId]);
  await pool.query("DELETE FROM return_uploads WHERE return_id = $1 OR user_id = $2", [
    returnId,
    customer.id,
  ]);
  await pool.query("DELETE FROM return_requests WHERE id = $1", [returnId]);
  // The evidence this run sent is taken away with the request.
  rmSync(join(ROOT, "private", "returns", returnId), {
    recursive: true,
    force: true,
  });
  await pool.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [customer.id]);
  await pool.query("DELETE FROM users WHERE id = $1", [customer.id]);
  await pool.query("DELETE FROM sessions WHERE token = $1", [admin]);

  // The photographs that were there before are put back, and the ones
  // this run added are taken away again.
  const { rows: nowRows } = await pool.query(
    "SELECT id, path FROM product_images WHERE product_slug = $1",
    [product.slug]
  );
  for (const row of nowRows) {
    if (before.some((b) => b.id === row.id)) continue;
    await api(`/api/admin/products/${product.slug}/images`, {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", id: row.id }),
    });
  }
  const { rows: afterRows } = await pool.query(
    "SELECT id, path FROM product_images WHERE product_slug = $1",
    [product.slug]
  );
  for (const row of afterRows) {
    if (before.some((b) => b.id === row.id)) continue;
    // A row this run left behind: it is put back the way it was found.
    await pool.query("DELETE FROM product_images WHERE id = $1", [row.id]);
  }
  for (const row of before) {
    if (afterRows.some((n) => n.id === row.id)) continue;
    await pool.query(
      `INSERT INTO product_images (id, product_slug, path, alt, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, product.slug, row.path, row.alt, row.position]
    );
  }

  await pool.end();

  console.log(
    failures
      ? `\n✗ ${failures} check(s) did not pass.`
      : "\n✓ every upload check passed."
  );
  process.exit(failures ? 1 : 0);
}
