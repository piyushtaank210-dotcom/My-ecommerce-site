/**
 * Checks that the film plays while its slide is on screen and stops when
 * the carousel moves on.
 *
 * The waits here are short and the film is read as it is, rather than a
 * fixed number of seconds being assumed. A film decides how long its own
 * slide lasts, so a test that waits longer than the film runs would see
 * the film end and the carousel move on, and then think the film had
 * never played.
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

/** Reads the slide on screen and every film in the hero. */
const read = `(() => {
  const section = document.querySelector('section[aria-roledescription=carousel]');
  const videos = [...section.querySelectorAll('video')];
  const slide = [...section.querySelectorAll('[aria-roledescription=slide]')]
    .find((s) => s.getAttribute('aria-hidden') !== 'true');
  // The films are filed by the slide they are on, so that a slide
  // carrying a film for a wide screen and one for a phone can be told
  // apart. The wide screen is the one being looked at here.
  const layers = [...section.querySelectorAll(':scope > div')];
  const pictureLayer = layers.find((d) => d.classList.contains('grid'));
  const slideDivs = [...pictureLayer.children];
  const filmOn = (n) => {
    const v = slideDivs[n]?.querySelector('video.hero-film');
    return v
      ? { paused: v.paused, t: Number(v.currentTime.toFixed(2)), duration: Number((v.duration || 0).toFixed(2)) }
      : null;
  };
  return {
    slide: slide?.getAttribute('aria-label') ?? null,
    films: videos.map((v) => ({
      paused: v.paused,
      t: Number(v.currentTime.toFixed(2)),
      duration: Number(v.duration.toFixed(2)),
    })),
    first: filmOn(0),
    second: filmOn(2),
  };
})()`;

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}`);
};

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.goto(`${BASE}/`);
  await sleep(1500);

  const first = await cdp.evaluate(read);
  console.log(`1. on the first slide      : ${first.slide} paused=${first.first?.paused} t=${first.first?.t}s`);
  check(first.first?.paused === false, "the film is playing");
  check((first.first?.t ?? 0) > 0, "the film is under way, not sitting on frame 0");

  // Move to the next slide.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(800);
  const second = await cdp.evaluate(read);
  console.log(`\n2. on the second slide     : ${second.slide} paused=${second.first?.paused} t=${second.first?.t}s`);
  check(second.first?.paused === true, "the film stopped");

  // And back again.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Previous slide"]')?.click()`
  );
  await sleep(800);
  const third = await cdp.evaluate(read);
  console.log(`\n3. back on the first slide : ${third.slide} paused=${third.first?.paused} t=${third.first?.t}s`);
  check(third.first?.paused === false, "the film plays again");
  check(
    (third.first?.t ?? 0) > (second.first?.t ?? 0),
    "the film picked up where it left off rather than starting again"
  );

  // The hero carries a second film. It has to take over when its slide
  // comes up, and the first film has to stop while it is on screen.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(700);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(1500);

  const fourth = await cdp.evaluate(read);
  console.log(`\n4. on the second film's slide: ${fourth.slide}`);
  console.log(`   first film  : paused=${fourth.first?.paused} t=${fourth.first?.t}s`);
  console.log(`   second film : paused=${fourth.second?.paused} t=${fourth.second?.t}s`);
  check(fourth.second?.paused === false, "the second film is playing");
  check(fourth.first?.paused === true, "the first film stopped");
  check((fourth.second?.t ?? 0) > 0, "the second film is under way");

  // Run the second film to its end and see whether the slide moves on by
  // itself — a film that has finished hands over to the next picture.
  await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const layers = [...section.querySelectorAll(':scope > div')];
    const pictureLayer = layers.find((d) => d.classList.contains('grid'));
    const v = [...pictureLayer.children][2]?.querySelector('video.hero-film');
    if (v) v.currentTime = Math.max(0, v.duration - 0.2);
    return true;
  })()`);
  await sleep(2500);

  const fifth = await cdp.evaluate(read);
  console.log(`\n5. after the second film ends: ${fifth.slide}`);
  check(fifth.slide !== fourth.slide, "the hero moved on by itself when the film ended");
  check(fifth.second?.paused === true, "the finished film stopped");
} finally {
  chrome.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : "\n✓ every check passed");
if (failures) process.exitCode = 1;
