import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { PresentationDeck } from '@/components/PresentationDeck';
import { getMeetingBySlug, meetingToSlides } from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export default async function PresentMeetingPage({
  params,
}: {
  params: Params;
}) {
  await requireHubAccess('hub');
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);
  if (!meeting) notFound();

  const slides = meetingToSlides(meeting);

  return (
    <PresentationDeck
      slides={slides}
      meetingTitle={meeting.title}
      exitHref={`/hub/meetings/${slug}`}
    />
  );
}
