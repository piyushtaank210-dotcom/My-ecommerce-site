/**
 * Checks that the hero shows the right film on the right screen.
 *
 * A wide screen plays the film cut for a wide screen. A phone plays the
 * film cut for a phone, and never downloads the wide one; a wide screen
 * never downloads the phone's. Each film is a different file, cut to the
 * shape of the screen it is shown in, so neither is fetched where it
 * does not belong.
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

/**
 * The screens the hero is looked at on, and which shape of film each one
 * is meant to show.
 */
const SIZES = [
  { name: "phone   375x812", w: 375, h: 812, narrow: true },
  { name: "phone   320x700", w: 320, h: 700, narrow: true },
  { name: "tablet  768x1024", w: 768, h: 1024, narrow: false },
  { name: "laptop 1280x800", w: 1280, h: 800, narrow: false },
  { name: "desktop 1920x1080", w: 1920, h: 1080, narrow: false },
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
      const section = document.querySelector('section[aria-roledescription=carousel]');
      const videos = [...section.querySelectorAll('video')];
      // The film that is painted on this screen. The other one is not
      // shown at all, and so has no size.
      const v = videos.find((x) => {
        const r = x.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) ?? null;
      // The picture that is painted. Where a film plays, the picture
      // beneath it is not painted, so there is none.
      const img = [...section.querySelectorAll('img')].find((x) => {
        const r = x.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) ?? null;
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
        narrowFilm: v ? v.className.includes('hero-film-narrow') : null,
        picture: img ? img.getAttribute('src') : null,
        poster: v ? v.getAttribute('poster') : null,
      };
    })()`);

    // The film on screen is the one cut for this shape of screen, and
    // the picture of the other shape is the one that was not fetched.
    const filmIsRightShape = state.narrowFilm === size.narrow;
    // The film meant for the other shape of screen was never fetched.
    const otherFetched = size.narrow
      ? requested.some((u) => u.includes("hero-console-web") || u.includes("hero-controller-web"))
      : requested.some((u) => u.includes("hero-mobile-showcase"));

    console.log(`— ${size.name} —`);
    console.log(`   film in the page : ${state.hasVideo ? "yes" : "no"}` +
      (state.videoSize ? ` (${state.videoSize})` : ""));
    console.log(`   film playing     : ${state.playing === null ? "n/a" : state.playing ? `yes (t=${state.currentTime}s)` : "no"}`);
    console.log(`   film over photo  : ${state.filmAbovePhoto === null ? "n/a" : state.filmAbovePhoto ? "yes" : "no"}`);
    console.log(`   picture shown    : ${state.imageVisible ? "yes" : "no"}` +
      (state.picture ? ` (${state.picture})` : ""));
    console.log(`   films downloaded : ${requested.length}`);
    check(filmIsRightShape, size.narrow
      ? "the film on screen is the one cut for a phone"
      : "the film on screen is the one cut for a wide screen");
    check(state.playing === true, "the film is playing");
    check(state.filmAbovePhoto === true, "the film is above the picture");
    check(!otherFetched, size.narrow
      ? "the wide screen's film was never downloaded"
      : "the phone's film was never downloaded");
    console.log("");
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
    const section = document.querySelector('section[aria-roledescription=carousel]');
    // The layer that holds the pictures and the films, one child per slide.
    const layers = [...section.querySelectorAll(':scope > div')];
    const pictureLayer = layers.find((d) => d.classList.contains('grid'));
    const slideDivs = [...pictureLayer.children];
    const firstSlide = slideDivs[0];
    const v = firstSlide.querySelector('video');
    // The picture of this slide. It is a <picture> element, and it is
    // the <picture> that the CSS hides where the film plays — so it is
    // the <picture> that is measured.
    const picture = firstSlide.querySelector('picture');
    const img = picture?.querySelector('img');
    const pr = picture?.getBoundingClientRect();
    return {
      poster: v?.getAttribute('poster') ?? null,
      still: img?.getAttribute('src') ?? null,
      // A picture that is not painted has no size.
      stillShown: pr ? pr.width > 0 && pr.height > 0 : null,
      playing: v ? !v.paused : null,
      t: v ? Number(v.currentTime.toFixed(2)) : null,
      background: v ? getComputedStyle(v).backgroundColor : null,
    };
  })()`);
  console.log(`   film playing     : ${opening.playing ? "yes" : "no"} (t=${opening.t}s)`);
  console.log(`   poster           : ${opening.poster}`);
  console.log(`   the slide's still: ${opening.still}`);
  console.log(`   film background  : ${opening.background}`);
  check(opening.playing === true, "the film is already running when the hero opens");
  check(
    Boolean(opening.poster) && /-poster\.jpg$/.test(opening.poster),
    "the poster is the film's own first frame, not a separate picture"
  );
  // Where the film plays, the still under it is not painted at all, so
  // the two can never be seen swapping over one another.
  check(
    opening.stillShown === false,
    "the still under the film is not painted where the film plays"
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
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const v = [...section.querySelectorAll('video')].find((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null;
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      state: s.animationPlayState,
      duration: s.animationDuration,
      film: v ? v.duration : null,
    };
  })()`);
  console.log(
    `   progress bar     : ${bar?.state} over ${bar?.duration}` +
      (bar?.film ? ` (film is ${bar.film.toFixed(2)}s)` : "")
  );
  check(
    bar !== null &&
      bar.film > 0 &&
      Math.abs(parseFloat(bar.duration) - bar.film) < 0.5,
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
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const v = [...section.querySelectorAll('video')].find((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null;
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
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const v = [...section.querySelectorAll('video')].find((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (v) v.currentTime = Math.max(0, v.duration - 0.15);
    return true;
  })()`);
  await sleep(4000);

  const handover = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    const v = [...section.querySelectorAll('video')].find((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return {
      slide: slide?.getAttribute('aria-label') ?? null,
      ended: v ? v.ended : null,
    };
  })()`);
  console.log(`   after the end    : slide ${handover.slide}`);
  check(handover.ended === true, "the film ran to its end");
  check(handover.slide === "2 of 5", "the next picture came up on its own");

  // The cursor is still over the hero, and the picture it handed over to
  // has to carry on by itself. A carousel that stops when the pointer
  // arrives never gets past this slide: the shopper is watching the
  // film with their cursor right there.
  await sleep(7000);
  const carriedOn = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const slide = [...section.querySelectorAll('[aria-roledescription=slide]')]
      .find((s) => s.getAttribute('aria-hidden') !== 'true');
    return slide?.getAttribute('aria-label') ?? null;
  })()`);
  console.log(`   with the cursor still there: slide ${carriedOn}`);
  check(
    carriedOn !== handover.slide,
    "the carousel keeps moving with the cursor on the hero"
  );

  /* --------------------------------------------------------- the two films */

  console.log("\n— the second film —");

  // The hero carries more than one film. The second one has to be a
  // film of its own: it plays on its own slide, and the first film is
  // still while it is on screen.
  //
  // The page is loaded again with the network watched, so the films
  // that were fetched up front can be counted: a film that is only
  // fetched when its slide arrives has to wait, and a visitor sees that
  // as the hero stuttering.
  const fetched = [];
  cdp.on?.("Network.requestWillBeSent", (p) => {
    if (p.request?.url?.includes(".mp4")) fetched.push(p.request.url);
  });
  await cdp.goto(`${BASE}/`);
  await sleep(2500);
  console.log(`   films fetched     : ${fetched.length}`);
  check(
    fetched.length >= 2,
    "both films are fetched up front, so neither buffers when its slide arrives"
  );

  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(900);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(2500);

  const second = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const layers = [...section.querySelectorAll(':scope > div')];
    const pictureLayer = layers.find((d) => d.classList.contains('grid'));
    const slideDivs = [...pictureLayer.children];
    const videos = [...section.querySelectorAll('video')];
    const slide = section.querySelector('[aria-roledescription=slide]:not([aria-hidden="true"])');
    // The wide film on the first slide, and the wide film on the third.
    const firstFilm = slideDivs[0]?.querySelector('video.hero-film') ?? null;
    const secondFilm = slideDivs[2]?.querySelector('video.hero-film') ?? null;
    return {
      slide: slide?.getAttribute('aria-label') ?? null,
      count: videos.length,
      firstPlaying: firstFilm ? !firstFilm.paused : null,
      secondPlaying: secondFilm ? !secondFilm.paused : null,
      posters: videos.map((v) => v.getAttribute('poster')),
      sources: videos.map((v) => v.querySelector('source')?.getAttribute('src')),
    };
  })()`);
  console.log(`   slide            : ${second.slide}`);
  console.log(`   films on the page: ${second.count}`);
  console.log(`   the first film   : ${second.firstPlaying ? "playing" : "still"}`);
  console.log(`   the second film  : ${second.secondPlaying ? "playing" : "still"}`);
  console.log(`   posters          : ${JSON.stringify(second.posters)}`);
  // The first slide carries a film for each shape of screen, and the
  // third slide carries one for a wide screen: three films in the page.
  check(second.count === 3, "the hero carries the first film's two cuts and a second wide film");
  check(second.slide === "3 of 5", "the carousel reached the second film");
  check(
    second.secondPlaying === true,
    "the second film is playing on its own slide"
  );
  check(
    second.firstPlaying === false,
    "the first film is still while the second one is on screen"
  );
  check(
    Boolean(second.posters[2]) && second.posters[2] !== "/hero/hero-neon.jpg",
    "the second film's poster is its own first frame, not the photograph"
  );
  check(
    second.sources[0] !== second.sources[2],
    "the two wide films are two different films"
  );

  /* ------------------------------------------------------- the film is away */

  console.log("\n— the film is away —");

  // A film that is not on screen is not playing. The slides are stacked
  // on top of one another, so a film that is off screen has to be
  // holding its frame rather than playing underneath the next one.
  await cdp.goto(`${BASE}/`);
  await sleep(1200);
  await cdp.evaluate(
    `document.querySelector('[aria-label="Next slide"]')?.click()`
  );
  await sleep(1500);
  const away = await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-roledescription=carousel]');
    const videos = [...section.querySelectorAll('video')];
    return {
      playing: videos.map((v) => !v.paused),
      currentTime: videos.map((v) => Number(v.currentTime.toFixed(2))),
    };
  })()`);
  console.log(`   playing          : ${JSON.stringify(away.playing)}`);
  console.log(`   at               : ${JSON.stringify(away.currentTime)}`);
  check(
    away.playing[0] === false,
    "the first film stops when the carousel moves on"
  );
} catch (err) {
  failures++;
  console.error(`✗ the check could not finish: ${err.message}`);
} finally {
  chrome.kill();
}

console.log(
  failures === 0
    ? "\n✓ the hero shows the right film on every screen"
    : `\n✗ ${failures} check(s) failed`
);
process.exit(failures === 0 ? 0 : 1);
