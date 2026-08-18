'use client';

import { useCallback, useState } from 'react';
import { PARTNER, PARTNER_COLORS } from '@/lib/partner-config';

/**
 * The partner's logo, with a graceful fallback to a styled wordmark.
 *
 * Their logo file may not be in /public yet (see PARTNER.logoCandidates in
 * partner-config.ts). Rather than showing a broken-image icon, this tries each
 * candidate filename in turn and then draws their name. Upload a file under any
 * of those names and it appears with no code change.
 *
 * Detecting the failure takes BOTH hooks below, and that's not belt-and-braces:
 *
 *   - onError catches a load that fails after hydration.
 *   - The ref callback catches the much more common case in a server-rendered
 *     page: the browser starts fetching the image from the initial HTML and it
 *     has already failed by the time React attaches any handler, so the error
 *     event is long gone. An <img> that finished loading with naturalWidth 0
 *     is one that failed.
 *
 * A `key` per source also matters — without it React reuses the same element
 * across attempts and the second failure goes unnoticed.
 */
export function PartnerLogo({ className = '' }: { className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const src = PARTNER.logoCandidates[attempt];

  const next = useCallback(() => setAttempt((a) => a + 1), []);

  const checkAlreadyFailed = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth === 0) next();
    },
    [next],
  );

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- needs an onError
      // fallback, which next/image does not expose.
      <img
        key={src}
        ref={checkAlreadyFailed}
        src={src}
        alt={PARTNER.name}
        className={`h-9 w-auto ${className}`}
        onError={next}
      />
    );
  }

  // Wordmark fallback, echoing the logo's heavy-serif-over-spaced-sans structure.
  return (
    <span
      className={`flex flex-col leading-none ${className}`}
      style={{ color: PARTNER_COLORS.dark }}
    >
      <span className="font-serif text-xl font-bold uppercase tracking-tight">
        Landscapes
      </span>
      <span className="self-end text-[0.7rem] font-semibold uppercase tracking-[0.22em]">
        Unlimited
      </span>
    </span>
  );
}
