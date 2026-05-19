'use client';

import { useRef, useState } from 'react';
import { uploadMeetingImage } from '@/app/hub/meetings/actions';

type Layout = 'inline' | 'hero' | 'side';

type Props = {
  /** name attribute of the <textarea> we should insert the markdown into */
  targetName: string;
};

const LAYOUTS: { value: Layout; label: string; emoji: string; hint: string }[] = [
  { value: 'inline', label: 'Inline', emoji: '📎', hint: 'Image appears in the flow of the text' },
  { value: 'hero', label: 'Hero', emoji: '🖼️', hint: 'Big image fills the top of the slide' },
  { value: 'side', label: 'Side', emoji: '🪟', hint: 'Image on the left, slide text on the right' },
];

export function ImageUploadButton({ targetName }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingLayout, setPendingLayout] = useState<Layout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPicker(layout: Layout) {
    setPendingLayout(layout);
    setError(null);
    // Slight delay so React paints state before the picker opens; not strictly
    // needed but feels safer.
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file twice works
    if (!file || !pendingLayout) return;

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await uploadMeetingImage(fd);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      const altDefault = file.name.replace(/\.[^.]+$/, '');
      const modifier = pendingLayout === 'inline' ? '' : `{${pendingLayout}}`;
      const markdown = `![${altDefault}](${result.url})${modifier}`;
      insertIntoTextarea(targetName, markdown);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed, please try again.',
      );
    } finally {
      setBusy(false);
      setPendingLayout(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Add image:
      </span>
      {LAYOUTS.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => openPicker(l.value)}
          disabled={busy}
          title={l.hint}
          className="rounded-full border-2 border-paper-edge bg-white px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 transition-colors hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
        >
          {l.emoji} {l.label}
        </button>
      ))}
      {busy && (
        <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange">
          Uploading…
        </span>
      )}
      {error && (
        <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange-press">
          {error}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />
    </div>
  );
}

function insertIntoTextarea(name: string, markdown: string) {
  // Server-rendered form, uncontrolled textarea — we can manipulate it
  // directly without React getting in the way.
  const el = document.querySelector(
    `textarea[name="${name}"]`,
  ) as HTMLTextAreaElement | null;
  if (!el) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);

  // Ensure the inserted markdown is on its own line so it renders cleanly.
  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
  const insertion =
    (needsLeadingNewline ? '\n' : '') +
    markdown +
    (needsTrailingNewline ? '\n' : '');

  el.value = before + insertion + after;
  const cursor = start + insertion.length;
  el.selectionStart = el.selectionEnd = cursor;
  el.focus();
}
