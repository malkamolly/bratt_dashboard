'use client';

// ============================================================================
// coachDraft — keep an in-progress coaching conversation recoverable
// ============================================================================
// Coach Mode is stateless by design: the browser holds the conversation and
// sends it with each turn. That's fine until someone talks for twenty minutes
// and closes the tab without pressing "Wrap up & review lessons" — the whole
// conversation is gone, and nothing server-side ever saw it.
//
// So the conversation is mirrored into localStorage as it goes, and the Video
// Notes page offers to resume it. This survives reloading, closing the tab, and
// closing the browser. It does NOT survive switching devices — that would need
// server-side storage, which is a bigger build than this problem warrants.
//
// The draft is cleared only once lessons are actually saved, so abandoning at
// the review step is recoverable too.
// ============================================================================

import type { CoachMessage } from '@/lib/coach';
import type { Findings } from '@/lib/video-notes';

// Versioned so a future shape change ignores old drafts instead of crashing on
// them.
const KEY = 'coachDraft.v1';

export type CoachDraft = {
  savedAt: string;
  /** Null for a "talk it through" session. Kept so resuming restores context. */
  findings: Findings | null;
  messages: CoachMessage[];
};

export function readCoachDraft(): CoachDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CoachDraft;
    // Only offer something there's actually a conversation in.
    if (!Array.isArray(draft.messages) || draft.messages.length === 0) return null;
    return draft;
  } catch {
    // Corrupt or unreadable — behave as though there's no draft.
    return null;
  }
}

export function writeCoachDraft(findings: Findings | null, messages: CoachMessage[]): void {
  if (typeof window === 'undefined' || messages.length === 0) return;
  try {
    const draft: CoachDraft = { savedAt: new Date().toISOString(), findings, messages };
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota. Losing the safety net is not worth
    // interrupting the conversation over.
  }
}

export function clearCoachDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do.
  }
}

/** How many turns the arborist themselves contributed — the useful measure of
 *  what would be lost, since assistant turns aren't their work. */
export function draftUserTurns(draft: CoachDraft): number {
  return draft.messages.filter((m) => m.role === 'user').length;
}
