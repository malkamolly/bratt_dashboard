'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export type LibraryEntry = {
  /** "topic" = standalone topic deck; "meeting" = meeting's educational section */
  kind: 'topic' | 'meeting';
  slug: string;
  /** Where the card links — for topics this opens the deck directly; for
   *  meetings it goes to the meeting detail page (with its present link). */
  href: string;
  /** YYYY-MM-DD — used for sort + the date pill on the card */
  date: string;
  title: string;
  /** Short blurb shown on the card; meeting entries don't have one */
  description: string | null;
  tags: string[];
  tagSlugs: string[];
  /** If a topic deck is linked to a meeting, the meeting slug + date —
   *  shown as a "Presented at..." cross-link on the card. */
  linkedMeetingSlug: string | null;
  linkedMeetingDate: string | null;
};

export function LibraryFilter({
  entries,
  allTags,
}: {
  entries: LibraryEntry[];
  allTags: { label: string; slug: string }[];
}) {
  const sp = useSearchParams();
  const activeTag = sp.get('tag') ?? 'all';

  const visible = useMemo(() => {
    if (activeTag === 'all') return entries;
    return entries.filter((e) => e.tagSlugs.includes(activeTag));
  }, [entries, activeTag]);

  function chipClasses(slug: string) {
    const base =
      'rounded-full border-2 px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon transition-colors';
    return activeTag === slug
      ? `${base} border-orange bg-orange text-cream`
      : `${base} border-paper-edge bg-white text-fg-2 hover:border-orange hover:text-orange`;
  }

  function chipHref(slug: string) {
    return slug === 'all' ? '/hub/library' : `/hub/library?tag=${slug}`;
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m] = iso.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  function formatFullDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={chipHref('all')}
          className={chipClasses('all')}
          scroll={false}
        >
          All
        </Link>
        {allTags.map((t) => (
          <Link
            key={t.slug}
            href={chipHref(t.slug)}
            className={chipClasses(t.slug)}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card border-2 border-dashed border-paper-edge bg-paper p-6 text-center text-sm text-fg-2">
          No topics match that tag yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {visible.map((e) => (
            <li key={`${e.kind}-${e.slug}`}>
              <Link
                href={e.href}
                className="bt-card flex h-full flex-col gap-2 transition-colors hover:!border-orange"
              >
                <div className="flex items-center gap-2">
                  <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                    {formatDate(e.date)}
                  </p>
                  {e.kind === 'topic' && (
                    <span className="rounded-full bg-lime/20 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep">
                      Deck
                    </span>
                  )}
                </div>
                <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
                  {e.title}
                </h2>
                {e.description && (
                  <p className="text-sm text-fg-2">{e.description}</p>
                )}
                {e.tags.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    {e.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-paper-edge px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {e.linkedMeetingSlug && e.linkedMeetingDate && (
                  <p className="pt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Presented {formatFullDate(e.linkedMeetingDate)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
