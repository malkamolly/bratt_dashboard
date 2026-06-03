'use client';

// ============================================================================
// PhotoPicker
// ============================================================================
// The "photo" half of the Site Markup tool. The arborist picks a photo from
// their device (or snaps one on a phone), and it flows into an AnnotationCanvas
// to mark up the tree, drop zone, no-park area, etc.
//
// The photo never leaves the browser until the final download/print — we just
// turn the chosen file into a temporary in-memory URL. Nothing is uploaded to
// Supabase, which keeps this simple and private.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
} from './AnnotationCanvas';

type Props = {
  canvasRef: RefObject<AnnotationCanvasHandle | null>;
};

export function PhotoPicker({ canvasRef }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  // Free the temporary object URL when it's replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bt-btn bt-btn-primary"
        >
          {src ? 'Replace photo' : 'Choose / take photo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          // `capture` hints phones to offer the camera directly.
          capture="environment"
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
