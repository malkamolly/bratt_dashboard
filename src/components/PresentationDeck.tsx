'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useState } from 'react';
import type { Slide } from '@/lib/meeting-data';

type Props = {
  slides: Slide[];
  meetingTitle: string;
  exitHref: string;
};

export function PresentationDeck({ slides, meetingTitle, exitHref }: Props) {
  const [index, setIndex] = useState(0);
  const total = slides.length;

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
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
      } else if (e.key === 'Home') {
        setIndex(0);
      } else if (e.key === 'End') {
        setIndex(total - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, toggleFullscreen, total]);

  if (total === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-fg-2">
        <div className="text-center">
          <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon">
            No slides yet
          </p>
          <Link
            href={exitHref}
            className="mt-3 inline-block text-orange hover:underline"
          >
            Back to meeting
          </Link>
        </div>
      </div>
    );
  }

  const slide = slides[index];
  const sectionLabel =
    slide.section === 'educational' ? 'Educational' : 'Operational Updates';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream text-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b-2 border-paper-edge bg-bark px-5 py-3 text-cream">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon">
          {meetingTitle}
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle fullscreen (F)"
            className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/80 hover:text-lime"
          >
            Fullscreen
          </button>
          <Link
            href={exitHref}
            className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/80 hover:text-orange"
          >
            ✕ Exit
          </Link>
        </div>
      </header>

      {/* Slide body */}
      <div
        className="flex flex-1 cursor-pointer items-center justify-center overflow-y-auto px-8 py-10"
        onClick={(e) => {
          // Click the right half of the slide to advance, left half to go back.
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - rect.left > rect.width / 2) goNext();
          else goPrev();
        }}
      >
        <div className="mx-auto w-full max-w-4xl">
          {slide.title && (
            <h2 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
              {slide.title}
            </h2>
          )}
          {slide.body && (
            <div className="prose prose-bratt prose-lg mt-6 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {slide.body}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <footer className="flex items-center justify-between border-t-2 border-paper-edge bg-paper px-5 py-3">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          {sectionLabel}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Previous slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bark text-cream transition-colors hover:bg-orange disabled:cursor-not-allowed disabled:opacity-30"
          >
            ←
          </button>
          <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-ink">
            {index + 1} / {total}
          </p>
          <button
            type="button"
            onClick={goNext}
            disabled={index === total - 1}
            aria-label="Next slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bark text-cream transition-colors hover:bg-orange disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
          </button>
        </div>
      </footer>
    </div>
  );
}
