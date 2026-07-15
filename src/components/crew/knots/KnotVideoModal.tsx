'use client';

// ============================================================================
// KnotVideoModal — "Watch how to tie it" button that opens the tutorial video
// in an on-screen popup (a modal overlay) instead of a new tab.
//
// We embed YouTube (which is built to be embedded); we do NOT try to iframe
// AnimatedKnots.com — that site blocks framing, so it would show up blank.
// ============================================================================

import { useEffect, useState } from 'react';

export function KnotVideoModal({
  videoId,
  title,
  credit,
  label = 'Watch how to tie it',
}: {
  videoId: string;
  title: string;
  credit: string;
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
            className="w-full max-w-3xl overflow-hidden rounded-card border-[3px] border-bark-deep bg-paper shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="font-headline text-sm font-black uppercase tracking-ribbon text-bark-deep">
                {title}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close video"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-bark text-cream hover:bg-ink"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`}
                title={`${title} tutorial video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="px-4 py-2 text-xs text-fg-3">Video: {credit} (YouTube)</p>
          </div>
        </div>
      )}
    </>
  );
}
