import Link from 'next/link';
import { canEditMeetings, requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { listMeetings } from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function MeetingsListPage() {
  const user = await requireHubAccess('hub');
  const meetings = await listMeetings();
  const canEdit = canEditMeetings(user.role);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Meetings
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
          Meetings
        </h1>
        {canEdit && (
          <Link href="/hub/meetings/new" className="bt-btn bt-btn-primary">
            + New Meeting
          </Link>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-fg-2">
        Latest meeting at the top. Older meetings stay archived here and their
        educational topics also appear in the{' '}
        <Link href="/hub/library" className="font-bold text-orange underline">
          training library
        </Link>
        .
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center text-sm text-fg-2">
          No meetings yet.
          {canEdit && (
            <>
              {' '}
              <Link
                href="/hub/meetings/new"
                className="font-bold text-orange hover:underline"
              >
                Create the first one →
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y-2 divide-paper-edge border-y-2 border-ink/80">
          {meetings.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/hub/meetings/${m.slug}`}
                className="block px-1 py-5 transition-colors hover:bg-paper-edge/40"
              >
                <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                  {formatDate(m.date)}
                </p>
                <p className="mt-1 font-headline text-xl font-black text-bark-deep">
                  {m.title}
                </p>
                {m.educational_title && (
                  <p className="mt-1 text-sm text-fg-2">
                    Topic: {m.educational_title}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
