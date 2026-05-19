import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canEditMeetings, getAllowedUser } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { MeetingForm } from '@/components/MeetingForm';
import { FlashBanner } from '@/components/admin-shared';
import { getMeetingBySlug, listTags } from '@/lib/meeting-data';
import { updateMeeting } from '../../actions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type Search = Promise<{ error?: string }>;

export default async function EditMeetingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditMeetings(user.role)) redirect('/access-denied');

  const { slug } = await params;
  const sp = await searchParams;
  const [meeting, knownTags] = await Promise.all([
    getMeetingBySlug(slug),
    listTags(),
  ]);
  if (!meeting) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub/meetings" className="hover:underline">
          Meetings
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/hub/meetings/${slug}`} className="hover:underline">
          {meeting.title}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Edit Meeting
      </h1>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      <FlashBanner error={sp.error} />

      <div className="mt-6">
        <MeetingForm
          action={updateMeeting}
          initial={{
            date: meeting.date,
            title: meeting.title,
            slug: meeting.slug,
            educational_title: meeting.educational_title,
            educational_tags: meeting.educational_tags,
            educational_body: meeting.educational_body,
            operational_body: meeting.operational_body,
          }}
          knownTags={knownTags}
          cancelHref={`/hub/meetings/${slug}`}
          submitLabel="Save changes"
        />
      </div>
    </main>
  );
}
