/**
 * Renders one product image at the real card cell size in each candidate
 * fit, so the crop can be judged before it is written as markup.
 *
 *   node mock-fit.mjs
 */
import sharp from "sharp";
import { join } from "node:path";

const ROOT = "C:/Users/ADMIN/Desktop/ecommerce";
const P = (f) => join(ROOT, "public/products", f);
const GREY = { r: 249, g: 249, b: 249 };

const CELL_W = 195;
const CELL_H = 160;

async function render(file, fit, position) {
  let img = sharp(P(file)).resize({
    width: CELL_W,
    height: CELL_H,
    fit,
    background: GREY,
    position: position ?? "centre",
  });
  if (fit === "contain") img = img.flatten({ background: GREY });
  return img.png().toBuffer();
}

const candidates = [
  ["ps5-pro.jpg", "cover", "centre"],
  ["ps5-pro.jpg", "cover", "top"],
  ["ps5-pro.jpg", "cover", "north"],
  ["ps5-pro.jpg", "contain", "centre"],
  ["ps5-slim.jpg", "contain", "centre"],
  ["ps5-slim.jpg", "cover", "centre"],
  ["dualsense-white.jpg", "cover", "centre"],
  ["charging-station.jpg", "cover", "centre"],
  ["charging-station.jpg", "cover", "top"],
  ["ps4-slim.png", "contain", "centre"],
];

const GAP = 10;
const width = candidates.length * (CELL_W + GAP);
const comps = [];
for (let i = 0; i < candidates.length; i++) {
  const [file, fit, pos] = candidates[i];
  comps.push({
    input: await render(file, fit, pos),
    left: i * (CELL_W + GAP),
    top: 0,
  });
}

await sharp({
  create: { width, height: CELL_H, channels: 3, background: "#ffffff" },
})
  .composite(comps)
  .jpeg({ quality: 90 })
  .toFile(join(ROOT, ".shots/mock-fit.jpg"));

candidates.forEach((c, i) => console.log(`${i + 1}. ${c.join(" / ")}`));
