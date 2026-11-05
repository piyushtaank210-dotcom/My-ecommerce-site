"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/types";

/** How long a slide stays on screen before the carousel advances. */
const SLIDE_MS = 6000;

/** A drag of at least this many pixels counts as a swipe. */
const SWIPE_PX = 48;

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const swipeStart = useRef<number | null>(null);

  // Hover, focus and a backgrounded tab all pause the carousel.
  const paused = hovered || hidden;

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

  // Advance on a timer. Depending on `index` restarts the countdown whenever
  // the slide changes, whether that was automatic or manual.
  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    const id = window.setTimeout(() => setIndex((index + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [count, index, paused, reduced]);

  // Don't burn through the slides while the tab is in the background.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
          drifts back — a slow change of scene rather than a cut. */}
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
                          className={`block h-full w-full origin-left rounded-full bg-white ${
                            paused ? "" : "hero-progress"
                          }`}
                          style={{ animationDuration: `${SLIDE_MS}ms` }}
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
