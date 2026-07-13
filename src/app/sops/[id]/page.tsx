import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Download, List, Pencil, Trash2 } from 'lucide-react';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import { getSop, buildToc } from '@/lib/sop-data';
import { updateSopMeta, deleteSop, downloadSop } from '../actions';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const TOC_INDENT: Record<number, string> = { 1: 'pl-3', 2: 'pl-6', 3: 'pl-9' };

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

  const { html, toc } = buildToc(doc.body_html);
  const hasToc = toc.length >= 3;

  return (
    <main className="bt-page">
      {/* --- Toolbar -------------------------------------------------------- */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sops"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-orange"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to library
        </Link>

        {doc.storage_path && (
          <form action={downloadSop}>
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit" className="bt-btn bt-btn-ghost">
              <Download className="h-4 w-4" />
              Download original
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-2 border-2 border-orange-press bg-orange-press/10 px-4 py-3 text-sm text-orange-press">
          {error}
        </div>
      )}

      <div
        className={
          hasToc
            ? 'lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10'
            : 'mx-auto max-w-4xl'
        }
      >
        {/* --- Table of contents (desktop sidebar) ------------------------- */}
        {hasToc && (
          <aside className="hidden lg:block">
            <nav className="sticky top-8">
              <p className="bt-eyebrow mb-3">On this page</p>
              <ul className="border-l-2 border-paper-edge">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`-ml-0.5 block border-l-2 border-transparent py-1 ${
                        TOC_INDENT[item.level] ?? 'pl-3'
                      } text-sm text-fg-2 transition-colors hover:border-orange hover:text-orange`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}

        {/* --- Main column -------------------------------------------------- */}
        <div>
          {/* Collapsible TOC on mobile */}
          {hasToc && (
            <details className="mb-6 rounded-card border-2 border-paper-edge bg-paper px-4 py-3 lg:hidden">
              <summary className="inline-flex cursor-pointer items-center gap-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                <List className="h-4 w-4" />
                On this page
              </summary>
              <ul className="mt-3 border-l-2 border-paper-edge">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`block py-1 ${
                        TOC_INDENT[item.level] ?? 'pl-3'
                      } text-sm text-fg-2 hover:text-orange`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* The document, on its own paper sheet */}
          <article className="rounded-card border-2 border-paper-edge bg-white px-6 py-10 shadow-sh-2 sm:px-12 sm:py-14">
            <div className="mx-auto max-w-[68ch]">
              <header className="mb-8 border-b-2 border-paper-edge pb-6">
                {doc.category && <p className="bt-eyebrow">{doc.category}</p>}
                <h1 className="mt-2 font-display text-3xl leading-tight tracking-wide text-ink sm:text-4xl">
                  {doc.title}
                </h1>
                <p className="mt-3 text-sm text-fg-3">
                  Updated {fmtDate(doc.updated_at)}
                  {doc.source_filename && <> · from {doc.source_filename}</>}
                </p>
              </header>

              {/* mammoth emits a safe subset of HTML (no scripts/styles). */}
              <div
                className="sop-prose"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </article>

          {/* --- Manage (edit / delete) ------------------------------------ */}
          <details className="mt-10 border-t-2 border-paper-edge pt-6">
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
        </div>
      </div>
    </main>
  );
}
