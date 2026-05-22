'use client';

// ============================================================================
// CopyAsImageButton — drop-anywhere "Copy as image" button
// ============================================================================
// Captures a target element (looked up by DOM id) as a PNG and writes it to
// the user's clipboard, ready to paste into Slack, email, or text messages.
//
// Usage:
//   <div id="some-snapshot">...content to capture...</div>
//   <CopyAsImageButton targetId="some-snapshot" />
//
// The button is dynamically marked `data-html2canvas-ignore` so if it sits
// inside the captured region, it won't appear in the screenshot.
//
// html2canvas (~200KB) is loaded lazily on click so it stays out of the
// initial page bundle.
// ============================================================================

import { useState } from 'react';

type State = 'idle' | 'copying' | 'copied' | 'error';

type Props = {
  /** DOM id of the element to screenshot. Must be unique on the page. */
  targetId: string;
  /** Label for the idle state. Defaults to "Copy as image". */
  label?: string;
  /** Override the default styling if you need it to fit a darker surface. */
  className?: string;
};

const DEFAULT_CLASS =
  'shrink-0 rounded-full border-2 border-bark-deep/30 bg-white px-3 py-1 ' +
  'font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep ' +
  'transition-colors hover:border-bark-deep hover:bg-bark-deep hover:text-cream ' +
  'disabled:cursor-wait disabled:opacity-60';

export function CopyAsImageButton({ targetId, label = 'Copy as image', className }: Props) {
  const [state, setState] = useState<State>('idle');

  async function handleCopy() {
    const target = document.getElementById(targetId);
    if (!target) {
      console.error(`CopyAsImageButton: element #${targetId} not found`);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
      return;
    }
    setState('copying');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, {
        scale: 2, // retina-sharp output when pasted into Slack/email
        backgroundColor: '#FFFFFF',
        useCORS: true,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) throw new Error('Could not encode image');
      if (
        typeof window === 'undefined' ||
        !navigator.clipboard ||
        typeof window.ClipboardItem === 'undefined'
      ) {
        throw new Error('Clipboard image copy not supported in this browser');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch (e) {
      console.error('Copy as image failed:', e);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={state === 'copying'}
      data-html2canvas-ignore="true"
      className={className ?? DEFAULT_CLASS}
      title="Copies a PNG of this section to your clipboard — paste into Slack, email, etc."
    >
      {state === 'copying' && 'Copying…'}
      {state === 'copied' && 'Copied ✓'}
      {state === 'error' && 'Copy failed'}
      {state === 'idle' && label}
    </button>
  );
}
