'use client';

import { useState } from 'react';

// Copies a pre-built plain-text summary to the clipboard for pasting into
// Slack. The text is assembled server-side and passed in.
export function CopyReport({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // Clipboard blocked (rare) — no-op; the button just won't confirm.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`bt-btn w-full justify-center sm:w-auto ${
        done ? 'bt-btn-dark' : 'bt-btn-ghost'
      }`}
    >
      {done ? 'Copied ✓' : 'Copy for Slack'}
    </button>
  );
}
