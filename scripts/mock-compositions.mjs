/**
 * Renders candidate category-card image areas at the real size (648 x 440)
 * so the composition can be judged before it is written as markup.
 *
 *   node mock-compositions.mjs
 */
import sharp from "sharp";
import { join } from "node:path";

const ROOT = "C:/Users/ADMIN/Desktop/ecommerce";
const P = (f) => join(ROOT, "public/products", f);

const W = 648;
const H = 440;
const GAP = 10;
const WHITE = "#ffffff";
const FIELD = "#f6f8fb";

/** A rounded-corner mask in the size of a cell. */
function mask(w, h, r) {
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`
  );
}

/** One cell: the image, either floating on the field or as a photo tile. */
async function tile(file, w, h, { mode = "float", fit = "contain", radius = 16 }) {
  let img = sharp(P(file)).resize({
    width: w,
    height: h,
    fit,
    background: { r: 255, g: 255, b: 255 },
    position: "centre",
  });
  if (fit === "contain" && file.endsWith(".png")) {
    img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
  }
  const buf = await img.png().toBuffer();
  const masked = await sharp(buf)
    .composite([{ input: mask(w, h, radius), blend: "dest-in" }])
    .png()
    .toBuffer();
  return masked;
}

/** Two panels: a tall one on the left, two stacked on the right. */
async function split(left, right, w = W, h = H) {
  const leftW = Math.round(w * 0.56);
  const rightW = w - leftW - GAP;
  const rightH = Math.floor((h - GAP) / 2);
  const a = await tile(left.file, leftW, h, left);
  const b = await tile(right[0].file, rightW, rightH, right[0]);
  const c = await tile(right[1].file, rightW, h - rightH - GAP, right[1]);
  return sharp({
    create: { width: w, height: h, channels: 3, background: FIELD },
  })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: leftW + GAP, top: 0 },
      { input: c, left: leftW + GAP, top: rightH + GAP },
    ])
    .png()
    .toBuffer();
}

const candidates = [
  {
    label: "A consoles - photo hero left",
    buf: await split(
      { file: "ps5-pro.jpg", mode: "tile", fit: "cover" },
      [
        { file: "ps5-slim.jpg", mode: "float", fit: "contain" },
        { file: "ps4-slim.png", mode: "float", fit: "contain" },
      ]
    ),
  },
  {
    label: "B consoles - studio hero left",
    buf: await split(
      { file: "ps5-slim-angled.jpg", mode: "float", fit: "contain" },
      [
        { file: "ps5-pro.jpg", mode: "tile", fit: "cover" },
        { file: "ps4-slim.png", mode: "float", fit: "contain" },
      ]
    ),
  },
  {
    label: "C controllers - photo hero left",
    buf: await split(
      { file: "dualsense-white.jpg", mode: "tile", fit: "cover" },
      [
        { file: "dualsense-edge.png", mode: "float", fit: "contain" },
        { file: "charging-station.jpg", mode: "tile", fit: "cover" },
      ]
    ),
  },
  {
    label: "D controllers - cut-out hero left",
    buf: await split(
      { file: "dualsense-edge.png", mode: "float", fit: "contain" },
      [
        { file: "dualsense-white.jpg", mode: "tile", fit: "cover" },
        { file: "charging-station.jpg", mode: "tile", fit: "cover" },
      ]
    ),
  },
];

const sheet = [];
let y = 0;
for (const c of candidates) {
  sheet.push({ input: c.buf, left: 0, top: y });
  y += H + 14;
}
await sharp({
  create: { width: W, height: y, channels: 3, background: "#dddddd" },
})
  .composite(sheet)
  .jpeg({ quality: 88 })
  .toFile(join(ROOT, ".shots/mock-compositions.jpg"));

candidates.forEach((c, i) => console.log(`${i + 1}. ${c.label}`));
