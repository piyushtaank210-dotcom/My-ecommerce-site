/**
 * Opens the live site in a browser, the way a visitor sees it, and reports
 * what the hero is actually showing.
 *
 *   node scripts/check-live-site.mjs [url] [width]
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.argv[2] ?? "https://www.consoleseller.in/";
const WIDTH = Number(process.argv[3] ?? 1280);
const PORT = 9255;

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), `consoleseller-live-${PORT}`),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: 900,
    deviceScaleFactor: 1,
    mobile: WIDTH < 768,
  });

  await cdp.goto(URL_);
  await sleep(4000);

  const state = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const video = section?.querySelector('video');
    const slides = section?.querySelectorAll('[aria-roledescription=slide]').length ?? 0;
    const dots = section?.querySelectorAll('[role=tab]').length ?? 0;
    return {
      hasSection: Boolean(section),
      hasVideo: Boolean(video),
      videoSrc: video?.getAttribute('src') ?? null,
      videoPlaying: video ? !video.paused : null,
      videoSize: video ? video.videoWidth + 'x' + video.videoHeight : null,
      slides,
      dots,
      title: document.title,
      description: document.querySelector('meta[name=description]')?.content ?? null,
    };
  })()`);

  console.log(`${URL_} at ${WIDTH}px\n`);
  console.log("  hero present   :", state.hasSection ? "yes" : "NO");
  console.log("  hero slides    :", state.slides);
  console.log("  video element  :", state.hasVideo ? "yes" : "NO");
  if (state.hasVideo) {
    console.log("    src          :", state.videoSrc);
    console.log("    size         :", state.videoSize);
    console.log("    playing      :", state.videoPlaying);
  }
  console.log("  title          :", state.title);
  console.log("  description    :", state.description);
} finally {
  chrome.kill();
}
