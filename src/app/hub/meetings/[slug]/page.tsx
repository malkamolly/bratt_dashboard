import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEditMeetings, requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { DeleteMeetingButton } from '@/components/DeleteMeetingButton';
import { getMeetingBySlug, splitIntoSlides } from '@/lib/meeting-data';
import { getTopicDeck } from '@/lib/topic-deck';

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
  const educationalSlides = splitIntoSlides(
    meeting.educational_body,
    'educational',
  );
  const operationalSlides = splitIntoSlides(
    meeting.operational_body,
    'operational',
  );
  // If the meeting is linked to a topic deck, look it up so we can show its
  // title and link straight to the deck presenter instead of the inline
  // educational section.
  const linkedDeck = meeting.topic_slug
    ? getTopicDeck(meeting.topic_slug)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/hub/meetings"
        className="bt-eyebrow inline-block hover:underline"
      >
        ← Back to Meetings
      </Link>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
        {formatDate(meeting.date)}
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
          {meeting.title}
        </h1>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/hub/meetings/${slug}/edit`}
              className="bt-btn bt-btn-ghost"
            >
              Edit
            </Link>
          </div>
        )}
      </div>
      <p className="mt-3 text-fg-2">Click a topic to present.</p>

      <div className="mt-8 space-y-4">
        {linkedDeck ? (
          <SectionCard
            href={`/topics/${linkedDeck.slug}/present`}
            eyebrow="Topic Deck"
            title={linkedDeck.title}
            tags={linkedDeck.tags}
            slideCountLabel="Library deck"
          />
        ) : (
          meeting.educational_title &&
          educationalSlides.length > 0 && (
            <SectionCard
              href={`/hub/meetings/${slug}/present/educational`}
              eyebrow="Educational Topic"
              title={meeting.educational_title}
              tags={meeting.educational_tags}
              slideCountLabel={`${educationalSlides.length + 1} slides`}
            />
          )
        )}
        {operationalSlides.length > 0 && (
          <SectionCard
            href={`/hub/meetings/${slug}/present/operational`}
            eyebrow="Operational Updates"
            title="This Week's Updates"
            tags={[]}
            slideCountLabel={`${operationalSlides.length + 1} slides`}
          />
        )}
        {!linkedDeck && !meeting.educational_title && operationalSlides.length === 0 && (
          <p className="rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center text-sm text-fg-2">
            This meeting doesn&apos;t have any slides yet.
            {canEdit && (
              <>
                {' '}
                <Link
                  href={`/hub/meetings/${slug}/edit`}
                  className="font-bold text-orange hover:underline"
                >
                  Edit it →
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {canEdit && (
        <section className="mt-16 border-t-2 border-paper-edge pt-6">
          <DeleteMeetingButton slug={meeting.slug} title={meeting.title} />
        </section>
      )}
    </main>
  );
}

function SectionCard({
  href,
  eyebrow,
  title,
  tags,
  slideCountLabel,
}: {
  href: string;
  eyebrow: string;
  title: string;
  tags: string[];
  slideCountLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-card border-[3px] border-lime bg-bark p-6 transition-colors hover:border-orange"
    >
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-3xl uppercase tracking-wider text-cream sm:text-4xl">
        {title}
      </h2>
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-lime/20 px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-6 flex items-center gap-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange group-hover:text-cream">
        <span>Click to present</span>
        <span aria-hidden>→</span>
        <span className="ml-auto text-cream/60">{slideCountLabel}</span>
      </p>
    </Link>
  );
}
