import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { canEditMeetings, requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { getMeetingBySlug, meetingToSlides, tagSlug } from '@/lib/meeting-data';
import { deleteMeeting } from '../actions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Params;
}) {
  const user = await requireHubAccess('hub');
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);
  if (!meeting) notFound();

  const canEdit = canEditMeetings(user.role);
  const slides = meetingToSlides(meeting);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub/meetings" className="hover:underline">
          Meetings
        </Link>
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            {formatDate(meeting.date)}
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
            {meeting.title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {slides.length > 0 && (
            <Link
              href={`/hub/meetings/${slug}/present`}
              className="bt-btn bt-btn-primary"
            >
              ▶ Present
            </Link>
          )}
          {canEdit && (
            <Link
              href={`/hub/meetings/${slug}/edit`}
              className="bt-btn bt-btn-ghost"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      {meeting.educational_title && (
        <section className="mt-10">
          <p className="bt-eyebrow">Educational Topic</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            {meeting.educational_title}
          </h2>
          {meeting.educational_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {meeting.educational_tags.map((t) => (
                <Link
                  key={t}
                  href={`/hub/library?tag=${tagSlug(t)}`}
                  className="rounded-full bg-paper-edge px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep hover:bg-lime/60"
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
          {meeting.educational_body && (
            <div className="prose prose-bratt mt-6 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {meeting.educational_body}
              </ReactMarkdown>
            </div>
          )}
        </section>
      )}

      {meeting.operational_body && (
        <section className="mt-10">
          <p className="bt-eyebrow">Operational Updates</p>
          <div className="prose prose-bratt mt-3 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {meeting.operational_body}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {canEdit && (
        <section className="mt-16 border-t-2 border-paper-edge pt-6">
          <form action={deleteMeeting}>
            <input type="hidden" name="slug" value={meeting.slug} />
            <button
              type="submit"
              className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press hover:underline"
            >
              Delete meeting
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
