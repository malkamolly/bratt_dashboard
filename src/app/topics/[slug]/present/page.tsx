// ============================================================================
// Topic deck presenter — /topics/[slug]/present
// ============================================================================
// Renders a topic deck inside an iframe pointing at /api/topic-deck/[slug]
// (the HTML harness that boots the shared deck renderer in
// /public/training-deck/). Same pattern as /onboarding/[slug]/present.
// ============================================================================

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { getTopicDeck, loadTopicSource } from '@/lib/topic-deck';

export const dynamic = 'force-dynamic';

export default async function TopicPresenterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Topic decks live in the Sales Arborist Hub library — any signed-in
  // allowlisted user can present them.
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  const { slug } = await params;

  const deck = getTopicDeck(slug);
  if (!deck) notFound();
  const source = await loadTopicSource(slug);
  if (!source || source.trim().length === 0) notFound();

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src={`/api/topic-deck/${slug}`}
        title={`${deck.title} — slide deck`}
        className="h-full w-full border-0"
      />
      <Link
        href="/hub/library"
        className="absolute top-3 right-3 z-10 rounded-full bg-white/90 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep shadow hover:bg-white"
      >
        Exit deck
      </Link>
    </div>
  );
}
