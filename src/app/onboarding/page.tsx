// ============================================================================
// Onboarding landing — /onboarding
// ============================================================================
// Top-level onboarding hub. Lists the available onboarding decks for any
// role we onboard — currently Field Crew, with Sales and Office to come.
// Each card opens the same deck presenter used by training modules.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import {
  ONBOARDING_DECKS,
  loadOnboardingSource,
} from '@/lib/onboarding-deck';
import { countSlides } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

// Decks that don't have a source file yet — shown as "Coming soon" cards
// so people can see the roadmap.
const COMING_SOON: Array<{ slug: string; title: string; description: string }> = [
  {
    slug: 'office',
    title: 'Office Onboarding',
    description: 'First days for new office staff — coming soon.',
  },
];

export default async function OnboardingIndexPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  // Pull slide counts for each live deck so we can show them on the cards.
  const decks = await Promise.all(
    Object.values(ONBOARDING_DECKS).map(async (d) => {
      const source = await loadOnboardingSource(d.slug);
      return { ...d, slides: countSlides(source) };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Onboarding
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Onboarding
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Decks we walk new hires through on day one. Present in person, or
        share the link and let them go at their own pace.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        {decks.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/onboarding/${d.slug}/present`}
              className="bt-card flex h-full flex-col gap-3 transition-colors hover:!border-orange"
            >
              <p className="bt-eyebrow">{d.version}</p>
              <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                {d.title}
              </h2>
              {d.description && (
                <p className="text-sm text-fg-2">{d.description}</p>
              )}
              <p className="mt-auto font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                {d.slides} slides
              </p>
              <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                Present deck &rarr;
              </p>
            </Link>
          </li>
        ))}
        {COMING_SOON.map((d) => (
          <li key={d.slug}>
            <div className="bt-card flex h-full cursor-not-allowed flex-col gap-3 opacity-60">
              <p className="bt-eyebrow">Coming soon</p>
              <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
                {d.title}
              </h2>
              <p className="text-sm text-fg-2">{d.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
