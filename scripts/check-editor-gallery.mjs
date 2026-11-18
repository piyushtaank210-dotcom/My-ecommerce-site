/**
 * Drives the editor's photograph gallery the way an administrator would.
 *
 *   node scripts/check-editor-gallery.mjs
 *
 * The dev server must be running on port 3000.
 *
 * The gallery is the one part of the editor that does its own saving — the
 * photographs go up and are put in order the moment they are chosen,
 * rather than waiting for the form. So it is checked on its own: that a
 * photograph may be chosen, that the order may be changed by dragging and
 * by the buttons beside it, that the main photograph may be changed, that
 * it may be described, and that a photograph may be taken away.
 *
 * Everything it makes is removed through the back office's own API.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, waitForLive } from "./lib/browser.mjs";
import { tokenForRole } from "./lib/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9232;

const FIXTURE = "zz-gallery-fixture";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const admin = await tokenForRole("admin");

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      cookie: `pf_auth=${admin}`,
      ...(options.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
    },
  });
  const body = await res.text();
  try {
    return { status: res.status, json: JSON.parse(body) };
  } catch {
    return { status: res.status, json: null, body };
  }
}

/** A one-pixel PNG, so the upload has something real to carry. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

/** What the gallery is showing right now. */
const READ = `(() => {
  const items = [...document.querySelectorAll('.admin-gallery-item')];
  return {
    count: items.length,
    paths: items.map(el => el.querySelector('img')?.getAttribute('src') ?? null),
    main: items.findIndex(el => el.getAttribute('data-main') === 'true'),
    alts: items.map(el => el.querySelector('input')?.value ?? null),
  };
})()`;

/** Puts a file into the gallery's file box, the way a person would. */
const chooseFile = (name) => `(() => {
  const input = document.querySelector('#product-images');
  if (!input) return 'NOT_FOUND';
  // The picture is made from its own bytes, so the browser sends exactly
  // what a real file would carry.
  const bin = atob('${PNG.toString("base64")}');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], ${JSON.stringify(name)}, { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'CHOSEN';
})()`;

let chrome;
let cdp;

