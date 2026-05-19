import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { PresentationDeck } from '@/components/PresentationDeck';
import {
  getMeetingBySlug,
  splitIntoSlides,
  type Slide,
} from '@/lib/meeting-data';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; section: string }>;

export default async function PresentSectionPage({
  params,
}: {
  params: Params;
}) {
  await requireHubAccess('hub');
  const { slug, section } = await params;
  if (section !== 'educational' && section !== 'operational') notFound();

  const meeting = await getMeetingBySlug(slug);
  if (!meeting) notFound();

  // Build a cover slide for the section, then the content slides.
  const isEducational = section === 'educational';
  const body = isEducational
    ? meeting.educational_body
    : meeting.operational_body;
  const contentSlides = splitIntoSlides(body, section);
  if (contentSlides.length === 0) notFound();

  const cover = {
    kind: 'cover' as const,
    section: section as Slide['section'],
    eyebrow: isEducational ? 'Educational Topic' : 'Operational Updates',
    title: isEducational
      ? meeting.educational_title ?? 'Educational Topic'
      : "This Week's Updates",
    tags: isEducational ? meeting.educational_tags : [],
    meetingDate: meeting.date,
  };

  return (
    <PresentationDeck
      cover={cover}
      slides={contentSlides}
      meetingTitle={meeting.title}
      exitHref={`/hub/meetings/${slug}`}
    />
  );
}
