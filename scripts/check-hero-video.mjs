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

/** Records one thing that has to be true, and says so either way. */
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`   ${ok ? "✓" : "✗"} ${label}`);
};

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

  /* ------------------------------------------------------ the film's life */

  console.log("— the hero opens on the film, and the film hands over —");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.goto(`${BASE}/`);
  await sleep(1500);

  const opening = await cdp.evaluate(`(() => {
    const v = document.querySelector('section[aria-roledescription=carousel] video');
    return {
      poster: v?.getAttribute('poster') ?? null,
      playing: v ? !v.paused : null,
      t: v ? Number(v.currentTime.toFixed(2)) : null,
      background: v ? getComputedStyle(v).backgroundColor : null,
    };
  })()`);
  console.log(`   film playing     : ${opening.playing ? "yes" : "no"} (t=${opening.t}s)`);
  console.log(`   poster           : ${opening.poster}`);
  console.log(`   film background  : ${opening.background}`);
  check(opening.playing === true, "the film is already running when the hero opens");
  check(
    Boolean(opening.poster) && opening.poster !== "/hero/hero-showcase.jpg",
    "the poster is the film's own first frame, not the photograph"
  );
  // A film is see-through until it has a poster or a frame, and the
  // photograph underneath arrives after the first paint. Without a
  // background of its own the hero would flash the photograph on the way
  // to the film.
  check(
    Boolean(opening.background) && !/rgba\(.*,\s*0\)/.test(opening.background),
    "the film covers the photograph while it is still loading",
    opening.background ?? "none"
  );

  // The bar fills over the length of the film, not over the usual slide
  // interval, so the two stay together.
  const bar = await cdp.evaluate(`(() => {
    const el = document.querySelector('.hero-progress');
    if (!el) return null;
    const s = getComputedStyle(el);
    return { state: s.animationPlayState, duration: s.animationDuration };
  })()`);
  console.log(`   progress bar     : ${bar?.state} over ${bar?.duration}`);
  check(
    bar !== null && parseFloat(bar.duration) > 8,
    "the progress bar fills over the length of the film",
    bar?.duration ?? "none"
  );

  // A cursor moving across the hero must not stop the film. It is the
  // picture on the slide, not something the shopper has to hold still for.
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 640,
    y: 300,
    button: "none",
  });
  await sleep(2000);
  const hovering = await cdp.evaluate(`(() => {
    const v = document.querySelector('section[aria-roledescription=carousel] video');
    const el = document.querySelector('.hero-progress');
    return {
      paused: v?.paused ?? null,
      t: v ? Number(v.currentTime.toFixed(2)) : null,
      bar: el ? getComputedStyle(el).animationPlayState : null,
    };
  })()`);
  console.log(`   under the cursor : t=${hovering.t}s paused=${hovering.paused} bar=${hovering.bar}`);
  check(hovering.paused === false, "the film keeps playing with the cursor on the hero");
  check(hovering.bar === "running", "the progress bar keeps filling too");

  // Run the film to its end and see whether the next picture comes up.
  await cdp.evaluate(`(() => {
    const v = document.querySelector('section[aria-roledescription=carousel] video');
    v.currentTime = Math.max(0, v.duration - 0.15);
    return true;
  })()`);
  await sleep(4000);

  const handover = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    return {
      slide: slide?.getAttribute('aria-label') ?? null,
      ended: section.querySelector('video')?.ended ?? null,
    };
  })()`);
  console.log(`   after the end    : slide ${handover.slide}`);
  check(handover.ended === true, "the film ran to its end");
  check(handover.slide === "2 of 5", "the next picture came up on its own");

  /* --------------------------------------------------------- the two films */

  console.log("\n— the second film —");

  // The hero carries more than one film. The second one has to be a
  // film of its own: it plays on its own slide, and the first film is
  // still while it is on screen.
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(2500);

  const second = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const videos = [...section.querySelectorAll('video')];
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    return {
      slide: slide?.getAttribute('aria-label') ?? null,
      count: videos.length,
      playing: videos.map((v) => !v.paused),
      posters: videos.map((v) => v.getAttribute('poster')),
      sources: videos.map((v) => v.querySelector('source')?.getAttribute('src')),
    };
  })()`);
  console.log(`   slide            : ${second.slide}`);
  console.log(`   films on the page: ${second.count}`);
  console.log(`   playing          : ${JSON.stringify(second.playing)}`);
  console.log(`   posters          : ${JSON.stringify(second.posters)}`);
  check(second.count === 2, "the hero carries two films");
  check(second.slide === "3 of 5", "the carousel reached the second film");
  check(
    second.playing[1] === true,
    "the second film is playing on its own slide"
  );
  check(
    second.playing[0] === false,
    "the first film is still while the second one is on screen"
  );
  check(
    Boolean(second.posters[1]) && second.posters[1] !== "/hero/hero-neon.jpg",
    "the second film's poster is its own first frame, not the photograph"
  );
  check(
    second.sources[0] !== second.sources[1],
    "the two films are two different films"
  );

  /* ------------------------------------------------------- the film is away */

  console.log("\n— the film cannot be downloaded —");

  // The browser says so quietly: play() stays pending rather than
  // rejecting, so the photograph has to notice for itself.
  cdp.on?.("Fetch.requestPaused", async (p) => {
    if (!p.request?.url?.includes(".mp4")) {
      await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
      return;
    }
    await cdp.send("Fetch.failRequest", {
      requestId: p.requestId,
      errorReason: "Failed",
    });
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*.mp4*" }] });

  await cdp.goto(`${BASE}/`);
  await sleep(2500);

  const broken = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const v = section.querySelector('video');
    const img = section.querySelector('img');
    return {
      filmOpacity: getComputedStyle(v).opacity,
      photoOpacity: getComputedStyle(img).opacity,
    };
  })()`);
  console.log(`   film opacity     : ${broken.filmOpacity}`);
  console.log(`   photo opacity   : ${broken.photoOpacity}`);
  check(broken.filmOpacity === "0", "the film is out of the way");
  check(broken.photoOpacity === "1", "the photograph carries the slide");

  await sleep(5000);
  const moved = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    return slide?.getAttribute('aria-label') ?? null;
  })()`);
  console.log(`   after a while    : slide ${moved}`);
  check(moved === "2 of 5", "the carousel keeps moving without the film");

  await cdp.send("Fetch.disable");

  /* -------------------------------------------------- less movement asked */

  console.log("\n— a reader who has asked for less movement —");
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const reducedRequests = [];
  cdp.on?.("Network.requestWillBeSent", (p) => {
    if (p.request?.url?.includes(".mp4")) reducedRequests.push(p.request.url);
  });
  await cdp.goto(`${BASE}/`);
  await sleep(2500);

  const reduced = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const v = section.querySelector('video');
    const r = v?.getBoundingClientRect();
    const img = section.querySelector('img')?.getBoundingClientRect();
    return {
      filmShown: r ? r.width > 0 && r.height > 0 : false,
      photoShown: img ? img.width > 0 && img.height > 0 : false,
    };
  })()`);
  console.log(`   film shown       : ${reduced.filmShown ? "yes" : "no"}`);
  console.log(`   photograph shown : ${reduced.photoShown ? "yes" : "no"}`);
  console.log(`   film downloaded  : ${reducedRequests.length ? "yes" : "no"}`);
  check(reduced.filmShown === false, "the film is not shown where movement is unwelcome");
  check(reduced.photoShown === true, "the photograph carries the slide instead");
  check(reducedRequests.length === 0, "the film was never downloaded");

  console.log(failures ? `${failures} check(s) failed` : "✓ every check passed");
  if (failures) process.exitCode = 1;
} finally {
  chrome.kill();
}
