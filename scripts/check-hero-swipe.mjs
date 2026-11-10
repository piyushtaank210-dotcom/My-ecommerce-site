/**
 * Checks that a swipe across the hero moves it on — the gesture a thumb
 * makes on a phone.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PORT = 9263;

const { chrome, cdp } = await launchChrome({
  port: PORT,
  profile: join(tmpdir(), "consoleseller-heroswipe-chrome"),
  dir: join(ROOT, ".shots"),
});

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}`);
};

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.goto(`${BASE}/`);
  await sleep(2500);

  const before = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    return [...section.querySelectorAll('[aria-roledescription=slide]')]
      .find((s) => s.getAttribute('aria-hidden') !== 'true')
      ?.getAttribute('aria-label') ?? null;
  })()`);
  console.log(`   before the swipe: slide ${before}`);

  // A thumb drags across the hero: down, then across, then up.
  const touch = async (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });

  await touch("touchStart", 300, 300);
  await sleep(60);
  await touch("touchMove", 200, 300);
  await sleep(60);
  await touch("touchMove", 100, 300);
  await sleep(60);
  await touch("touchEnd", 100, 300);
  await sleep(1200);

  const after = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    return [...section.querySelectorAll('[aria-roledescription=slide]')]
      .find((s) => s.getAttribute('aria-hidden') !== 'true')
      ?.getAttribute('aria-label') ?? null;
  })()`);
  console.log(`   after the swipe : slide ${after}`);
  check(after !== before, "a swipe across the hero moves it on");

  // And the other way.
  await touch("touchStart", 100, 300);
  await sleep(60);
  await touch("touchMove", 200, 300);
  await sleep(60);
  await touch("touchMove", 300, 300);
  await sleep(60);
  await touch("touchEnd", 300, 300);
  await sleep(1200);

  const back = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    return [...section.querySelectorAll('[aria-roledescription=slide]')]
      .find((s) => s.getAttribute('aria-hidden') !== 'true')
      ?.getAttribute('aria-label') ?? null;
  })()`);
  console.log(`   after the swipe back: slide ${back}`);
  check(back !== after, "a swipe the other way moves it back");
} catch (err) {
  failures++;
  console.error(`   ✗ the check could not finish: ${err.message}`);
} finally {
  chrome.kill();
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : "\n✓ the hero swipes");
process.exit(failures ? 1 : 0);
