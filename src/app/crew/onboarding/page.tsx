// ============================================================================
// Onboarding landing — /crew/onboarding
// ============================================================================
// Lists the available onboarding decks. Each card opens the same deck
// presenter used by training modules (iframe wrapper around the renderer
// in /public/training-deck/).
// ============================================================================

import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import {
  ONBOARDING_DECKS,
  loadOnboardingSource,
} from '@/lib/onboarding-deck';
import { countSlides } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

export default async function OnboardingIndexPage() {
  await requireHubAccess('crew');

  // Pull slide counts for each deck so we can show them on the cards.
  const decks = await Promise.all(
    Object.values(ONBOARDING_DECKS).map(async (d) => {
      const source = await loadOnboardingSource(d.slug);
      return { ...d, slides: countSlides(source) };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Onboarding
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Onboarding
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Decks we walk new field crew through on day one. Present in person, or
        share the link and let them go at their own pace.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        {decks.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/crew/onboarding/${d.slug}/present`}
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
      </ul>
    </main>
  );
}
