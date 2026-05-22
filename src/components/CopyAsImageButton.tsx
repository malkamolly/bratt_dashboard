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
// The captured PNG is composited onto a slightly larger cream canvas with a
// thin bark border, so screenshots come out as polished, framed cards
// without forcing those styles onto the live page.
//
// Mark any element with `data-screenshot-ignore="true"` to exclude it from
// the capture (used internally for this button and the MonthPicker dropdown).
//
// Uses `html-to-image` rather than html2canvas because html2canvas has its
// own layout engine that misrenders flex/grid gaps and line-heights — every
// section ended up looking "pushed down." html-to-image renders via SVG
// foreignObject, so the browser does the actual layout and the output
// matches what's on screen.
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

function screenshotFilter(node: HTMLElement): boolean {
  // html-to-image walks both elements and text nodes; we only care about
  // HTMLElements (text nodes have no dataset).
  if (!(node instanceof HTMLElement)) return true;
  return node.dataset.screenshotIgnore !== 'true';
}

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
      // Lazy-load to keep html-to-image out of the initial page bundle.
      const { toCanvas } = await import('html-to-image');
      const inner = await toCanvas(target, {
        pixelRatio: 2, // retina-sharp output when pasted into Slack/email
        backgroundColor: '#FFF8EC', // bratt cream — matches the page
        filter: screenshotFilter,
        cacheBust: true,
      });

      // Composite onto a slightly larger canvas to add a cream "matte" and
      // a thin border around the content.
      const PAD = 64; // ~32 CSS px at the 2x pixel ratio
      const BORDER = 4;
      const out = document.createElement('canvas');
      out.width = inner.width + PAD * 2;
      out.height = inner.height + PAD * 2;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');
      ctx.fillStyle = '#FFF8EC';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(inner, PAD, PAD);
      ctx.strokeStyle = '#3D2B14'; // bark-deep
      ctx.lineWidth = BORDER;
      const half = BORDER / 2;
      ctx.strokeRect(half, half, out.width - BORDER, out.height - BORDER);

      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), 'image/png'),
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
      data-screenshot-ignore="true"
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
