'use client';

// ============================================================================
// useStickyScroll — keep a message thread pinned to the newest content
// ============================================================================
// Shared by Coach Mode and the Playbook refine chat. Both are scrolling threads
// that grow while the model writes, and neither followed along, so the newest
// reply sat below the fold while the voice read it out.
//
// It sticks to the bottom only while the reader is already there. If they've
// scrolled up to re-read something, new text must not yank the view away
// mid-sentence — a chat that fights the reader is worse than one that doesn't
// follow at all.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';

// How close to the bottom still counts as "following along", in pixels. Enough
// slack to survive a line of text arriving between a scroll event and the check.
const AT_BOTTOM_SLACK_PX = 48;

/**
 * @param signal a value that changes whenever the thread's content changes —
 *   e.g. `${messages.length}:${lastMessageLength}`, which is cheap to compute and
 *   ticks on every streamed chunk.
 */
export function useStickyScroll(signal: string | number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_SLACK_PX;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !following.current) return;
    el.scrollTop = el.scrollHeight;
  }, [signal]);

  return { ref, onScroll };
}