try {
  const launched = await launchChrome({
    port: PORT,
    profile: join(tmpdir(), "consoleseller-editor-gallery-chrome-" + Date.now().toString(36)),
    dir: join(ROOT, ".shots"),
  });
  chrome = launched.chrome;
  cdp = launched.cdp;
  await cdp.send("Network.setCookie", {
    name: "pf_auth",
    value: admin,
    domain: "localhost",
    path: "/",
  });

  // The ground is cleared first, through the back office's own API.
  const leftovers = await api("/api/admin/products?limit=100");
  for (const p of leftovers.json?.rows ?? []) {
    if (!p.slug.startsWith(FIXTURE)) continue;
    await api(`/api/admin/products/${p.slug}`, { method: "DELETE" });
  }

  const created = await api("/api/admin/products", {
    method: "POST",
    body: JSON.stringify({
      slug: FIXTURE,
      name: "Zephyr Gallery Fixture",
      brand: "Zephyr",
      category: "consoles",
      price: 10000,
      mrp: 12000,
      stock: 3,
    }),
  });
  check("the fixture product was made", created.status === 201, `status ${created.status}`);

  console.log("\n→ the photographs");
  await cdp.goto(`${BASE}/admin/products/${FIXTURE}`);
  await waitForLive(cdp, ".admin-gallery");
  await sleep(900);

  const empty = await cdp.evaluate(READ);
  check("the gallery starts empty", empty.count === 0, String(empty.count));

  // Two photographs, one after the other.
  await cdp.evaluate(chooseFile("first.png"));
  await sleep(3000);
  await cdp.evaluate(chooseFile("second.png"));
  await sleep(3000);

  const two = await cdp.evaluate(READ);
  check("both photographs are in the gallery", two.count === 2, String(two.count));
  check(
    "the first one is the main photograph",
    two.main === 0,
    `main is ${two.main}`
  );

  const gallery = await api(`/api/admin/products/${FIXTURE}/images`);
  check("the server has both of them", gallery.json?.images?.length === 2, String(gallery.json?.images?.length));
  const paths = gallery.json?.images?.map((i) => i.path) ?? [];

  console.log("\n→ putting them in order");
  // The button that moves a photograph later.
  const moveLater = `(() => {
    const items = [...document.querySelectorAll('.admin-gallery-item')];
    const first = items[0];
    const button = first.querySelector('button[aria-label*="later"]');
    if (!button) return 'NOT_FOUND';
    button.click();
    return 'CLICKED';
  })()`;
  await cdp.evaluate(moveLater);
  await sleep(2500);

  const moved = await api(`/api/admin/products/${FIXTURE}/images`);
  const movedPaths = moved.json?.images?.map((i) => i.path) ?? [];
  check(
    "the buttons put them in order",
    movedPaths[0] === paths[1] && movedPaths[1] === paths[0],
    movedPaths.join(", ")
  );

  console.log("\n→ dragging them");
  // A drag is done by hand, because the browser will not do it by itself.
  const drag = `(() => {
    const items = [...document.querySelectorAll('.admin-gallery-item')];
    const thumbs = items.map(el => el.querySelector('.admin-gallery-thumb'));
    if (thumbs.length < 2) return 'NOT_FOUND';
    const from = thumbs[1];
    const to = thumbs[0];
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return 'DRAGGED';
  })()`;
  await cdp.evaluate(drag);
  await sleep(2500);

  const dragged = await api(`/api/admin/products/${FIXTURE}/images`);
  const draggedPaths = dragged.json?.images?.map((i) => i.path) ?? [];
  check(
    "the drag put them in order",
    draggedPaths[0] === movedPaths[1] && draggedPaths[1] === movedPaths[0],
    draggedPaths.join(", ")
  );

  console.log("\n→ the main photograph");
  const setMain = `(() => {
    const items = [...document.querySelectorAll('.admin-gallery-item')];
    const star = items[1].querySelector('.admin-gallery-star');
    if (!star) return 'NOT_FOUND';
    star.click();
    return 'CLICKED';
  })()`;
  await cdp.evaluate(setMain);
  await sleep(2500);

  const afterMain = await api(`/api/admin/products/${FIXTURE}`);
  check(
    "the product follows the main photograph",
    afterMain.json?.image === draggedPaths[1],
    `${afterMain.json?.image} — expected ${draggedPaths[1]}`
  );

  const shown = await cdp.evaluate(READ);
  check("the gallery marks it", shown.main === 0, `main is ${shown.main}`);
  check(
    "and it is the photograph that was chosen",
    shown.paths[0] === draggedPaths[1],
    `${shown.paths[0]} — expected ${draggedPaths[1]}`
  );

  console.log("\n→ describing and removing");
  const describe = `(() => {
    const items = [...document.querySelectorAll('.admin-gallery-item')];
    const input = items[0].querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'The front of the console');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return 'SET';
  })()`;
  await cdp.evaluate(describe);
  await sleep(3500);

  const described = await api(`/api/admin/products/${FIXTURE}/images`);
  check(
    "the description was saved",
    described.json?.images?.some((i) => i.alt === "The front of the console"),
    JSON.stringify(described.json?.images?.map((i) => i.alt))
  );

  const remove = `(() => {
    const items = [...document.querySelectorAll('.admin-gallery-item')];
    const button = items[0].querySelector('button[aria-label*="Remove"]');
    if (!button) return 'NOT_FOUND';
    button.click();
    return 'CLICKED';
  })()`;
  await cdp.evaluate(remove);
  await sleep(3500);

  const afterRemove = await cdp.evaluate(READ);
  check("the photograph was taken away", afterRemove.count === 1, String(afterRemove.count));

  const removed = await api(`/api/admin/products/${FIXTURE}`, {
    method: "DELETE",
  });
  check("the fixture was removed", removed.status === 200, `status ${removed.status}`);
} finally {
  chrome?.kill();
}

console.log(
  failures === 0
    ? "\n✓ ALL PASS — the editor's photograph gallery"
    : `\n✗ ${failures} FAILURES`
);
process.exit(failures === 0 ? 0 : 1);
