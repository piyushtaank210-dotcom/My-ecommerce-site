/**
 * Renders candidate category-card image areas so the composition can be
 * judged before it is written as markup.
 *
 *   node mock-cards.mjs
 */
import sharp from "sharp";
import { join } from "node:path";

const ROOT = "C:/Users/ADMIN/Desktop/ecommerce";
const P = (f) => join(ROOT, "public/products", f);

const GREY = { r: 249, g: 249, b: 249 };
const GAP = 2;

/** Render one image into a cell, either contained or covering. */
async function cell(file, w, h, fit) {
  const buf = await sharp(P(file))
    .resize({ width: w, height: h, fit, background: GREY })
    .flatten({ background: GREY })
    .toBuffer();
  return { input: buf, left: 0, top: 0 };
}

/** A row of equal cells, each with its own fit. */
async function strip(files, w, h) {
  const cw = Math.floor((w - GAP * (files.length - 1)) / files.length);
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const [file, fit] = Array.isArray(files[i]) ? files[i] : [files[i], "contain"];
    const c = await cell(file, cw, h, fit);
    comps.push({ ...c, left: i * (cw + GAP), top: 0 });
  }
  return sharp({
    create: { width: w, height: h, channels: 3, background: GREY },
  })
    .composite(comps)
    .png()
    .toBuffer();
}

/** One large cell plus a stack of two small ones. */
async function feature(files, w, h) {
  const bigW = Math.round(w * 0.62);
  const smallW = w - bigW - GAP;
  const smallH = Math.floor((h - GAP) / 2);
  const big = await cell(files[0], bigW, h, "cover");
  const s1 = await cell(files[1], smallW, smallH, "contain");
  const s2 = await cell(files[2], smallW, smallH, "contain");
  return sharp({
    create: { width: w, height: h, channels: 3, background: GREY },
  })
    .composite([
      { ...big, left: 0, top: 0 },
      { ...s1, left: bigW + GAP, top: 0 },
      { ...s2, left: bigW + GAP, top: smallH + GAP },
    ])
    .png()
    .toBuffer();
}

const W = 600;
const H = 190;

const consoles = {
  "A 3-up contain": ["ps5-slim.jpg", "ps5-pro.jpg", "ps4-slim.png"],
  "C 3-up angled": ["ps5-slim-angled.jpg", "ps5-pro.jpg", "ps4-slim.png"],
  "D 3-up pro-first": ["ps5-pro.jpg", "ps5-slim.jpg", "ps4-slim.png"],
};

const panels = [];
for (const [label, files] of Object.entries(consoles)) {
  panels.push({ label, buf: await strip(files, W, H) });
}
panels.push({
  label: "B feature + stack",
  buf: await feature(["ps5-pro.jpg", "ps5-slim.jpg", "ps4-slim.png"], W, H),
});
panels.push({
  label: "E controllers 3-up",
  buf: await strip(
    ["dualsense-white.jpg", "dualsense-edge.png", "charging-station.jpg"],
    W,
    H
  ),
});
panels.push({
  label: "F controllers 3-up (edge first)",
  buf: await strip(
    ["dualsense-edge.png", "dualsense-white.jpg", "charging-station.jpg"],
    W,
    H
  ),
});
panels.push({
  label: "G consoles mixed fit",
  buf: await strip(
    [
      ["ps5-slim.jpg", "contain"],
      ["ps5-pro.jpg", "cover"],
      ["ps4-slim.png", "contain"],
    ],
    W,
    H
  ),
});
panels.push({
  label: "H consoles mixed (pro first)",
  buf: await strip(
    [
      ["ps5-pro.jpg", "cover"],
      ["ps5-slim.jpg", "contain"],
      ["ps4-slim.png", "contain"],
    ],
    W,
    H
  ),
});
panels.push({
  label: "I controllers mixed fit",
  buf: await strip(
    [
      ["dualsense-white.jpg", "cover"],
      ["dualsense-edge.png", "contain"],
      ["charging-station.jpg", "cover"],
    ],
    W,
    H
  ),
});
panels.push({
  label: "J controllers edge first mixed",
  buf: await strip(
    [
      ["dualsense-edge.png", "contain"],
      ["dualsense-white.jpg", "cover"],
      ["charging-station.jpg", "cover"],
    ],
    W,
    H
  ),
});

const sheet = [];
let y = 0;
for (const p of panels) {
  sheet.push({ input: p.buf, left: 0, top: y });
  y += H + 26;
}

await sharp({
  create: { width: W, height: y, channels: 3, background: "#ffffff" },
})
  .composite(sheet)
  .jpeg({ quality: 88 })
  .toFile(join(ROOT, ".shots/mock-cards.jpg"));

console.log("panel order:");
panels.forEach((p, i) => console.log(` ${i + 1}. ${p.label}`));
