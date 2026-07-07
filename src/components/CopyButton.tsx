'use client';

import { useState } from 'react';

/**
 * Copies a block of text to the clipboard on click, with brief "Copied!"
 * feedback. Used on the PHC call list to grab a customer's details for a
 * hand-off message to a sales arborist.
 */
export function CopyButton({
  text,
  label = 'Copy details',
  className = '',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / permission issues.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`rounded-2 border-2 border-paper-edge px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon transition-colors hover:border-orange ${
        copied ? 'bg-green/15 text-green-dark' : 'text-fg-2'
      } ${className}`}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
