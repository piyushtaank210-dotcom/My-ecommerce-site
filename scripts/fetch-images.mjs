/**
 * Fetches real product photographs for the catalogue, plus lifestyle
 * photographs for the homepage hero.
 *
 * Two sources:
 *  1. playstation.com's own /content/dam/ product-photography (PS5 hardware)
 *  2. Wikimedia Commons — freely-licensed photos for everything else
 *
 *   node scripts/fetch-images.mjs
 *
 * Writes public/products/<slug>.jpg plus:
 *   data/product-images.json   slug -> public path
 *   data/hero-images.json       hero image key -> public path
 *   data/ATTRIBUTION.md         credit for every Commons image
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/products");
const HERO_OUT = join(ROOT, "public/hero");
const UA = "PlayForgeDemo/1.0 (local demo store; contact: demo@example.com)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PS = "https://www.playstation.com";

mkdirSync(OUT, { recursive: true });
mkdirSync(HERO_OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------- 1. official PlayStation photos */
const OFFICIAL = {
  "ps5-slim": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-1001\.jpg$/ },
  // Sony publishes one chassis family (the disc model) on this page; the
  // Digital Edition is the same shell without the disc drive, which shows
  // from the rear — so the back view stands in for it.
  "ps5-slim-digital": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-1019\.jpg$/ },
  "ps5-slim-side": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-100[2-4]\.jpg$/ },
  "ps5-slim-controller": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-100[5-7]\.jpg$/ },
  "ps5-slim-angled": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-10(0[89]|1[0-2])\.jpg$/ },
  "ps5-slim-back": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-10(1[3-9]|2[0-2])\.jpg$/ },
  "ps5-slim-detail": { dir: "en/hardware/ps5/product-photography-slim/spinset/ps5-e-chassis", pick: /V006_JPEG_4K_SR-10(2[3-9]|3[0-6])\.jpg$/ },
};

/* ------------------------------------------- 2. Wikimedia Commons photos */
/** slug -> { search, match } or { exact: "Commons file title" } */
const COMMONS = {
  "ps5-hero": { exact: "PlayStation 5 and DualSense with transparent background.png" },
  "ps5-digital": { exact: "PS5Digitalprorefined.jpg" },
  "ps5-pro": { exact: "PlayStation 5 Pro no disc drive.jpg" },
  "ps4-slim": { exact: "Sony-PlayStation-4-PS4-DualShock-4.png" },
  "dualsense-white": { search: "DualSense controller", match: /chroma pearl|dualsense/i },
  "dualsense-midnight": { exact: "Playstation Dualsense controller.jpg" },
  "dualsense-edge": { exact: "Playstation DualSense Controller.png" },
  "portal": { exact: "PlayStation Portal.jpg" },
  "psvr2": { search: "PlayStation VR2", match: /vr2/i },
  // Pinned by exact title: the loose search used to match this key landed on
  // a photo of a console on a stand, which is not a charging station.
  "charging-station": { exact: "Playstatioin 5 Black game controller - 2.jpg" },
  "mouse": { search: "Logitech gaming mouse computer", match: /mouse/i },
  "mic": { search: "studio microphone condenser", match: /microphone/i },
  "powerbank": { search: "power bank portable charger", match: /power bank|charger/i },
};

const manifest = {};
const heroManifest = {};

/**
 * Commons search is flaky — a term that matched last week can come back empty
 * today. Reuse the previous run's mapping for any key whose file is already
 * on disk, so a failed search never silently drops a product's photograph.
 */
function loadPreviousManifest(file, dir) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return {};
  let previous = {};
  try {
    previous = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  const kept = {};
  for (const [key, rel] of Object.entries(previous)) {
    const name = rel.split("/").pop();
    if (name && existsSync(join(dir, name))) kept[key] = rel;
  }
  return kept;
}

const previousManifest = loadPreviousManifest(
  "data/product-images.json",
  OUT
);
const previousHeroManifest = loadPreviousManifest("data/hero-images.json", HERO_OUT);

/**
 * Credits live in a JSON sidecar so a failed search doesn't erase the
 * attribution for a photograph that is still on disk.
 */
function loadPreviousCredits() {
  const path = join(ROOT, "data/image-credits.json");
  if (!existsSync(path)) return { products: {}, hero: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { products: raw.products ?? {}, hero: raw.hero ?? {} };
  } catch {
    return { products: {}, hero: {} };
  }
}

