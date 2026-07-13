import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Download, Pencil, Trash2 } from 'lucide-react';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import { getSop } from '@/lib/sop-data';
import { updateSopMeta, deleteSop, downloadSop } from '../actions';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function SopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUseSops(user.role)) redirect('/access-denied');

  const { id } = await params;
  const { error } = await searchParams;
  const doc = await getSop(id);
  if (!doc) notFound();

  return (
    <main className="bt-page">
      <Link
        href="/sops"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      {error && (
        <div className="mt-4 rounded-2 border-2 border-orange-press bg-orange-press/10 px-4 py-3 text-sm text-orange-press">
          {error}
        </div>
      )}

      <header className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {doc.category && <p className="bt-eyebrow">{doc.category}</p>}
          <h1 className="mt-1 font-display text-3xl sm:text-4xl tracking-wide text-ink uppercase">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-fg-3">
            Updated {fmtDate(doc.updated_at)}
            {doc.source_filename && <> · from {doc.source_filename}</>}
          </p>
        </div>

        {doc.storage_path && (
          <form action={downloadSop}>
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit" className="bt-btn bt-btn-ghost">
              <Download className="h-4 w-4" />
              Download original
            </button>
          </form>
        )}
      </header>

      {/* The document body. mammoth emits a safe subset of HTML. */}
      <article
        className="sop-prose"
        dangerouslySetInnerHTML={{ __html: doc.body_html }}
      />

      {/* --- Manage (edit / delete) ---------------------------------------- */}
      <details className="mt-12 border-t-2 border-paper-edge pt-6">
        <summary className="inline-flex cursor-pointer items-center gap-2 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2 hover:text-orange">
          <Pencil className="h-4 w-4" />
          Edit details
        </summary>

        <form action={updateSopMeta} className="mt-4 grid max-w-lg gap-4">
          <input type="hidden" name="id" value={doc.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Title</span>
            <input
              type="text"
              name="title"
              defaultValue={doc.title}
              required
              className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Category</span>
            <input
              type="text"
              name="category"
              defaultValue={doc.category ?? ''}
              placeholder="e.g. Dispatch, Billing, HR"
              className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
            />
          </label>
          <div>
            <button type="submit" className="bt-btn bt-btn-primary">
              Save changes
            </button>
          </div>
        </form>

        <form action={deleteSop} className="mt-6">
          <input type="hidden" name="id" value={doc.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-press hover:underline"
          >
            <Trash2 className="h-4 w-4" />
            Delete this document
          </button>
        </form>
      </details>
    </main>
  );
}
