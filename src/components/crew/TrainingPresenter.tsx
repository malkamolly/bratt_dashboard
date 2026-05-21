'use client';

// ============================================================================
// TrainingPresenter
// ============================================================================
// Branded slide viewer that mirrors the look of the source PPT:
//   - Dark wood gradient background with a subtle radial accent
//   - Top strip with the BRATT TREE mark
//   - Section badge bottom-left, slide N/total bottom-right
//   - Massive Rugfish display titles with a lime accent bar
//   - Custom markdown components style stat lines, sub-headers, and bullets
//   - Section-cover transition rendered as a synthesized "cover" slide at the
//     start of each section
//
// Keyboard nav: ← / → / Space / PgUp / PgDn, F for fullscreen, Esc to exit.
// ============================================================================

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  sectionKey: string;
  slides: PresenterSlide[];
  exitHref: string;
  nextSectionHref: string | null;
};

// ---------- Synthesized slides ----------
// We render an extra virtual "cover" slide at the start of each section so
// the deck has a proper PPT-style transition into the topic. It's not in
// the database — we just slot it in client-side.

type RenderedSlide =
  | { kind: 'cover'; sectionLabel: string; moduleName: string }
  | { kind: 'content'; slide: PresenterSlide };

// Section-specific accent color (Tailwind class) for headings + the title
// underline bar. Pulls from the existing brand palette.
const SECTION_ACCENT: Record<string, string> = {
  intro: 'bg-lime',
  equipment: 'bg-teal',
  safety: 'bg-orange',
  operations: 'bg-lime',
  maintenance: 'bg-apricot',
  best_practices: 'bg-green',
  closing: 'bg-orange',
};

