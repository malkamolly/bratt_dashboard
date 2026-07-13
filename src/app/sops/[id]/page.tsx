import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, Download, List, Pencil } from 'lucide-react';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import { getSop, splitDocument } from '@/lib/sop-data';
import { downloadSop } from '../actions';

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

  const { intro, sections, toc } = splitDocument(doc.body_html);
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

        <div className="flex items-center gap-3">
          {doc.storage_path && (
            <form action={downloadSop}>
              <input type="hidden" name="id" value={doc.id} />
              <button type="submit" className="bt-btn bt-btn-ghost">
                <Download className="h-4 w-4" />
                Download original
              </button>
            </form>
          )}
          <Link href={`/sops/${doc.id}/edit`} className="bt-btn bt-btn-primary">
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2 border-2 border-orange-press bg-orange-press/10 px-4 py-3 text-sm text-orange-press">
          {error}
        </div>
      )}

      {/* --- Hero header --------------------------------------------------- */}
      <header className="overflow-hidden rounded-card bg-bark shadow-sh-2">
        <div className="h-2 bg-orange" />
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          {doc.category && (
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
              {doc.category}
            </p>
          )}
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-wide text-cream sm:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-3 text-sm text-cream/60">
            Updated {fmtDate(doc.updated_at)}
            {doc.source_filename && <> · from {doc.source_filename}</>}
          </p>
        </div>
      </header>

      <div
        className={
          hasToc
            ? 'mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10'
            : 'mx-auto mt-8 max-w-4xl'
        }
      >
        {/* --- Table of contents (desktop sidebar) ------------------------- */}
        {hasToc && (
          <aside className="hidden lg:block">
            <nav className="sticky top-8">
              <p className="bt-eyebrow mb-3">Sections</p>
              <ol className="space-y-1 border-l-2 border-paper-edge">
                {toc.map((item, i) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="-ml-0.5 flex gap-2 border-l-2 border-transparent py-1 pl-3 text-sm text-fg-2 transition-colors hover:border-orange hover:text-orange"
                    >
                      <span className="font-headline font-extrabold text-fg-3">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}

        {/* --- Main column -------------------------------------------------- */}
        <div>
          {/* Collapsible section list on mobile */}
          {hasToc && (
            <details className="mb-6 rounded-card border-2 border-paper-edge bg-paper px-4 py-3 lg:hidden">
              <summary className="inline-flex cursor-pointer items-center gap-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                <List className="h-4 w-4" />
                Jump to a section
              </summary>
              <ol className="mt-3 space-y-1">
                {toc.map((item, i) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="flex gap-2 py-1 text-sm text-fg-2 hover:text-orange"
                    >
                      <span className="font-headline font-extrabold text-fg-3">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {/* Intro / lead-in (content before the first section heading) */}
          {intro && (
            <div className="bt-card-orange mb-6">
              <div
                className="sop-prose sop-prose-lead"
                dangerouslySetInnerHTML={{ __html: intro }}
              />
            </div>
          )}

          {/* One card per section */}
          {sections.length > 0 ? (
            <div className="space-y-6">
              {sections.map((s, i) => (
                <section
                  key={s.id}
                  id={s.id}
                  className="bt-card scroll-mt-24"
                >
                  <div className="mb-4 flex items-center gap-4 border-b-2 border-paper-edge/70 pb-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange font-headline text-lg font-black text-cream shadow-sh-1">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h2 className="font-headline text-xl font-black uppercase leading-tight tracking-wide text-bark-deep sm:text-2xl">
                      {s.title}
                    </h2>
                  </div>
                  <div
                    className="sop-prose"
                    dangerouslySetInnerHTML={{ __html: s.html }}
                  />
                </section>
              ))}
            </div>
          ) : (
            // No detectable sections — render the whole body as one card.
            !intro && (
              <div className="bt-card">
                <div
                  className="sop-prose"
                  dangerouslySetInnerHTML={{ __html: doc.body_html }}
                />
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
