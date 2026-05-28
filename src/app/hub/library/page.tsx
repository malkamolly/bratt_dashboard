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

  // Topic decks (standalone slide decks authored in /content/topics) and
  // meeting-derived educational topics get merged into one list sorted by
  // date so the library reads like a single chronological feed.
  const topicEntries: LibraryEntry[] = listTopicDecks().map((d) => ({
    kind: 'topic',
    slug: d.slug,
    href: `/topics/${d.slug}/present`,
    date: d.date,
    title: d.title,
    description: d.description,
    tags: d.tags,
    tagSlugs: d.tags.map(tagSlug),
    meetingSlug: d.meetingSlug ?? null,
  }));

  const meetingEntries: LibraryEntry[] = meetings
    .filter((m) => m.educational_title)
    .map((m) => ({
      kind: 'meeting',
      slug: m.slug,
      href: `/hub/meetings/${m.slug}`,
      date: m.date,
      title: m.educational_title!,
      description: null,
      tags: m.educational_tags,
      tagSlugs: m.educational_tags.map(tagSlug),
      meetingSlug: m.slug,
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