export function TrainingPresenter({
  moduleName,
  sectionLabel,
  sectionKey,
  slides,
  exitHref,
  nextSectionHref,
}: Props) {
  const rendered: RenderedSlide[] = useMemo(
    () => [
      { kind: 'cover', sectionLabel, moduleName },
      ...slides.map((s) => ({ kind: 'content' as const, slide: s })),
    ],
    [slides, sectionLabel, moduleName],
  );

  const [index, setIndex] = useState(0);
  const total = rendered.length;
  const current = rendered[index];
  const accent = SECTION_ACCENT[sectionKey] ?? 'bg-orange';

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

  if (!current) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink text-cream">
        <p>No slides in this section.</p>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden text-cream"
      style={{
        background:
          'radial-gradient(120% 80% at 0% 0%, rgba(235,76,27,0.15) 0%, rgba(235,76,27,0) 60%),' +
          ' radial-gradient(100% 80% at 100% 100%, rgba(233,231,29,0.08) 0%, rgba(233,231,29,0) 60%),' +
          ' linear-gradient(150deg, #1A0E05 0%, #26190E 45%, #3D2B14 100%)',
      }}
    >
      {/* Subtle grain overlay — barely-there texture so the dark background isn't flat */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(#FFF8EC 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }}
      />

      {/* Prev / Next click zones */}
      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous slide"
        disabled={index === 0}
        className="absolute left-0 top-16 bottom-16 z-10 w-1/3 cursor-w-resize bg-transparent disabled:cursor-default"
      />
      <button
        type="button"
        onClick={goNext}
        aria-label="Next slide"
        disabled={index === total - 1}
        className="absolute right-0 top-16 bottom-16 z-10 w-1/3 cursor-e-resize bg-transparent disabled:cursor-default"
      />

      {/* ---------- Top brand strip ---------- */}
      <header className="relative z-20 border-b border-cream/10 px-8 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-baseline gap-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon">
            <span className="text-orange">Bratt Tree</span>
            <span className="text-cream/30">/</span>
            <span className="text-cream/70">Operator Training</span>
          </div>
          <div className="flex items-center gap-4 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/60">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hover:text-cream"
            >
              Fullscreen · F
            </button>
            <Link href={exitHref} className="hover:text-cream">
              Exit · Esc
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Slide content ---------- */}
      <div className="relative z-20 mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-6xl flex-col justify-center px-12 py-10">
        {current.kind === 'cover' ? (
          <CoverSlide
            moduleName={current.moduleName}
            sectionLabel={current.sectionLabel}
            accent={accent}
          />
        ) : (
          <ContentSlide slide={current.slide} accent={accent} />
        )}
      </div>

      {/* ---------- Bottom strip: section + progress ---------- */}
      <footer className="relative z-20 border-t border-cream/10 px-8 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          {/* Left: section badge */}
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${accent}`} />
            <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/70">
              {sectionLabel}
            </span>
          </div>

          {/* Middle: progress dots */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {rendered.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 w-3 rounded-full transition-colors ${
                  i === index ? 'bg-orange' : 'bg-cream/25 hover:bg-cream/50'
                }`}
              />
            ))}
          </div>

          {/* Right: counter + next-section CTA at the end */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-ribbon text-cream/60">
              {index + 1} / {total}
            </span>
            {index === total - 1 && nextSectionHref && (
              <Link
                href={nextSectionHref}
                className="bt-btn bt-btn-primary !text-[10px] !px-3 !py-1.5"
              >
                Next section →
              </Link>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

// ---------- Cover slide ----------

function CoverSlide({
  moduleName,
  sectionLabel,
  accent,
}: {
  moduleName: string;
  sectionLabel: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-start gap-6">
      <span
        className={`inline-block h-1 w-24 ${accent}`}
        aria-hidden
      />
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
        {moduleName}
      </p>
      <h1 className="font-display text-7xl leading-[0.95] uppercase tracking-wider text-cream sm:text-8xl">
        {sectionLabel}
      </h1>
      <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-cream/50">
        Press → to begin
      </p>
    </div>
  );
}

// ---------- Content slide ----------

function ContentSlide({
  slide,
  accent,
}: {
  slide: PresenterSlide;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-start">
      {/* Title block */}
      {slide.title && (
        <>
          <span className={`mb-5 inline-block h-1 w-16 ${accent}`} aria-hidden />
          <h1 className="font-display text-5xl leading-[0.95] uppercase tracking-wider text-cream sm:text-6xl">
            {slide.title}
          </h1>
        </>
      )}

      {/* Body */}
      {slide.body && (
        <div className="prose mt-8 max-w-4xl text-cream/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="my-4 text-lg leading-relaxed text-cream/85">
                  {children}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="font-headline font-black uppercase tracking-ribbon text-orange">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="not-italic font-headline font-bold text-lime">
                  {children}
                </em>
              ),
              h1: ({ children }) => (
                <h2 className="mt-6 font-display text-3xl uppercase tracking-wider text-cream">
                  {children}
                </h2>
              ),
              h2: ({ children }) => (
                <h2 className="mt-8 mb-2 font-headline text-base font-black uppercase tracking-ribbon text-lime">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-6 mb-1 font-headline text-sm font-black uppercase tracking-ribbon text-orange">
                  {children}
                </h3>
              ),
              ul: ({ children }) => (
                <ul className="my-4 space-y-2 pl-0 list-none">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-4 space-y-2 pl-6 marker:font-headline marker:font-extrabold marker:text-orange">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="relative pl-6 text-lg leading-relaxed text-cream/90">
                  <span
                    aria-hidden
                    className="absolute left-0 top-[0.55em] inline-block h-1.5 w-1.5 rounded-full bg-orange"
                  />
                  {children}
                </li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-6 border-l-4 border-orange bg-cream/5 px-5 py-3 text-xl italic text-cream">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-8 border-cream/10" />,
              code: ({ children }) => (
                <code className="rounded bg-cream/10 px-1.5 py-0.5 font-mono text-sm text-lime">
                  {children}
                </code>
              ),
            }}
          >
            {slide.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
