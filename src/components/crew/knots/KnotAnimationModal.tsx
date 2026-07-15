'use client';

// ============================================================================
// KnotAnimationModal — "Watch how to tie it" button that opens the step-by-step
// animation (the AnimatedKnots slideshow) in an on-screen popup, instead of a
// new tab.
//
// We load AnimatedKnots.com in an iframe. Some sites refuse to be embedded
// (via X-Frame-Options / CSP), in which case the frame comes up blank — so the
// popup always shows a "open in a new tab" fallback link that works regardless.
// ============================================================================

import { useEffect, useState } from 'react';

export function KnotAnimationModal({
  url,
  title,
  label = 'Watch how to tie it',
}: {
  url: string;
  title: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape, and lock background scroll while the popup is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bt-btn bt-btn-primary shrink-0"
      >
        ▶ {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — how to tie it`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-card border-[3px] border-bark-deep bg-paper shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-paper-edge px-4 py-3">
              <p className="font-headline text-sm font-black uppercase tracking-ribbon text-bark-deep">
                {title} — step by step
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                >
                  Open in new tab ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-bark text-cream hover:bg-ink"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              className="w-full flex-1 bg-white"
              src={url}
              title={`${title} — AnimatedKnots animation`}
              allowFullScreen
            />
            <p className="border-t border-paper-edge px-4 py-2 text-xs text-fg-3">
              Animation from AnimatedKnots.com. Blank above?{' '}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-headline font-extrabold uppercase tracking-ribbon text-orange hover:underline"
              >
                Open it in a new tab ↗
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
