"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/types";

/** How long a picture slide stays on screen before the carousel advances. */
const SLIDE_MS = 6000;

/** A drag of at least this many pixels counts as a swipe. */
const SWIPE_PX = 48;

/**
 * The width below which a phone's own picture and film are shown.
 *
 * It is the same boundary the CSS uses, to the hundredth of a pixel, so
 * that a browser at a fractional zoom lands on one side of it or the
 * other and never in the gap between the two.
 */
const PHONE_MAX = 767.98;

/** What a film has told us about itself. */
type FilmInfo = {
  /** How long the film runs, in seconds. */
  length: number;
  /** The browser would not play it, so the photograph carries the slide. */
  failed: boolean;
};

/**
 * The key a slide's film is filed under.
 *
 * A slide can carry two films — one cut for a wide screen and one cut
 * for a phone — and they are different films of different lengths, so
 * each is filed under its own key. What one of them told us says
 * nothing about the other.
 */
function filmKey(id: string, narrow: boolean): string {
  return narrow ? `${id}:narrow` : `${id}:wide`;
}

/**
 * Whether the screen in front of the shopper is a phone's.
 *
 * It is asked of the browser directly rather than read from the state,
 * so that a film which cannot play because it is meant for the other
 * shape of screen is not mistaken for one that cannot be played at all.
 */
