import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canEditMeetings, getAllowedUser } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { MeetingForm } from '@/components/MeetingForm';
import { FlashBanner } from '@/components/admin-shared';
import { listTags } from '@/lib/meeting-data';
import { createMeeting } from '../actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ error?: string }>;

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditMeetings(user.role)) redirect('/access-denied');

  const sp = await searchParams;
  const knownTags = await listTags();

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
        New
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        New Meeting
      </h1>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      <FlashBanner error={sp.error} />

      <div className="mt-6">
        <MeetingForm
          action={createMeeting}
          knownTags={knownTags}
          cancelHref="/hub/meetings"
          submitLabel="Create meeting"
        />
      </div>
    </main>
  );
}
