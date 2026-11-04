/**
 * Lists the images the hero actually asks for, and how big the files on
 * disk are.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const { chrome, cdp } = await launchChrome({
  port: 9339,
  profile: join(tmpdir(), "playforge-hero-net-chrome"),
  dir: join(ROOT, ".shots"),
});

const asked = [];
cdp.on("Network.responseReceived", (p) => {
  const url = p.response.url;
  if (!/\.(jpg|jpeg|png|webp)|_next\/image/.test(url)) return;
  asked.push({
    status: p.response.status,
    type: p.response.mimeType,
    bytes: p.response.encodedDataLength,
    url: url.replace(BASE, ""),
  });
});

await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});
await cdp.goto(BASE);
await new Promise((r) => setTimeout(r, 3000));

for (const r of asked) {
  const w = /[?&]w=(\d+)/.exec(r.url)?.[1];
  const q = /[?&]q=(\d+)/.exec(r.url)?.[1];
  console.log(
    `${r.status} ${r.type}  ${Math.round((r.bytes || 0) / 1024)}KB` +
      (w ? `  w=${w}` : "") +
      (q ? ` q=${q}` : "") +
      `  ${r.url.slice(0, 120)}`
  );
}

chrome.kill();