function screenIsNarrow(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${PHONE_MAX}px)`).matches;
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  /**
   * Whether the screen in front of the shopper is a phone's.
   *
   * A phone shows its own picture and its own film, each cut to the shape
   * of a phone's screen; a tablet and a desktop show the wide ones.
   */
  const [narrow, setNarrow] = useState(false);
  /**
   * What each film has told us, by slide and by the shape it was cut
   * for. A slide with no film has no entry. The films are independent of
   * one another: one of them failing says nothing about the next, and
   * each decides the length of its own slide.
   */
  const [films, setFilms] = useState<Record<string, FilmInfo>>({});
  const swipeStart = useRef<number | null>(null);
  /** The film element on each slide, cut for a wide screen. */
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  /** The film element on each slide, cut for a phone. */
  const mobileVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  /**
   * Whether each film's end has already been dealt with. If a film ends
   * before the page has finished waking up, the event is never heard, and
   * this is how the slide knows it has to move on.
   */
  const endedSeen = useRef(new Set<string>());

  // A cursor over the hero never stops the carousel. A shopper watching
  // the film is sitting right there with the pointer over it, and a
  // carousel that stops when the pointer arrives never gets past its
  // second slide — the film hands over to a picture, and the picture
  // sits there for good.
  //
  // The keyboard does stop it, and only the keyboard. A shopper moving
  // through the slides with the keyboard needs the slide to hold still
  // while they are on it, and it is the one way to hold the carousel
  // still. A mouse user who clicked a dot has already said where they
  // want to be, and the hero must not hold them there.
  const paused = (focused && keyboard) || hidden;

  /**
   * Whether the shopper is on the keyboard.
   *
   * A key press anywhere says so, and a press of the pointer says the
   * opposite. Only the keys that move between things count — a shopper
   * who types into the search box has not asked the hero to hold still.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) setKeyboard(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const active = slides[index];
  /**
   * The shape of the screen in front of the shopper.
   *
   * A phone takes the picture and the film cut for a phone; a tablet and
   * a desktop take the wide ones.
   */
  const isNarrow = narrow;
  /** The film the slide on screen carries, for the shape of the screen. */
  const activeFilmSrc = isNarrow ? active?.mobile_video : active?.video;
  /** Whether the slide on screen carries a film here. */
  const onFilm = Boolean(activeFilmSrc);
  /** What the film on the slide on screen has told us. */
  const activeFilm = activeFilmSrc
    ? films[filmKey(active.id, isNarrow)]
    : undefined;
  const filmLength = activeFilm?.length ?? 0;
  const filmFailed = activeFilm?.failed ?? false;

  /**
   * The film on the slide the hero opens on, for the shape of the
   * screen. It is the one that is fetched and running from the very
   * first byte; the others are fetched when the carousel reaches them,
   * so a visitor who never gets there never pays for them.
   */
  const openingFilm = slides[0]?.video ? 0 : -1;
  const openingMobileFilm = slides[0]?.mobile_video ? 0 : -1;

  /**
   * How long the slide on screen lasts. A slide with a film lasts as long
   * as the film does; a picture slide lasts for the usual interval.
   */
  const slideMs =
    filmLength > 0 && !filmFailed ? filmLength * 1000 : SLIDE_MS;

  /**
   * The bar fills over exactly as long as the slide will last, so it is
   * paused by whatever is holding the slide back. On a slide with a film
   * that is the film itself, and the film does not stop for a cursor.
   */
  const barPaused = onFilm && !filmFailed ? hidden : paused;

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count]
  );

  /** Records what a film has told us, without churning the state. */
  const setFilm = useCallback((key: string, patch: Partial<FilmInfo>) => {
    setFilms((prev) => {
      const now = prev[key] ?? { length: 0, failed: false };
      const next = { ...now, ...patch };
      if (next.length === now.length && next.failed === now.failed) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  // Honour the OS "reduce motion" setting: no auto-advance, no animation.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Which shape of screen the shopper is looking at. A phone has its own
  // picture and its own film, each cut to the shape of a phone's screen;
  // a tablet and a desktop have the wide ones.
  useEffect(() => {
    const phone = window.matchMedia(`(max-width: ${PHONE_MAX}px)`);
    const update = () => setNarrow(phone.matches);
    update();
    phone.addEventListener("change", update);
    return () => phone.removeEventListener("change", update);
  }, []);

  // Advance on a timer. Depending on `index` restarts the countdown whenever
  // the slide changes, whether that was automatic or manual.
  //
  // A slide with a film is not timed at all while the film is playing: it
  // runs to its end and hands over to the next picture itself. The timer
  // takes over where the film is not playing — or where there is no film
  // for this shape of screen — so the carousel never sits on one slide.
  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    if (onFilm && !filmFailed) return;
    const id = window.setTimeout(() => setIndex((index + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [count, index, paused, reduced, onFilm, filmFailed]);

  // Don't burn through the slides while the tab is in the background.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Every film that is not on screen is still. The slides are stacked on
  // top of one another, so a film that is off screen has to be holding
  // its frame rather than playing underneath the next one.
  useEffect(() => {
    for (let i = 0; i < count; i++) {
      if (i === index) continue;
      videoRefs.current[i]?.pause();
      mobileVideoRefs.current[i]?.pause();
    }
  }, [index, count]);

  // The film on the slide on screen plays; it stops when it is not on
  // screen, and it never plays at all where motion is unwelcome. A
  // cursor moving across the hero does not stop it: the film is the
  // picture on the slide, not a thing the shopper has to hold still for.
  useEffect(() => {
    const slide = slides[index];
    if (!slide) return;

    // The film for the shape of the screen in front of the shopper, and
    // the element that plays it.
    const forPhone = narrow;
    const src = forPhone ? slide.mobile_video : slide.video;
    if (!src) return;
    const video = forPhone
      ? mobileVideoRefs.current[index]
      : videoRefs.current[index];
    if (!video) return;
    const key = filmKey(slide.id, forPhone);

    // The length of the film. The browser may have worked it out before
    // this page finished waking up, in which case the event that carries
    // it has already gone by — so it is read off the element as well.
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setFilm(key, { length: video.duration });
    }

    if (video.ended) {
      if (!endedSeen.current.has(key)) {
        // The film ran to its end while the page was still waking up and
        // nobody heard it. Move on to the next picture.
        endedSeen.current.add(key);
        setIndex((n) => (n + 1) % count);
        return;
      }
      // A film that has been watched to the end starts again from the top
      // when its slide comes round.
      try {
        video.currentTime = 0;
      } catch {
        /* the film has not loaded yet, and starts at the top anyway */
      }
    }

    if (!reduced && !hidden && !filmFailed) {
      video.play().catch((err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        // The browser would not start the film — it wants a gesture first,
        // or it cannot play the file. The photograph carries the slide
        // instead, and the carousel goes back to its usual timing.
        if (name === "NotAllowedError" || name === "NotSupportedError") {
          setFilm(key, { failed: true });
        }
      });
    } else {
      video.pause();
    }
  }, [index, narrow, reduced, hidden, filmFailed, count, slides, setFilm]);

  // A browser that cannot play the file says so quietly. play() stays
  // pending rather than rejecting, and the error arrives while the page
  // is still waking up, so it is never heard. The element's own state is
  // the only reliable witness, and it is watched while the film is on
  // screen: the moment the film is out of reach, the photograph takes
  // over and the carousel goes back to its usual timing.
  useEffect(() => {
    const slide = slides[index];
    if (!slide) return;
    const forPhone = narrow;
    const src = forPhone ? slide.mobile_video : slide.video;
    if (!src) return;
    const video = forPhone
      ? mobileVideoRefs.current[index]
      : videoRefs.current[index];
    if (!video || reduced) return;
    const key = filmKey(slide.id, forPhone);
    if (films[key]?.failed) return;
    const id = window.setInterval(() => {
      // 3 is NETWORK_NO_SOURCE: there is no film this browser can play.
      if (video.error || video.networkState === 3) {
        setFilm(key, { failed: true });
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [index, narrow, reduced, films, slides, setFilm]);

  function onPointerDown(e: React.PointerEvent) {
    // The pointer has the shopper's attention, so the keyboard is not
    // holding the carousel still.
    setKeyboard(false);
    swipeStart.current = e.clientX;
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
  }

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative isolate flex min-h-[36rem] touch-pan-y flex-col overflow-hidden bg-ink lg:h-[clamp(38rem,48vw,50rem)] lg:min-h-[38rem]"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
    >
      {/* The picture covers the whole section, edge to edge. The slide
          that is showing dissolves in while the one leaving softens and
          drifts back — a slow change of scene rather than a cut.

          A slide may also carry a film. A film is on the page from the
          start and is running when the hero opens; it plays to its end
          and then hands over to the next picture.

          A phone has its own picture and its own film, each cut to the
          shape of a phone's screen: a wide screen is a landscape frame
          and a phone is not, so a photograph or a film cut for one is
          cropped badly in the other. Each of them is only ever fetched
          on the screen it belongs to. */}
      <div className="absolute inset-0 grid select-none">
        {slides.map((s, i) => {
          // The picture, in one `<picture>` element.
          //
          // A `<picture>` is what stops the wide picture being downloaded
          // on a phone. Two `<img>` elements side by side would both be
          // fetched — the browser fetches a picture it cannot see, and
          // only the CSS decides which one is painted — so a phone would
          // carry half a megabyte of landscape photographs it never
          // shows. With a `<picture>`, the browser reads the media
          // query itself and fetches the one that fits the screen it is
          // on, before anything is painted.
          //
          // The picture is a still under the film where there is one, and
          // so is hidden by the CSS wherever its own film plays.
          const picture = (
            <picture
              /* No display utility here: the CSS rules that hide this
                 picture where its own film plays live in the components
                 layer, and a utility class would win over them. */
              className={`absolute inset-0 ${
                s.video ? "hero-still" : ""
              } ${s.mobile_video ? "hero-still-narrow" : ""}`}
            >
              {s.mobile_image && (
                <source
                  media={`(max-width: ${PHONE_MAX}px)`}
                  srcSet={s.mobile_image}
                  sizes="100vw"
                />
              )}
              <Image
                src={s.image}
                /* A phone's picture is a different photograph, so it is
                   described differently. The browser picks the picture;
                   the words follow it. */
                alt={isNarrow ? (s.mobile_alt ?? s.alt) : s.alt}
                fill
                loading="eager"
                fetchPriority="low"
                /* The photograph is served as it is. The optimiser would
                   re-encode it a second time — the files are already sized
                   for the job — and the browser scales it far better than a
                   second pass through a lossy encoder does. */
                unoptimized
                sizes="100vw"
                className={`object-cover transition-transform duration-[6000ms] ease-linear ${
                  i === index ? "scale-[1.06]" : "scale-100"
                }`}
                style={{
                  objectPosition: isNarrow
                    ? (s.mobile_position ?? "50% 50%")
                    : s.image_position,
                  // Where the film cannot be played at all, this picture
                  // is the picture — so it has to be shown even on the
                  // screen the film would have played on.
                  display:
                    (isNarrow
                      ? films[filmKey(s.id, true)]?.failed
                      : films[filmKey(s.id, false)]?.failed)
                      ? "block"
                      : undefined,
                }}
              />
            </picture>
          );

          return (
            <div
              key={s.id}
              className={`relative col-start-1 row-start-1 transition-[opacity,filter,transform] duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                i === index
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 blur-[8px] scale-[1.03]"
              }`}
            >
              {picture}

              {/* The wide screen's film. The film on the slide the hero
                  opens on is in the page from the very first byte, so it
                  is already running when the hero opens instead of
                  swapping in over the photograph a moment later.

                  Every film is fetched whole, not just the one on screen.
                  A film that is fetched only when the carousel reaches it
                  has to download before it can start, and a visitor sees
                  that as the hero stuttering. Fetching both up front
                  means neither ever waits — a phone still fetches
                  neither, because the source rules them out there.

                  The poster is the film's own first frame, so the picture
                  on screen does not change when the film takes over from
                  the still — the hero opens on the scene the film opens
                  on, and simply starts moving.

                  The film carries the hero's own background colour. A
                  video is see-through until it has a poster or a frame,
                  and the photograph underneath arrives after the first
                  paint — without this, the hero would flash the
                  photograph on the way to the film.

                  The source carries the width and the motion preference,
                  so a phone — and a reader who has asked for less
                  movement — never downloads the wide film at all. */}
              {s.video && (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  poster={s.video_poster ?? s.image}
                  aria-hidden="true"
                  autoPlay={i === openingFilm}
                  muted
                  playsInline
                  preload="auto"
                  tabIndex={-1}
                  onEnded={() => {
                    // The film has run to its end: hand over to the next
                    // picture, which is what the shopper sees next.
                    if (i !== index) return;
                    endedSeen.current.add(filmKey(s.id, false));
                    setIndex((n) => (n + 1) % count);
                  }}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d)) {
                      setFilm(filmKey(s.id, false), { length: d });
                    }
                  }}
                  onError={() => {
                    // A film that is meant for the other shape of screen
                    // is not a film that failed — it is simply not the
                    // one playing here.
                    if (!screenIsNarrow()) {
                      setFilm(filmKey(s.id, false), { failed: true });
                    }
                  }}
                  className={`hero-film absolute inset-0 h-full w-full bg-ink object-cover ${
                    films[filmKey(s.id, false)]?.failed ? "opacity-0" : ""
                  }`}
                  style={{ objectPosition: s.image_position }}
                >
                  <source
                    src={s.video}
                    type="video/mp4"
                    media="(min-width: 768px) and (prefers-reduced-motion: no-preference)"
                    onError={() => {
                      if (!screenIsNarrow()) {
                        setFilm(filmKey(s.id, false), { failed: true });
                      }
                    }}
                  />
                </video>
              )}

              {/* The phone's own film. A film cut for a wide screen is
                  mostly black when it is cut to a phone's portrait shape,
                  so the phone plays a different file — the same footage,
                  cut to the shape it is shown in. It plays on a phone and
                  nowhere else, and the source rules it out on a wide
                  screen, so a desktop never downloads it. */}
              {s.mobile_video && (
                <video
                  ref={(el) => {
                    mobileVideoRefs.current[i] = el;
                  }}
                  poster={s.mobile_video_poster ?? s.mobile_image ?? s.image}
                  aria-hidden="true"
                  autoPlay={i === openingMobileFilm}
                  muted
                  playsInline
                  preload="auto"
                  tabIndex={-1}
                  onEnded={() => {
                    // The film has run to its end: hand over to the next
                    // picture, which is what the shopper sees next.
                    if (i !== index) return;
                    endedSeen.current.add(filmKey(s.id, true));
                    setIndex((n) => (n + 1) % count);
                  }}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d)) {
                      setFilm(filmKey(s.id, true), { length: d });
                    }
                  }}
                  onError={() => {
                    // The same as above: a film for the other shape of
                    // screen is not a film that failed.
                    if (screenIsNarrow()) {
                      setFilm(filmKey(s.id, true), { failed: true });
                    }
                  }}
                  className={`hero-film-narrow absolute inset-0 h-full w-full bg-ink object-cover ${
                    films[filmKey(s.id, true)]?.failed ? "opacity-0" : ""
                  }`}
                  style={{ objectPosition: s.mobile_position ?? "50% 50%" }}
                >
                  <source
                    src={s.mobile_video}
                    type="video/mp4"
                    media={`(max-width: ${PHONE_MAX}px) and (prefers-reduced-motion: no-preference)`}
                    onError={() => {
                      if (screenIsNarrow()) {
                        setFilm(filmKey(s.id, true), { failed: true });
                      }
                    }}
                  />
                </video>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrim — darkens the photograph under the copy. Which side it
          darkens follows the slide. */}
      <div
        className={`hero-scrim pointer-events-none absolute inset-0 ${
          active.side === "right" ? "hero-scrim-right" : ""
        }`}
        aria-hidden="true"
      />

      {/* Copy, laid over the photograph. One column per slide, stacked so
          they cross-fade. On a narrow screen it sits along the bottom.
          The row sits in the site's own frame, so the headline lines up
          with the header above it however wide the screen is. */}
      <div className="container-x relative flex flex-1 flex-col justify-end pb-6 pt-10 sm:pb-7 sm:pt-20 lg:justify-center lg:pb-0">
        <div
          className={`w-full max-w-[42rem] ${
            active.side === "right" ? "lg:ml-auto" : ""
          }`}
        >
          <div className="grid">
            {slides.map((s, i) => {
              const on = i === index;
              return (
                <div
                  key={s.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  aria-hidden={!on}
                  inert={!on}
                  className={`col-start-1 row-start-1 transition-opacity duration-500 ease-out ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {s.eyebrow && (
                    <p className={`hero-eyebrow ${on ? "hero-rise" : ""}`}>
                      {s.eyebrow}
                    </p>
                  )}

                  <h1
                    className={`hero-title mt-4 max-w-[15ch] text-[clamp(1.9rem,4.4vw,3.9rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:mt-5 ${
                      on ? "hero-rise" : ""
                    }`}
                    style={on ? { animationDelay: "90ms" } : undefined}
                  >
                    {s.title}
                  </h1>

                  {s.body && (
                    <p
                      className={`mt-4 max-w-[48ch] text-[14.5px] leading-relaxed text-white/85 sm:mt-5 sm:text-[16.5px] ${
                        on ? "hero-rise" : ""
                      }`}
                      style={on ? { animationDelay: "180ms" } : undefined}
                    >
                      {s.body}
                    </p>
                  )}

                  <div
                    className={`mt-6 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-4 ${
                      on ? "hero-rise" : ""
                    }`}
                    style={on ? { animationDelay: "260ms" } : undefined}
                  >
                    {s.primary && (
                      <Link href={s.primary.href} className="btn-invert flex-1 sm:flex-none">
                        {s.primary.label}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                    {s.secondary && (
                      <Link href={s.secondary.href} className="btn-outline-invert group flex-1 sm:flex-none">
                        {s.secondary.label}
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    )}
                  </div>

                  {s.note && (
                    /* The note is the smallest line on the slide and the
                       least load-bearing — the same promise is made on the
                       product page, in the footer and in the trust panel
                       below the hero. A phone has the room to carry it; a
                       small screen is better off with the headline, the
                       line under it and the buttons. */
                    <p
                      className={`mt-5 hidden text-[12.5px] text-white/65 sm:mt-6 sm:block ${
                        on ? "hero-rise" : ""
                      }`}
                      style={on ? { animationDelay: "330ms" } : undefined}
                    >
                      {s.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Slide controls — dots and counter on the left, arrows on the right.
          In the site's own frame, so they line up with the header. */}
      <div className="container-x relative flex items-center justify-between gap-3 pb-6 pt-2 sm:gap-4 sm:pb-10">
        {count > 1 && (
          <>
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div
                className="flex items-center gap-1.5 sm:gap-2.5"
                role="tablist"
                aria-label="Choose slide"
              >
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-label={s.title}
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                    className="group h-8 p-0 sm:h-6"
                  >
                    {i === index ? (
                      <span className="block h-1 w-8 overflow-hidden rounded-full bg-white/30">
                        <span
                          key={s.id}
                          className="hero-progress block h-full w-full origin-left rounded-full bg-white"
                          style={{
                            // A slide with a film is as long as the film is.
                            animationDuration: `${slideMs}ms`,
                            // Paused, the bar holds where it is rather than
                            // jumping to the end and starting again.
                            animationPlayState: barPaused ? "paused" : "running",
                          }}
                        />
                      </span>
                    ) : (
                      <span className="block h-1 w-1.5 rounded-full bg-white/45 transition-colors group-hover:bg-white/75" />
                    )}
                  </button>
                ))}
              </div>

              <p className="tnum shrink-0 text-[11px] font-medium tracking-[0.12em] text-white/70 sm:text-[12px] sm:tracking-[0.14em]">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(count).padStart(2, "0")}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous slide"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-ink/30 text-white backdrop-blur transition-colors hover:bg-white/25 sm:h-11 sm:w-11"
              >
                <ChevronLeft className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next slide"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-ink/30 text-white backdrop-blur transition-colors hover:bg-white/25 sm:h-11 sm:w-11"
              >
                <ChevronRight className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </button>
            </div>
          </>
        )}

        <p className="sr-only" aria-live="polite">
          {`Slide ${index + 1} of ${count}: ${active.title}`}
        </p>
      </div>
    </section>
  );
}
