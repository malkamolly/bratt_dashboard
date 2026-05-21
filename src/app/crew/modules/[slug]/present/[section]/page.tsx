// ============================================================================
// Slide presenter — /crew/modules/[slug]/present/[section]
// ============================================================================

import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { getTrainingModule, listModuleSlides } from '@/lib/crew-data';
import { TrainingPresenter } from '@/components/crew/TrainingPresenter';

export const dynamic = 'force-dynamic';

const SECTION_LABELS: Record<string, string> = {
  intro: 'Intro',
  equipment: 'Equipment',
  safety: 'Safety',
  operations: 'Operations',
  maintenance: 'Maintenance',
  best_practices: 'Best Practices',
  closing: 'Closing',
};

const SECTION_ORDER = [
  'intro',
  'equipment',
  'safety',
  'operations',
  'maintenance',
  'best_practices',
  'closing',
];

export default async function PresenterPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  await requireHubAccess('crew');
  const { slug, section } = await params;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();

  const allSlides = await listModuleSlides(slug);
  const slides = allSlides.filter((s) => (s.section ?? 'intro') === section);
  if (slides.length === 0) notFound();

  // Compute the next non-empty section so the presenter can offer a
  // "Next section →" button at the end of the current one.
  const sectionsPresent = new Set(
    allSlides.map((s) => s.section ?? 'intro'),
  );
  const order = SECTION_ORDER.filter((s) => sectionsPresent.has(s));
  const currentIdx = order.indexOf(section);
  const nextSection = currentIdx >= 0 ? order[currentIdx + 1] : undefined;
  const nextSectionHref = nextSection
    ? `/crew/modules/${slug}/present/${nextSection}`
    : null;

  return (
    <TrainingPresenter
      moduleName={mod.name}
      sectionLabel={SECTION_LABELS[section] ?? section}
      slides={slides.map((s) => ({
        id: s.id,
        position: s.position,
        section: s.section,
        title: s.title,
        body: s.body,
      }))}
      exitHref={`/crew/modules/${slug}`}
      nextSectionHref={nextSectionHref}
    />
  );
}
