'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMON_SPECIES,
  MAX_PHOTOS_PER_TREE,
  MIN_PHOTOS_PER_TREE,
  SPRAY_HEIGHT_LIMIT_FT,
  type Tree,
} from '@/lib/partner-types';
import { FIELD, LABEL } from './ProposalForm';
import { createTreeAction, updateTreeAction } from '@/app/partner/actions';

/**
 * Add or edit one tree, photos included.
 *
 * WHY THIS ISN'T A PLAIN SERVER-ACTION FORM: a tree needs at least one photo,
 * and photos are big. So this is a two-step submit the user never sees —
 * save the tree's measurements, then upload each photo against the new row via
 * /partner/photos, reporting per-file progress. Doing it in one server-action
 * post would push several megabytes through the React runtime and give the rep
 * no idea which photo failed on a weak signal.
 *
 * Photos are downscaled and re-encoded in the browser BEFORE upload. A modern
 * phone produces 8–12 MB images; Vercel rejects request bodies over ~4.5 MB
 * before our code runs. Resizing to 1600px on the long edge lands around 300 KB
 * with no loss of anything Connor needs to see.
 */

/** Long edge, in pixels, after downscaling. Plenty for judging a tree. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type Pending = {
  key: string;
  /** Local preview URL, revoked once uploaded. */
  preview: string;
  blob: Blob;
  status: 'ready' | 'uploading' | 'done' | 'error';
  error?: string;
};

