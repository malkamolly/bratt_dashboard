// ============================================================================
// Onboarding slide presenter — /onboarding/[slug]/present
// ============================================================================
// Renders the onboarding deck inside an iframe pointing at the
// /api/onboarding-deck/[slug] HTML harness, which boots the shared deck
// renderer in /public/training-deck/. Same pattern as
// /crew/modules/[slug]/present.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess } from '@/lib/auth';
import {
  getOnboardingDeck,
  loadOnboardingSource,
} from '@/lib/onboarding-deck';

export const dynamic = 'force-dynamic';

export default async function OnboardingPresenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireHubAccess('crew');
  const { slug } = await params;

  const deck = getOnboardingDeck(slug);
  if (!deck) notFound();
  const source = await loadOnboardingSource(slug);
  if (!source || source.trim().length === 0) notFound();

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src={`/api/onboarding-deck/${slug}`}
        title={`${deck.title} — slide deck`}
        className="h-full w-full border-0"
      />
      <Link
        href="/onboarding"
        className="absolute top-3 right-3 z-10 rounded-full bg-white/90 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep shadow hover:bg-white"
      >
        Exit deck
      </Link>
    </div>
  );
}
