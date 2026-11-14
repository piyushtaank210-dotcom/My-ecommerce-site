/**
 * Cuts the shop's icons down to the sizes they are actually used at.
 *
 *   node scripts/icons.mjs
 *
 * The icon in `public/icon.png` is a 512-pixel drawing of the shop's bag
 * with a controller on it, saved as a full-colour PNG — 395KB. That is
 * fine for the file it came out of and absurd for a favicon: a browser
 * downloads the whole thing to put a 32-pixel mark in the corner of its
 * window, and an iPhone downloads it again, whole, to put it on the home
 * screen.
 *
 * This cuts it into the three sizes that are asked for — a small one for
 * the tab, one for the home screen, and the big one for anywhere else —
 * and writes each of them out in the fewest bytes that still look right.
 *
 * The originals are left where they are, in `public/`, so the icon can be
 * re-cut at any time. The sharp library that does the work comes with
 * Next.js, which needs it to serve the product photographs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

/** Where the drawing comes from, and what is cut out of it. */
const SOURCE = "icon.png";

/**
 * The cuts.
 *
 * `fit: contain` with a transparent background keeps the drawing's
 * proportions — it is very slightly taller than it is wide, and squashing
 * it to a square would stretch the handle.
 */
const CUTS = [
  { name: "icon-32.png", size: 32 },
  { name: "icon-192.png", size: 192 },
  { name: "apple-icon.png", size: 180 },
  { name: "icon.png", size: 512 },
];

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "sharp is not available. It comes with Next.js, which needs it to\n" +
      "serve the product photographs — reinstall the dependencies and try\n" +
      "again."
  );
  process.exit(1);
}

await mkdir(PUBLIC, { recursive: true });

const source = join(PUBLIC, SOURCE);
const before = (await readFile(source)).length;

for (const cut of CUTS) {
  const out = join(PUBLIC, cut.name);
  const buffer = await sharp(source)
    .resize(cut.size, cut.size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    // A PNG with a palette of a few dozen colours is a fraction of the
    // size of the same picture in full colour, and the drawing is flat
    // enough that nobody can tell the difference.
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();

  await writeFile(out, buffer);
  console.log(
    `  ${cut.name.padEnd(16)} ${String(cut.size).padStart(4)}px  ` +
      `${(buffer.length / 1024).toFixed(0).padStart(4)}KB`
  );
}

console.log(
  `\n  ${SOURCE} was ${(before / 1024).toFixed(0)}KB; the tab icon is now ` +
    `${((await readFile(join(PUBLIC, "icon-32.png"))).length / 1024).toFixed(0)}KB.`
);
