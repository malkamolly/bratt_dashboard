import { Suspense } from 'react';
import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { listMeetings, listTags, tagSlug } from '@/lib/meeting-data';
import { LibraryFilter } from './LibraryFilter';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireHubAccess('hub');

  const [meetings, tagsRaw] = await Promise.all([listMeetings(), listTags()]);
  const topics = meetings
    .filter((m) => m.educational_title)
    .map((m) => ({
      meetingSlug: m.slug,
      meetingDate: m.date,
      title: m.educational_title!,
      tags: m.educational_tags,
      tagSlugs: m.educational_tags.map(tagSlug),
    }));

  const allTags = tagsRaw.map((t) => ({ label: t, slug: tagSlug(t) }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
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
        Educational topic from every weekly meeting. Click a tag to narrow the
        list.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/library" />
      </div>

      <Suspense fallback={null}>
        <LibraryFilter topics={topics} allTags={allTags} />
      </Suspense>
    </main>
  );
}
