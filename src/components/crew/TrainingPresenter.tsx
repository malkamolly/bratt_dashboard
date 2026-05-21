'use client';

// ============================================================================
// TrainingPresenter
// ============================================================================
// Slide-by-slide viewer for a training module. Keyboard nav (←/→/Esc),
// click-zone nav, optional fullscreen.
// ============================================================================

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useState } from 'react';

export type PresenterSlide = {
  id: string;
  position: number;
  section: string | null;
  title: string | null;
  body: string | null;
};

type Props = {
  moduleName: string;
  sectionLabel: string;
  slides: PresenterSlide[];
  exitHref: string;
  nextSectionHref: string | null;
};

export function TrainingPresenter({
  moduleName,
  sectionLabel,
  slides,
  exitHref,
  nextSectionHref,
}: Props) {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total],
  );

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, toggleFullscreen]);

  if (!slide) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink text-cream">
        <p>No slides in this section.</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-ink text-cream">
      {/* Click zones for prev / next on either side of the screen */}
      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous slide"
        className="absolute left-0 top-0 bottom-0 z-10 w-1/3 cursor-w-resize bg-transparent"
        disabled={index === 0}
      />
      <button
        type="button"
        onClick={goNext}
        aria-label="Next slide"
        className="absolute right-0 top-0 bottom-0 z-10 w-1/3 cursor-e-resize bg-transparent"
        disabled={index === total - 1}
      />

      <div className="relative z-20 mx-auto flex min-h-screen max-w-5xl flex-col px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange">
              {sectionLabel} · {moduleName}
            </p>
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/60">
              Slide {index + 1} of {total}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/70 hover:text-cream"
            >
              Fullscreen (F)
            </button>
            <Link
              href={exitHref}
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/70 hover:text-cream"
            >
              Exit
            </Link>
          </div>
        </div>

        {/* Slide content */}
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-3xl text-left">
            {slide.title && (
              <h1 className="font-display text-4xl leading-tight tracking-wider text-cream sm:text-5xl">
                {slide.title}
              </h1>
            )}
            {slide.body && (
              <div className="prose prose-invert mt-6 max-w-none text-cream/90">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{slide.body}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/80 hover:text-cream disabled:opacity-30"
          >
            ← Prev
          </button>

          {/* Progress dots */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 w-3 rounded-full ${i === index ? 'bg-orange' : 'bg-cream/30 hover:bg-cream/50'}`}
              />
            ))}
          </div>

          {index === total - 1 && nextSectionHref ? (
            <Link
              href={nextSectionHref}
              className="bt-btn bt-btn-primary !text-xs !px-3 !py-1.5"
            >
              Next section →
            </Link>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={index === total - 1}
              className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/80 hover:text-cream disabled:opacity-30"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
