/**
 * Checks that the hero shows the film on a laptop and a tablet, and the
 * photograph on a phone — and that a phone never downloads the film.
 *
 *   node scripts/check-hero-video.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9251;

const SIZES = [
  { name: "phone   375x812", w: 375, h: 812, wantVideo: false },
  { name: "phone   320x700", w: 320, h: 700, wantVideo: false },
  { name: "tablet  768x1024", w: 768, h: 1024, wantVideo: true },
  { name: "laptop 1280x800", w: 1280, h: 800, wantVideo: true },
  { name: "desktop 1920x1080", w: 1920, h: 1080, wantVideo: true },
];

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-herovideo-chrome"),
  dir: join(ROOT, ".shots"),
});

let failures = 0;

try {
  for (const size of SIZES) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: size.w,
      height: size.h,
      deviceScaleFactor: 1,
      mobile: size.w < 768,
    });

    await cdp.send("Network.enable");
    const requested = [];
    cdp.on?.("Network.requestWillBeSent", (p) => {
      if (p.request?.url?.includes(".mp4")) requested.push(p.request.url);
    });

    await cdp.goto(`${BASE}/`);
    await sleep(3000);

    const state = await cdp.evaluate(`(() => {
      const v = document.querySelector('section[aria-roledescription=carousel] video');
      const img = document.querySelector('section[aria-roledescription=carousel] img');
      const vr = v?.getBoundingClientRect();
      const ir = img?.getBoundingClientRect();
      // The copy and the scrim sit over the film on purpose, so the question
      // is not "what is on top" but "is the film above the photograph".
      let filmAbovePhoto = null;
      if (v && vr) {
        const stack = document.elementsFromPoint(vr.left + vr.width / 2, vr.top + vr.height / 2);
        const vi = stack.indexOf(v);
        const ii = img ? stack.indexOf(img) : -1;
        filmAbovePhoto = vi !== -1 && (ii === -1 || vi < ii);
      }
      return {
        hasVideo: Boolean(v),
        videoSize: v ? v.videoWidth + 'x' + v.videoHeight : null,
        playing: v ? !v.paused : null,
        currentTime: v ? Number(v.currentTime.toFixed(2)) : null,
        videoVisible: vr ? vr.width > 0 && vr.height > 0 : false,
        imageVisible: ir ? ir.width > 0 && ir.height > 0 : false,
        filmAbovePhoto,
      };
    })()`);

    const shown = state.hasVideo && state.videoVisible && state.filmAbovePhoto === true;
    const ok = shown === size.wantVideo;
    if (!ok) failures++;

    console.log(`— ${size.name} —`);
    console.log(`   film in the page : ${state.hasVideo ? "yes" : "no"}` +
      (state.videoSize ? ` (${state.videoSize})` : ""));
    console.log(`   film playing     : ${state.playing === null ? "n/a" : state.playing ? `yes (t=${state.currentTime}s)` : "no"}`);
    console.log(`   film over photo  : ${state.filmAbovePhoto === null ? "n/a" : state.filmAbovePhoto ? "yes" : "no"}`);
    console.log(`   photograph shown : ${state.imageVisible ? "yes" : "no"}`);
    console.log(`   film downloaded  : ${requested.length ? "yes" : "no"}`);
    console.log(
      `   ${ok ? "✓ as expected" : "✗ WRONG"} — wanted the ${size.wantVideo ? "film" : "photograph"}\n`
    );
  }
  console.log(failures ? `${failures} size(s) behaved wrongly` : "✓ every size behaves as asked");
  if (failures) process.exitCode = 1;
} finally {
  chrome.kill();
}
