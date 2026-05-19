'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadSalespersonPhoto } from '@/app/admin/actions';

type Props = {
  salespersonId: string;
  currentPhotoUrl: string | null;
  fallbackInitial: string;
};

export function SalespersonPhotoUpload({
  salespersonId,
  currentPhotoUrl,
  fallbackInitial,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(currentPhotoUrl);
  const [, startTransition] = useTransition();

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('id', salespersonId);
      fd.append('file', file);
      const result = await uploadSalespersonPhoto(fd);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setPhoto(result.url);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-paper-edge"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bark text-cream font-display text-sm uppercase ring-1 ring-paper-edge">
          {fallbackInitial}
        </div>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="rounded-full border-2 border-paper-edge bg-white px-2.5 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2 transition-colors hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Uploading…' : photo ? 'Replace' : 'Upload'}
      </button>
      {error && (
        <span
          title={error}
          className="max-w-[10rem] truncate font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press"
        >
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