function isHeic(file: File): boolean {
  return (
    /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

/** Draw the image to a canvas at a capped size and re-encode as JPEG. */
async function downscale(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  return out ?? blob;
}

let keySeq = 0;

export function TreeForm({
  proposalId,
  tree,
}: {
  proposalId: string;
  tree?: Tree;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const editing = !!tree;
  const existingCount = tree?.photos.length ?? 0;

  const [pending, setPending] = useState<Pending[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heightWarning, setHeightWarning] = useState(false);
  const [saving, startSaving] = useTransition();

  const totalPhotos = existingCount + pending.filter((p) => p.status !== 'error').length;
  const needsPhoto = totalPhotos < MIN_PHOTOS_PER_TREE;
  const roomLeft = MAX_PHOTOS_PER_TREE - totalPhotos;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    setError(null);
    setPreparing(true);
    try {
      const accepted = files.slice(0, Math.max(0, roomLeft));
      if (accepted.length < files.length) {
        setError(`Up to ${MAX_PHOTOS_PER_TREE} photos per tree.`);
      }

      for (const file of accepted) {
        let blob: Blob = file;

        // iPhones shoot HEIC, which browsers can't draw to a canvas. Convert
        // first, loading the converter only when we actually hit one.
        if (isHeic(file)) {
          const heic2any = (await import('heic2any')).default;
          const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
          blob = Array.isArray(out) ? out[0] : out;
        }

        blob = await downscale(blob);
        keySeq += 1;
        setPending((prev) => [
          ...prev,
          {
            key: `p${keySeq}`,
            preview: URL.createObjectURL(blob),
            blob,
            status: 'ready',
          },
        ]);
      }
    } catch {
      setError('Could not read that photo. Try a JPG, or take it again.');
    } finally {
      setPreparing(false);
    }
  }

  function removePending(key: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.key === key);
      if (hit) URL.revokeObjectURL(hit.preview);
      return prev.filter((p) => p.key !== key);
    });
  }

  /** Uploads one photo, returning true on success. */
  async function upload(treeId: string, item: Pending): Promise<boolean> {
    setPending((prev) =>
      prev.map((p) => (p.key === item.key ? { ...p, status: 'uploading' } : p)),
    );

    const body = new FormData();
    body.set('treeId', treeId);
    body.set('photo', new File([item.blob], `${item.key}.jpg`, { type: 'image/jpeg' }));

    try {
      const res = await fetch('/partner/photos', { method: 'POST', body });

      // A redirect here means the session lapsed and we were sent to the login
      // page. fetch follows it and reports 200, so checking res.ok alone would
      // report a silent success for a photo that was never stored.
      if (res.redirected || !res.headers.get('content-type')?.includes('json')) {
        throw new Error('Your session timed out. Sign in again, then retry.');
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Upload failed.');
      }
      setPending((prev) =>
        prev.map((p) => (p.key === item.key ? { ...p, status: 'done' } : p)),
      );
      return true;
    } catch (e) {
      setPending((prev) =>
        prev.map((p) =>
          p.key === item.key
            ? { ...p, status: 'error', error: e instanceof Error ? e.message : 'Upload failed.' }
            : p,
        ),
      );
      return false;
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (needsPhoto) {
      setError('Add at least one photo of this tree.');
      return;
    }

    const form = new FormData(e.currentTarget);
    form.set('proposalId', proposalId);
    if (tree) form.set('id', tree.id);

    // Step 1 — save the measurements.
    const result = editing
      ? await updateTreeAction({ error: null }, form)
      : await createTreeAction({ error: null }, form);

    if (result.error || !result.treeId) {
      setError(result.error ?? 'Could not save the tree.');
      return;
    }

    // Step 2 — upload whatever photos are waiting, one at a time so a phone on
    // a weak connection isn't fighting itself.
    const queue = pending.filter((p) => p.status !== 'done');
    let allOk = true;
    for (const item of queue) {
      const ok = await upload(result.treeId, item);
      if (!ok) allOk = false;
    }

    if (!allOk) {
      setError(
        'The tree was saved but some photos did not upload. Retry them below.',
      );
      return;
    }

    startSaving(() => {
      router.push(`/partner/proposals/${proposalId}`);
      router.refresh();
    });
  }

  const busy = preparing || saving || pending.some((p) => p.status === 'uploading');

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-7">
      <div>
        <label className={LABEL} htmlFor="label">
          Which tree
        </label>
        <input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={tree?.label ?? ''}
          placeholder="e.g. Front maple, NE corner"
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-fg-3">
          How the crew finds it on arrival. &ldquo;Tree 3&rdquo; is not
          directions.
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="species">
          Species
        </label>
        <input
          id="species"
          name="species"
          type="text"
          list="php-species"
          defaultValue={tree?.species ?? ''}
          placeholder="e.g. Silver Maple"
          className={FIELD}
        />
        <datalist id="php-species">
          {COMMON_SPECIES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="mt-1.5 text-xs text-fg-3">
          Best guess is fine. Many treatments are species-specific, so this helps
          us confirm the right one.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="dbh">
            Trunk diameter (in)
          </label>
          <input
            id="dbh"
            name="dbh"
            type="text"
            inputMode="decimal"
            required
            defaultValue={tree?.dbh ? String(tree.dbh) : ''}
            placeholder="14"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-fg-3">DBH, about 4.5 ft up.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="heightFt">
            Height (ft)
          </label>
          <input
            id="heightFt"
            name="heightFt"
            type="text"
            inputMode="decimal"
            defaultValue={tree?.heightFt ? String(tree.heightFt) : ''}
            placeholder="30"
            className={FIELD}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ''));
              setHeightWarning(Number.isFinite(n) && n > SPRAY_HEIGHT_LIMIT_FT);
            }}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="crownSpreadFt">
            Crown spread (ft)
          </label>
          <input
            id="crownSpreadFt"
            name="crownSpreadFt"
            type="text"
            inputMode="decimal"
            defaultValue={tree?.crownSpreadFt ? String(tree.crownSpreadFt) : ''}
            placeholder="25"
            className={FIELD}
          />
        </div>
      </div>

      {heightWarning && (
        <p className="rounded-2 border-2 border-status-warn bg-status-warn/10 px-3 py-2.5 text-sm text-fg-1">
          <strong>Over {SPRAY_HEIGHT_LIMIT_FT} ft.</strong> Spray pricing
          doesn&apos;t apply to trees this tall &mdash; those lines come back as
          &ldquo;Bratt to quote&rdquo; instead of a price. Enter it anyway;
          we&apos;ll sort it out.
        </p>
      )}

      {/* ---- Photos ---- */}
      <div className="bt-card !p-5">
        <h2 className={LABEL}>
          Photos{' '}
          <span className="text-fg-3">
            (at least {MIN_PHOTOS_PER_TREE}, up to {MAX_PHOTOS_PER_TREE})
          </span>
        </h2>
        <p className="mt-2 text-xs text-fg-2">
          A photo of the whole tree, plus anything that looks wrong &mdash; leaves,
          bark, dieback. This is what our arborist checks the treatment against.
        </p>

        {(existingCount > 0 || pending.length > 0) && (
          <ul className="mt-4 flex flex-wrap gap-3">
            {tree?.photos.map((p) => (
              <li
                key={p.id}
                className="h-24 w-24 overflow-hidden rounded-2 border-2 border-paper-edge bg-white"
              >
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed
                  // URL from a private bucket; next/image would need a loader.
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                )}
              </li>
            ))}
            {pending.map((p) => (
              <li key={p.key} className="relative h-24 w-24">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img
                  src={p.preview}
                  alt=""
                  className={`h-full w-full rounded-2 border-2 object-cover ${
                    p.status === 'error' ? 'border-orange-press' : 'border-paper-edge'
                  } ${p.status === 'uploading' ? 'opacity-50' : ''}`}
                />
                {p.status === 'ready' && (
                  <button
                    type="button"
                    onClick={() => removePending(p.key)}
                    aria-label="Remove photo"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper-edge bg-white text-fg-2 hover:border-orange-press hover:bg-orange-press hover:text-white"
                  >
                    &times;
                  </button>
                )}
                {p.status === 'uploading' && (
                  <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[0.6rem] font-bold uppercase tracking-ribbon text-cream">
                    Sending
                  </span>
                )}
                {p.status === 'done' && (
                  <span className="absolute inset-x-0 bottom-0 bg-green-dark py-0.5 text-center text-[0.6rem] font-bold uppercase tracking-ribbon text-white">
                    Saved
                  </span>
                )}
                {p.status === 'error' && (
                  <span className="absolute inset-x-0 bottom-0 bg-orange-press py-0.5 text-center text-[0.6rem] font-bold uppercase tracking-ribbon text-white">
                    Failed
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={onPick}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={preparing || roomLeft <= 0}
          className="bt-btn bt-btn-ghost mt-4 disabled:opacity-50"
        >
          {preparing
            ? 'Preparing…'
            : roomLeft <= 0
              ? 'Photo limit reached'
              : existingCount + pending.length > 0
                ? 'Add another photo'
                : 'Take or choose photos'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2.5 text-sm font-bold text-orange-press"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="bt-btn bt-btn-primary justify-center disabled:opacity-60"
        >
          {busy ? 'Saving…' : editing ? 'Save Tree' : 'Add Tree'}
        </button>
        {needsPhoto && (
          <span className="text-xs font-bold text-orange-press">
            One photo minimum
          </span>
        )}
      </div>
    </form>
  );
}
