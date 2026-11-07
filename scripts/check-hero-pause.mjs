/**
 * Checks that the film plays while its slide is on screen and stops when
 * the carousel moves on.
 *
 *   node scripts/check-hero-pause.mjs
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9252;

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-heropause-chrome"),
  dir: join(ROOT, ".shots"),
});

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.goto(`${BASE}/`);
  await sleep(3000);

  const read = `(() => {
    const v = document.querySelector('section[aria-roledescription=carousel] video');
    if (!v) return { none: true };
    return { paused: v.paused, t: Number(v.currentTime.toFixed(2)) };
  })()`;

  const first = await cdp.evaluate(read);
  console.log(`1. on the first slide      : paused=${first.paused} t=${first.t}s`);
  console.log(`   ${first.paused === false ? "✓ the film is playing" : "✗ the film is not playing"}`);

  // Move to the next slide.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(2000);
  const second = await cdp.evaluate(read);
  console.log(`\n2. on the second slide     : paused=${second.paused} t=${second.t}s`);
  console.log(`   ${second.paused === true ? "✓ the film stopped" : "✗ the film is still playing"}`);

  // And back again.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Previous slide"]')?.click()`
  );
  await sleep(2000);
  const third = await cdp.evaluate(read);
  console.log(`\n3. back on the first slide : paused=${third.paused} t=${third.t}s`);
  console.log(`   ${third.paused === false ? "✓ the film plays again" : "✗ the film did not resume"}`);

  // The hero carries a second film. It has to take over when its slide
  // comes up, and the first film has to stop while it is on screen.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(1000);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(2500);

  const fourth = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const videos = [...section.querySelectorAll('video')];
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    return {
      slide: slide?.getAttribute('aria-label') ?? null,
      first: videos[0] ? { paused: videos[0].paused, t: Number(videos[0].currentTime.toFixed(2)) } : null,
      second: videos[1] ? { paused: videos[1].paused, t: Number(videos[1].currentTime.toFixed(2)) } : null,
    };
  })()`);
  console.log(`\n4. on the second film's slide: slide ${fourth.slide}`);
  console.log(`   first film  : paused=${fourth.first?.paused} t=${fourth.first?.t}s`);
  console.log(`   second film : paused=${fourth.second?.paused} t=${fourth.second?.t}s`);
  console.log(
    `   ${fourth.second?.paused === false ? "✓ the second film is playing" : "✗ the second film is not playing"}`
  );
  console.log(
    `   ${fourth.first?.paused === true ? "✓ the first film stopped" : "✗ the first film is still playing"}`
  );
} finally {
  chrome.kill();
}
