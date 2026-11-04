/**
 * Captures the hero at a given device pixel ratio, and crops the
 * photograph's busiest part so the sharpness can be judged.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const dpr = Number(process.argv[2] ?? 2);
const name = process.argv[3] ?? `hero-dpr${dpr}`;

const { chrome, cdp } = await launchChrome({
  port: 9338,
  profile: join(tmpdir(), "playforge-hero-chrome"),
  dir: join(ROOT, ".shots"),
});

await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: dpr,
  mobile: false,
});

await cdp.goto(BASE);
await new Promise((r) => setTimeout(r, 2500));

const { data } = await cdp.send("Page.captureScreenshot", {
  format: "png",
  clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 },
});
writeFileSync(join(ROOT, ".shots", `${name}.png`), Buffer.from(data, "base64"));
console.log(`.shots/${name}.png (device pixel ratio ${dpr})`);

chrome.kill();