const previousCredits = loadPreviousCredits();
const creditMap = { products: { ...previousCredits.products }, hero: { ...previousCredits.hero } };

/* ---------------------------------------------------------- PlayStation.com */
async function officialPaths() {
  const res = await fetch(`${PS}/en-in/ps5/`, { headers: { "User-Agent": BROWSER_UA } });
  const html = await res.text();
  const set = new Set();
  for (const m of html.matchAll(/(\/content\/dam\/global_pdc\/[^"&\\]+?\.(?:jpg|jpeg|png))/gi)) {
    set.add(m[1].replace(/&amp;/g, ""));
  }
  return [...set];
}

const offPaths = await officialPaths();

for (const [slug, spec] of Object.entries(OFFICIAL)) {
  const pool = offPaths.filter((p) => p.includes(spec.dir));
  const chosen = pool.map((p) => p.split("/").pop()).find((f) => spec.pick.test(f));
  if (!chosen) {
    console.log(`  ✗ ${slug} — no official match`);
    continue;
  }
  const full = pool.find((p) => p.endsWith("/" + chosen));
  const file = `${slug}.jpg`;
  const dest = join(OUT, file);
  if (!existsSync(dest) || statSync(dest).size < 5000) {
    const res = await fetch(PS + full, {
      headers: { "User-Agent": BROWSER_UA, Referer: `${PS}/en-in/ps5/` },
    });
    if (!res.ok) {
      console.log(`  ✗ ${slug} — http ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`  ✓ ${file.padEnd(28)} ${(buf.length / 1024).toFixed(0)} KB  (playstation.com)`);
  } else {
    console.log(`  · ${file.padEnd(28)} cached`);
  }
  manifest[slug] = `/products/${file}`;
}

/* ------------------------------------------------------------- Wikimedia */
const api = "https://commons.wikimedia.org/w/api.php";

async function commonsSearch(term) {
  const url =
    `${api}?action=query&format=json&generator=search&gsrnamespace=6` +
    `&gsrsearch=${encodeURIComponent(term)}&gsrlimit=20` +
    `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1400`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const j = await res.json();
  return Object.values(j.query?.pages ?? {});
}

/** Fetch one specific Commons file by exact title. */
async function commonsExact(title, width = 1400) {
  const url =
    `${api}?action=query&format=json&titles=${encodeURIComponent("File:" + title)}` +
    `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${width}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const j = await res.json();
  const pages = Object.values(j.query?.pages ?? {});
  const p = pages.find((x) => x.imageinfo?.[0]);
  return p ?? null;
}

for (const [slug, spec] of Object.entries(COMMONS)) {
  let candidate = null;
  if (spec.exact) {
    candidate = await commonsExact(spec.exact);
    await sleep(1200);
  } else {
    const pages = await commonsSearch(spec.search);
    await sleep(1200); // stay polite with the Commons API
    candidate = pages.find((p) => {
      const title = p.title.replace("File:", "");
      if (!/\.(jpe?g|png)$/i.test(title)) return false;
      if (!spec.match.test(title) && !spec.match.test(p.title)) return false;
      return p.imageinfo?.[0]?.thumburl;
    });
  }

  if (!candidate) {
    console.log(`  ✗ ${slug} — no Commons match for "${spec.exact ?? spec.search}"`);
    continue;
  }

  const info = candidate.imageinfo[0];
  const ext = /\.png$/i.test(candidate.title) ? "png" : "jpg";
  const file = `${slug}.${ext}`;
  const dest = join(OUT, file);
  const stale = join(OUT, `${slug}.jpg`);
  const stalePng = join(OUT, `${slug}.png`);

  // A pinned title that no longer matches what we downloaded last time means
  // the file on disk is stale — fetch it again rather than serving the old one.
  const previousTitle = previousCredits.products[slug]?.title;
  const sourceChanged =
    spec.exact !== undefined &&
    previousTitle !== candidate.title.replace("File:", "");

  if (!existsSync(dest) || statSync(dest).size < 5000 || sourceChanged) {
    const res = await fetch(info.thumburl ?? info.url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://commons.wikimedia.org/",
      },
    });
    if (!res.ok) {
      console.log(`  ✗ ${slug} — download http ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`  ✓ ${file.padEnd(28)} ${(buf.length / 1024).toFixed(0)} KB  (Commons)`);
  } else {
    console.log(`  · ${file.padEnd(28)} cached`);
  }

  // Remove a stale file with the other extension so the manifest stays unique.
  for (const old of [stale, stalePng]) {
    if (old !== dest && existsSync(old)) {
      try {
        (await import("node:fs")).unlinkSync(old);
      } catch {}
    }
  }

  manifest[slug] = `/products/${file}`;
  creditMap.products[slug] = {
    slug,
    title: candidate.title.replace("File:", ""),
    author: String(info.extmetadata?.Artist?.value ?? "Unknown")
      .replace(/<[^>]+>/g, "")
      .trim(),
    license: String(info.extmetadata?.LicenseShortName?.value ?? "Unknown"),
    source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(candidate.title)}`,
  };
  await sleep(600);
}

/* ------------------------------------------------------- hero photography */
/**
 * The homepage hero photographs are not fetched: they live in public/hero/ and
 * are the ones supplied with the store. See data/hero.json for the slides
 * and data/hero-images.json for the key -> path mapping.
 */
const HERO = {};

for (const [key, title] of Object.entries(HERO)) {
  const candidate = await commonsExact(title, 1600);
  await sleep(1200); // stay polite with the Commons API
  if (!candidate) {
    console.log(`  ✗ ${key} — no Commons file "${title}"`);
    continue;
  }

  const info = candidate.imageinfo[0];
  const file = `${key}.jpg`;
  const dest = join(HERO_OUT, file);

  const previousTitle = previousCredits.hero[key]?.title;
  const sourceChanged = previousTitle !== candidate.title.replace("File:", "");

  if (!existsSync(dest) || statSync(dest).size < 5000 || sourceChanged) {
    const res = await fetch(info.thumburl ?? info.url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://commons.wikimedia.org/",
      },
    });
    if (!res.ok) {
      console.log(`  ✗ ${key} — download http ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`  ✓ ${file.padEnd(28)} ${(buf.length / 1024).toFixed(0)} KB  (hero)`);
  } else {
    console.log(`  · ${file.padEnd(28)} cached`);
  }

  heroManifest[key] = `/hero/${file}`;
  creditMap.hero[key] = {
    key,
    title: candidate.title.replace("File:", ""),
    author: String(info.extmetadata?.Artist?.value ?? "Unknown")
      .replace(/<[^>]+>/g, "")
      .trim(),
    license: String(info.extmetadata?.LicenseShortName?.value ?? "Unknown"),
    source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(candidate.title)}`,
  };
  await sleep(600);
}

/* ----------------------------------------------------------------- output */
// Keep any mapping from the previous run whose file is still on disk, so a
// transient Commons search failure never drops a photograph from the catalogue.
for (const [key, rel] of Object.entries(previousManifest)) {
  if (!manifest[key]) manifest[key] = rel;
}
for (const [key, rel] of Object.entries(previousHeroManifest)) {
  if (!heroManifest[key]) heroManifest[key] = rel;
}

writeFileSync(
  join(ROOT, "data/product-images.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);

writeFileSync(
  join(ROOT, "data/hero-images.json"),
  JSON.stringify(heroManifest, null, 2) + "\n"
);

writeFileSync(
  join(ROOT, "data/image-credits.json"),
  JSON.stringify(creditMap, null, 2) + "\n"
);

const credits = Object.values(creditMap.products);

const creditLines = [
  "# Image credits",
  "",
  "Product photographs for this demo store come from two places.",
  "",
  "## PlayStation hardware",
  "",
  "Official product photography from [playstation.com](https://www.playstation.com).",
  "Sony's brand assets remain the property of Sony — replace these with your own",
  "photography before using the store commercially.",
  "",
  "## Everything else (Wikimedia Commons)",
  "",
  "| Product | File | Author | Licence | Source |",
  "|---|---|---|---|---|",
  ...credits.map(
    (c) =>
      `| ${c.slug} | ${c.title} | ${c.author || "Unknown"} | ${c.license} | [Commons](${c.source}) |`
  ),
  "",
  "## Homepage hero",
  "",
  "The hero photographs in `public/hero/` are supplied with the store — they",
  "are not sourced from Wikimedia Commons.",
  "",
];
writeFileSync(join(ROOT, "data/ATTRIBUTION.md"), creditLines.join("\n"));

console.log(
  `\n${Object.keys(manifest).length} product images ready in public/products/`
);
console.log(
  `${Object.keys(heroManifest).length} hero images ready in public/hero/`
);
console.log(`credits written to data/ATTRIBUTION.md`);
