// ============================================================================
// Slide presenter — /crew/modules/[slug]/present
// ============================================================================
// Renders the designed slide deck inside an iframe. The iframe's src points
// at /api/training-deck/[slug], which returns the HTML harness for the
// vanilla-JS renderer in /public/training-deck/.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import { getTrainingModule } from '@/lib/crew-data';
import { loadSourceText } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

export default async function PresenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireHubAccess('crew');
  const { slug } = await params;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();
  const source = await loadSourceText(slug);
  if (!source || source.trim().length === 0) notFound();

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src={`/api/training-deck/${slug}`}
        title={`${mod.name} — slide deck`}
        className="h-full w-full border-0"
      />
      <Link
        href={`/crew/modules/${slug}`}
        className="absolute top-3 right-3 z-10 rounded-full bg-white/90 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep shadow hover:bg-white"
      >
        Exit deck
      </Link>
    </div>
  );
}
