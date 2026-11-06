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

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [wideEnough, setWideEnough] = useState(false);
  const [filmLength, setFilmLength] = useState(0);
  const [filmFailed, setFilmFailed] = useState(false);
  const swipeStart = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Hover, focus and a backgrounded tab all pause the carousel.
  const paused = hovered || hidden;

  // The slide that carries a film. A film decides how long its own slide
  // lasts: it plays to the end and hands over to the next picture itself.
  const videoSlide = slides.findIndex((s) => s.video);

  // How long the slide on screen lasts. A slide with a film lasts as long
  // as the film does; a picture slide lasts for the usual interval.
  const slideMs =
    index === videoSlide && filmLength > 0 ? filmLength * 1000 : SLIDE_MS;

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count]
  );

  // Honour the OS "reduce motion" setting: no auto-advance, no animation.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // A film is only worth playing on a screen with room for it. A phone
  // keeps the photograph: the film's own source rules it out there, so a
  // phone never downloads the film at all, and this is where the browser
  // is asked whether there is room for it before it is started.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWideEnough(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Advance on a timer. Depending on `index` restarts the countdown whenever
  // the slide changes, whether that was automatic or manual.
  //
  // A slide with a film is not timed at all while the film is playing: it
  // runs to its end and hands over to the next picture itself. The timer
  // takes over where the film is not playing — on a phone, or if the
  // browser would not play it — so the carousel never sits on one slide.
  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    if (index === videoSlide && wideEnough && !filmFailed) return;
    const id = window.setTimeout(() => setIndex((index + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [count, index, paused, reduced, videoSlide, wideEnough, filmFailed]);

  // Don't burn through the slides while the tab is in the background.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The film plays while its own slide is on screen, and stops when it is
  // not — and never plays at all where motion is unwelcome.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (videoSlide !== index) {
      video.pause();
      return;
    }
    // A film that has been watched to the end starts again from the top
    // when its slide comes round.
    if (video.ended) {
      try {
        video.currentTime = 0;
      } catch {
        /* the film has not loaded yet, and starts at the top anyway */
      }
    }
    if (wideEnough && !reduced && !hidden && !hovered && !filmFailed) {
      video.play().catch((err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        // The browser would not start the film — it wants a gesture first,
        // or it cannot play the file. The photograph carries the slide
        // instead, and the carousel goes back to its usual timing.
        if (name === "NotAllowedError" || name === "NotSupportedError") {
          setFilmFailed(true);
        }
      });
    } else {
      video.pause();
    }
  }, [index, wideEnough, reduced, hidden, hovered, videoSlide, filmFailed]);

  // A browser that cannot play the file says so quietly. play() stays
  // pending rather than rejecting, and the error arrives while the page
  // is still waking up, so it is never heard. The element's own state is
  // the only reliable witness, and it is watched while the film is on
  // screen: the moment the film is out of reach, the photograph takes
  // over and the carousel goes back to its usual timing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoSlide !== index || filmFailed) return;
    if (!wideEnough || reduced) return;
    const id = window.setInterval(() => {
      // 3 is NETWORK_NO_SOURCE: there is no film this browser can play.
      if (video.error || video.networkState === 3) setFilmFailed(true);
    }, 400);
    return () => window.clearInterval(id);
  }, [index, videoSlide, filmFailed, wideEnough, reduced]);

  function onPointerDown(e: React.PointerEvent) {
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

  const active = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative isolate flex min-h-[30rem] touch-pan-y flex-col overflow-hidden bg-ink sm:min-h-[36rem] lg:h-[clamp(38rem,48vw,50rem)] lg:min-h-[38rem]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
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
      {/* The photograph covers the whole section, edge to edge. The slide
          that is showing dissolves in while the one leaving softens and
          drifts back — a slow change of scene rather than a cut.

          A slide may also carry a film. The film is on the page from the
          start and is running when the hero opens; it plays to its end and
          then hands over to the next picture. A phone keeps the
          photograph, and never downloads the film at all. */}
      <div className="absolute inset-0 grid select-none">
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`relative col-start-1 row-start-1 transition-[opacity,filter,transform] duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
              i === index
                ? "opacity-100"
                : "pointer-events-none opacity-0 blur-[8px] scale-[1.03]"
            }`}
          >
            {s.video ? (
              <>
                {/* The photograph sits underneath. It is what a phone
                    shows, and what the slide falls back to when the film
                    cannot be played at all. */}
                <Image
                  src={s.image}
                  alt={s.alt}
                  fill
                  preload={i === 0}
                  loading={i === 0 ? undefined : "eager"}
                  unoptimized
                  sizes="100vw"
                  className={`object-cover transition-transform duration-[6000ms] ease-linear ${
                    i === index ? "scale-[1.06]" : "scale-100"
                  }`}
                  style={{ objectPosition: s.image_position }}
                />
                {/* The film. It is in the page from the very first byte, so
                    it is already running when the hero opens instead of
                    swapping in over the photograph a moment later.

                    Its poster is the film's own first frame, so the picture
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
                    movement — never downloads the film at all. */}
                <video
                  ref={i === videoSlide ? videoRef : undefined}
                  poster={s.video_poster ?? s.image}
                  aria-hidden="true"
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  tabIndex={-1}
                  onEnded={() => {
                    // The film has run to its end: hand over to the next
                    // picture, which is what the shopper sees next.
                    if (i !== index) return;
                    setIndex((n) => (n + 1) % count);
                  }}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d)) setFilmLength(d);
                  }}
                  onError={() => setFilmFailed(true)}
                  className={`hero-film absolute inset-0 h-full w-full bg-ink object-cover ${
                    filmFailed ? "opacity-0" : ""
                  }`}
                  style={{ objectPosition: s.image_position }}
                >
                  <source
                    src={s.video}
                    type="video/mp4"
                    media="(min-width: 768px) and (prefers-reduced-motion: no-preference)"
                    onError={() => setFilmFailed(true)}
                  />
                </video>
              </>
            ) : (
              <Image
                src={s.image}
                alt={s.alt}
                fill
                preload={i === 0}
                loading={i === 0 ? undefined : "eager"}
                /* The photograph is served as it is. The optimiser would
                   re-encode it a second time — the files are already sized
                   for the job — and the browser scales it far better than a
                   second pass through a lossy encoder does. */
                unoptimized
                sizes="100vw"
                className={`object-cover transition-transform duration-[6000ms] ease-linear ${
                  i === index ? "scale-[1.06]" : "scale-100"
                }`}
                style={{ objectPosition: s.image_position }}
              />
            )}
          </div>
        ))}
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
      <div className="container-x relative flex flex-1 flex-col justify-end pb-6 pt-16 sm:pb-7 sm:pt-20 lg:justify-center lg:pb-0">
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
                    <p
                      className={`mt-5 text-[12.5px] text-white/65 sm:mt-6 ${
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
                            animationPlayState: paused ? "paused" : "running",
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
