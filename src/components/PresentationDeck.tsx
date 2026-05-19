'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useState } from 'react';
import type { Slide } from '@/lib/meeting-data';

export type CoverSlide = {
  kind: 'cover';
  section: Slide['section'];
  eyebrow: string;
  title: string;
  tags: string[];
  meetingDate: string;
};

type Props = {
  cover: CoverSlide;
  slides: Slide[];
  meetingTitle: string;
  exitHref: string;
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

export function PresentationDeck({
  cover,
  slides,
  meetingTitle,
  exitHref,
}: Props) {
  const [index, setIndex] = useState(0);
  // Slide 0 is the cover; 1..N are content slides
  const total = slides.length + 1;

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

  const isCover = index === 0;
  const contentSlide = index > 0 ? slides[index - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-bark/90 p-4 sm:p-8">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-card border-[4px] border-lime shadow-sh-3">
        {/* Close button */}
        <Link
          href={exitHref}
          aria-label="Close presentation"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-lime bg-bark text-cream transition-colors hover:bg-orange hover:border-orange"
        >
          ✕
        </Link>

        {/* Slide */}
        <div
          className={
            'flex flex-1 cursor-pointer items-center justify-center overflow-y-auto px-8 py-12 sm:px-16 sm:py-16 ' +
            (isCover ? 'bg-bark text-cream' : 'bg-cream text-ink')
          }
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLDivElement
            ).getBoundingClientRect();
            if (e.clientX - rect.left > rect.width / 2) goNext();
            else goPrev();
          }}
        >
          {isCover ? <CoverSlideView cover={cover} /> : null}
          {contentSlide ? <ContentSlideView slide={contentSlide} /> : null}
        </div>

        {/* Bottom nav */}
        <footer className="flex items-center justify-between gap-3 border-t-[3px] border-lime bg-bark px-4 py-3 text-cream sm:px-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream transition-colors hover:bg-orange hover:text-cream disabled:cursor-not-allowed disabled:opacity-30 hover:disabled:bg-cream/10"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>

          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/80">
            <span className="text-lime">{index + 1}</span>
            <span className="mx-1 text-cream/50">/</span>
            <span>{total}</span>
          </p>

          <button
            type="button"
            onClick={goNext}
            disabled={index === total - 1}
            className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream transition-colors hover:bg-orange hover:text-cream disabled:cursor-not-allowed disabled:opacity-30 hover:disabled:bg-cream/10"
          >
            <span>Next</span>
            <span aria-hidden>→</span>
          </button>
        </footer>

        {/* Subtle meeting title in the corner so the presenter knows what they're showing */}
        <p className="pointer-events-none absolute bottom-[4.5rem] left-6 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 opacity-50">
          {meetingTitle}
        </p>
      </div>

      {/* Tiny help hint, only first slide */}
      {isCover && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/60">
          Use ← → keys · F for fullscreen · click slide to advance
        </p>
      )}
    </div>
  );
}

function CoverSlideView({ cover }: { cover: CoverSlide }) {
  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
        {cover.eyebrow}
      </p>
      <h2 className="mt-4 break-words font-display text-6xl uppercase tracking-wider text-cream sm:text-7xl lg:text-8xl">
        {cover.title}
      </h2>
      {cover.tags.length > 0 && (
        <ul className="mt-8 space-y-2">
          {cover.tags.map((t) => (
            <li
              key={t}
              className="flex items-center gap-3 font-headline text-2xl font-extrabold uppercase tracking-wider text-lime sm:text-3xl"
            >
              <span aria-hidden className="text-cream/40">
                ›
              </span>
              {t}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-10 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/60">
        {formatDate(cover.meetingDate)}
      </p>
    </div>
  );
}

// Pattern that finds an inserted image with a layout modifier:
//   ![alt text](url){hero}
//   ![alt text](url){side}
// Multiline so the m flag lets ^ / $ match at line boundaries.
const HERO_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\{hero\}\s*$/m;
const SIDE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\{side\}\s*$/m;

// Render whatever's left after we extract the hero/side image. Inline images
// (plain ![alt](url) with no modifier) render here via ReactMarkdown's
// default <img> output, styled by the custom components below.
const PROSE_CLASSES =
  'text-base leading-relaxed text-fg sm:text-lg ' +
  '[&_a]:font-bold [&_a]:text-orange [&_a]:underline ' +
  '[&_h2]:mt-6 [&_h2]:font-headline [&_h2]:text-xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-ribbon [&_h2]:text-bark-deep ' +
  '[&_h3]:mt-4 [&_h3]:font-headline [&_h3]:font-extrabold [&_h3]:uppercase [&_h3]:tracking-ribbon ' +
  '[&_li]:mb-2 [&_p]:mb-4 ' +
  '[&_strong]:font-bold [&_strong]:text-ink ' +
  '[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 ' +
  '[&_img]:mx-auto [&_img]:my-4 [&_img]:max-h-[40vh] [&_img]:rounded-2';

function ContentSlideView({ slide }: { slide: Slide }) {
  if (!slide.title && !slide.body) return null;

  const heroMatch = slide.body.match(HERO_RE);
  const sideMatch = slide.body.match(SIDE_RE);
  // Hero wins if both happen to be present.
  if (heroMatch) {
    const [full, alt, url] = heroMatch;
    const remaining = slide.body.replace(full, '').trim();
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-[50vh] w-full rounded-2 object-cover"
        />
        {slide.title && (
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink sm:text-4xl lg:text-5xl">
            {slide.title}
          </h2>
        )}
        {remaining && (
          <div className={PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {remaining}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  if (sideMatch) {
    const [full, alt, url] = sideMatch;
    const remaining = slide.body.replace(full, '').trim();
    return (
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-8 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-[55vh] w-full rounded-2 object-cover"
        />
        <div>
          {slide.title && (
            <h2 className="font-display text-3xl uppercase tracking-wider text-ink sm:text-4xl">
              {slide.title}
            </h2>
          )}
          {remaining && (
            <div className={`mt-4 ${PROSE_CLASSES}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {remaining}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {slide.title && (
        <h2 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl lg:text-6xl">
          {slide.title}
        </h2>
      )}
      {slide.body && (
        <div className={`mt-8 ${PROSE_CLASSES}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {slide.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
