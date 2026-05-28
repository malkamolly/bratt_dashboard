import { Suspense } from 'react';
import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { listMeetings, listTags, tagSlug } from '@/lib/meeting-data';
import { listTopicDecks } from '@/lib/topic-deck';
import { LibraryFilter, type LibraryEntry } from './LibraryFilter';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireHubAccess('hub');

  const [meetings, tagsRaw] = await Promise.all([listMeetings(), listTags()]);

  // For each topic deck, find the most recent meeting that linked to it.
  // This lets the topic-deck card show "Presented at [date] meeting" as a
  // cross-link when the connection exists.
  const linkedMeetingByDeckSlug = new Map<
    string,
    { slug: string; date: string }
  >();
  for (const m of meetings) {
    if (m.topic_slug && !linkedMeetingByDeckSlug.has(m.topic_slug)) {
      linkedMeetingByDeckSlug.set(m.topic_slug, {
        slug: m.slug,
        date: m.date,
      });
    }
  }

  // Topic decks (standalone slide decks authored in /content/topics) and
  // meeting-derived educational topics get merged into one list sorted by
  // date so the library reads like a single chronological feed.
  const topicEntries: LibraryEntry[] = listTopicDecks().map((d) => {
    const linked = linkedMeetingByDeckSlug.get(d.slug);
    return {
      kind: 'topic' as const,
      slug: d.slug,
      href: `/topics/${d.slug}/present`,
      date: d.date,
      title: d.title,
      description: d.description,
      tags: d.tags,
      tagSlugs: d.tags.map(tagSlug),
      linkedMeetingSlug: linked?.slug ?? null,
      linkedMeetingDate: linked?.date ?? null,
    };
  });

  // Meeting-derived entries only show up for meetings that wrote inline
  // educational content — meetings that linked to a topic deck are already
  // represented by the deck's own entry, so showing them here would create
  // a duplicate.
  const meetingEntries: LibraryEntry[] = meetings
    .filter((m) => m.educational_title && !m.topic_slug)
    .map((m) => ({
      kind: 'meeting',
      slug: m.slug,
      href: `/hub/meetings/${m.slug}`,
      date: m.date,
      title: m.educational_title!,
      description: null,
      tags: m.educational_tags,
      tagSlugs: m.educational_tags.map(tagSlug),
      linkedMeetingSlug: null,
      linkedMeetingDate: null,
    }));

  const entries = [...topicEntries, ...meetingEntries].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  // Build the tag list from both sources so topic-only tags also show as chips.
  const tagSet = new Set<string>(tagsRaw);
  for (const t of topicEntries.flatMap((e) => e.tags)) tagSet.add(t);
  const allTags = Array.from(tagSet)
    .sort()
    .map((t) => ({ label: t, slug: tagSlug(t) }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Library
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Training Library
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Topic decks and educational topics from every weekly meeting, newest
        first. Click a tag to narrow the list.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/library" />
      </div>

      <Suspense fallback={null}>
        <LibraryFilter entries={entries} allTags={allTags} />
      </Suspense>
    </main>
  );
}
