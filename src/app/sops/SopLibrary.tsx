'use client';

// ============================================================================
// SOP library — browse + search + upload (client)
// ============================================================================
// The interactive shell of /sops: a live search box, category filter chips,
// the document list, and the upload panel. The corpus is small, so search
// and filtering happen in the browser over the full list handed down by the
// server component — instant, no round-trips.
// ============================================================================

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { FileText, Search, Upload } from 'lucide-react';
import type { SopSummary } from '@/lib/sop-data';
import { uploadSop } from './actions';

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="bt-btn bt-btn-primary" disabled={pending}>
      <Upload className="h-4 w-4" />
      {pending ? 'Uploading…' : 'Add document'}
    </button>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function SopLibrary({
  docs,
  categories,
  error,
}: {
  docs: SopSummary[];
  categories: string[];
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(docs.length === 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeCategory && (d.category ?? '') !== activeCategory) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.category ?? '').toLowerCase().includes(q) ||
        d.excerpt.toLowerCase().includes(q)
      );
    });
  }, [docs, query, activeCategory]);

  return (
    <div>
      {error && (
        <div className="mb-6 rounded-2 border-2 border-orange-press bg-orange-press/10 px-4 py-3 text-sm text-orange-press">
          {error}
        </div>
      )}

      {/* --- Upload panel ---------------------------------------------------- */}
      <div className="mb-8">
        {!showUpload && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="bt-btn bt-btn-ghost"
          >
            <Upload className="h-4 w-4" />
            Add a document
          </button>
        )}

        {showUpload && (
          <div className="bt-card-orange">
            <p className="bt-eyebrow">Add to the library</p>
            <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
              Upload a document
            </h2>
            <p className="mt-2 text-sm text-fg-2">
              Word (<code>.docx</code>) or text (<code>.txt</code>) files. We
              pull the text out automatically and keep your original for
              download. For a PDF, save it as Word first.
            </p>

            <form action={uploadSop} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-semibold text-ink">File</span>
                <input
                  type="file"
                  name="file"
                  accept=".docx,.txt,.md"
                  required
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-bark file:px-3 file:py-1 file:font-headline file:text-xs file:font-extrabold file:uppercase file:tracking-ribbon file:text-cream"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">
                  Title{' '}
                  <span className="font-normal text-fg-3">
                    (optional — defaults to the filename)
                  </span>
                </span>
                <input
                  type="text"
                  name="title"
                  placeholder="e.g. New Customer Intake"
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">
                  Category{' '}
                  <span className="font-normal text-fg-3">(optional)</span>
                </span>
                <input
                  type="text"
                  name="category"
                  list="sop-categories"
                  placeholder="e.g. Dispatch, Billing, HR"
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
                />
                <datalist id="sop-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>

              <div className="flex items-center gap-3 sm:col-span-2">
                <UploadButton />
                {docs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUpload(false)}
                    className="bt-btn bt-btn-ghost"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* --- Search + filters ----------------------------------------------- */}
      {docs.length > 0 && (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-full border-2 border-paper-edge bg-white py-2.5 pl-10 pr-4 text-sm"
            />
          </div>

          {categories.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <FilterChip
                label="All"
                active={activeCategory === null}
                onClick={() => setActiveCategory(null)}
              />
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  label={c}
                  active={activeCategory === c}
                  onClick={() => setActiveCategory(c)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* --- The list ------------------------------------------------------- */}
      {docs.length === 0 ? (
        <p className="text-fg-2">
          No documents yet. Upload your first one above to get started.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-fg-2">No documents match your search.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((d) => (
            <li key={d.id}>
              <Link
                href={`/sops/${d.id}`}
                className="bt-card group flex h-full flex-col transition-colors hover:!border-orange"
              >
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
                  <div className="min-w-0">
                    <h3 className="font-headline text-lg font-black uppercase leading-tight text-bark-deep">
                      {d.title}
                    </h3>
                    {d.category && (
                      <span className="bt-status-neutral mt-1">{d.category}</span>
                    )}
                  </div>
                </div>
                {d.excerpt && (
                  <p className="mt-3 line-clamp-3 text-sm text-fg-2">
                    {d.excerpt}
                  </p>
                )}
                <p className="mt-auto pt-4 text-xs text-fg-3">
                  Updated {fmtDate(d.updated_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
        active
          ? 'border-orange bg-orange text-white'
          : 'border-paper-edge bg-white text-fg-2 hover:border-orange hover:text-orange'
      }`}
    >
      {label}
    </button>
  );
}
