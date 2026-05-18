'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

type Topic = {
  meetingSlug: string;
  meetingDate: string;
  title: string;
  tags: string[];
  tagSlugs: string[];
};

export function LibraryFilter({
  topics,
  allTags,
}: {
  topics: Topic[];
  allTags: { label: string; slug: string }[];
}) {
  const sp = useSearchParams();
  const activeTag = sp.get('tag') ?? 'all';

  const visible = useMemo(() => {
    if (activeTag === 'all') return topics;
    return topics.filter((t) => t.tagSlugs.includes(activeTag));
  }, [topics, activeTag]);

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

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={chipHref('all')} className={chipClasses('all')} scroll={false}>
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
          {visible.map((t) => (
            <li key={t.meetingSlug}>
              <Link
                href={`/hub/meetings/${t.meetingSlug}`}
                className="bt-card flex h-full flex-col gap-2 transition-colors hover:!border-orange"
              >
                <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                  {formatDate(t.meetingDate)}
                </p>
                <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
                  {t.title}
                </h2>
                {t.tags.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    {t.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-paper-edge px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
