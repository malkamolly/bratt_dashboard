'use client';

// ============================================================================
// PhotoPicker
// ============================================================================
// One photo slot in the Site Markup tool. The arborist picks a photo from their
// device (or snaps one on a phone), and it flows into an AnnotationCanvas to
// mark up the tree, drop zone, no-park area, etc.
//
// The file input allows MULTIPLE photos: this slot keeps the first one and
// hands the rest up via `onExtraFiles`, so the parent can spawn a slot for
// each. That way an arborist standing in the yard can select four photos in one
// tap and get four markup cards, instead of adding them one at a time.
//
// The photo never leaves the browser until the final download/print — we just
// turn the chosen file into a temporary in-memory URL. Nothing is uploaded to
// Supabase, which keeps this simple and private.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
} from './AnnotationCanvas';

type Props = {
  canvasRef: RefObject<AnnotationCanvasHandle | null>;
  /** A photo handed down by the parent (from another slot's multi-select). */
  pendingFile?: File | null;
  /** Extra photos picked here in one go, for the parent to spread into new
   *  slots. Already trimmed to what the parent said it can accept. */
  onExtraFiles?: (files: File[]) => void;
  /** How many more photos the parent has room for, so we never hand up more
   *  than it can hold. */
  extraSlots?: number;
};

/** iPhones save photos as HEIC/HEIF, which most desktop browsers can't show.
 *  Detect it so we can convert to JPEG before drawing. */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export function PhotoPicker({
  canvasRef,
  pendingFile = null,
  onExtraFiles,
  extraSlots = 0,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free the temporary object URL when it's replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      let blob: Blob = file;
      if (isHeic(file)) {
        // Load the converter only when we actually hit a HEIC photo, so it
        // doesn't bloat the page for everyone else.
        setBusy(true);
        const heic2any = (await import('heic2any')).default;
        const out = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        });
        blob = Array.isArray(out) ? out[0] : out;
      }
      const url = URL.createObjectURL(blob);
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setError('Could not read that photo. Try a JPG or PNG.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Consume a photo handed down from a sibling slot's multi-select. The ref
  // guard means a re-render never re-loads (or re-converts) the same file.
  const consumedRef = useRef<File | null>(null);
  useEffect(() => {
    if (!pendingFile || consumedRef.current === pendingFile) return;
    consumedRef.current = pendingFile;
    void loadFile(pendingFile);
  }, [pendingFile, loadFile]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    // This slot takes the first photo; the rest go up to the parent (capped at
    // the room it told us it has).
    const [first, ...rest] = files;
    if (rest.length > 0 && extraSlots > 0) {
      onExtraFiles?.(rest.slice(0, extraSlots));
    }
    await loadFile(first);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {src ? 'Replace photo' : 'Choose / take photo'}
        </button>
        {busy && (
          <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange">
            Converting photo…
          </span>
        )}
        {error && (
          <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange-press">
            {error}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          // Allow HEIC/HEIF explicitly so desktop file dialogs don't hide them.
          accept="image/*,.heic,.heif"
          // Pick several at once; extras become their own markup cards.
          multiple
          // No `capture` attribute: phones then show the full menu (Photo
          // Library / Take Photo / Choose File) instead of forcing the camera.
          className="hidden"
          onChange={onFile}
        />
      </div>

      <div className="mt-3">
        <AnnotationCanvas
          ref={canvasRef}
          src={src}
          placeholder="Choose a job-site photo above to start marking it up."
        />
      </div>
    </div>
  );
}
