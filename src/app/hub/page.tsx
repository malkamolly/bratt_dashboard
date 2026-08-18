import Link from 'next/link';
import {
  requireHubAccess,
  canUseCalculator,
  canUseSiteMarkup,
  canSeeFollowupScorecard,
} from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';

export const dynamic = 'force-dynamic';

export default async function HubHomePage() {
  const user = await requireHubAccess('hub');
  const showCalculator = canUseCalculator(user.role);
  const showSiteMarkup = canUseSiteMarkup(user.role);
  const showFollowup = canSeeFollowupScorecard(user.role);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Sales Arborist Hub
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Sales Arborist Hub
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Everything our crew needs in one place &mdash; team roster, weekly
        meetings, training library, and onboarding.
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub" />
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link href="/hub/arborists" className="bt-card group transition-colors hover:!border-orange">
          <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
            Team Roster
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Who&apos;s on the team, who&apos;s a Certified Arborist, and their
            ISA numbers.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            View roster &rarr;
          </p>
        </Link>

        {showFollowup && (
          <Link href="/hub/followup" className="bt-card group transition-colors hover:!border-orange">
            <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
              Follow-Up Scorecard
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              What calling back is worth &mdash; one in three opportunities we
              follow up on turns into a paying job. Where the open board stands
              and who to call first.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open scorecard &rarr;
            </p>
          </Link>
        )}

        <Link href="/hub/meetings" className="bt-card group transition-colors hover:!border-orange">
          <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
            Weekly Meetings
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            This week&apos;s meeting plus the full archive of past topics and
            announcements.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Go to meetings &rarr;
          </p>
        </Link>

        <Link href="/hub/library" className="bt-card group transition-colors hover:!border-orange">
          <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
            Training Library
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Educational topics from past meetings, organized for browsing and
            review.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Browse library &rarr;
          </p>
        </Link>

        <Link href="/equipment" className="bt-card group transition-colors hover:!border-orange">
          <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
            Equipment Specs
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            At-a-glance dimensions, weights, reach, and crane load charts for
            the whole fleet &mdash; the same reference the field crews use.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open spec sheet &rarr;
          </p>
        </Link>

        {showCalculator && (
          <Link href="/hub/calculator" className="bt-card group transition-colors hover:!border-orange">
            <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
              Price Calculators
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Build a customer quote &mdash; PHC treatments by DBH or stump
              herbicide by stump size. Add a line per item and the total adds up
              as you go.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open calculators &rarr;
            </p>
          </Link>
        )}

        {showSiteMarkup && (
          <Link href="/hub/site-plan" className="bt-card group transition-colors hover:!border-orange">
            <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
              Site Markup
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Mark up a map and photo of a job site for city permits or power line
              clearance &mdash; lane closures, safety zone, tree locations &mdash;
              then save it as a PDF.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open site markup &rarr;
            </p>
          </Link>
        )}

        <Link href="/onboarding/sales/present" className="bt-card group transition-colors hover:!border-orange">
          <h2 className="font-headline text-3xl font-black uppercase text-bark-deep">
            Onboarding
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            New hire orientation &mdash; what every Sales Arborist needs to
            know on day one.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Start onboarding &rarr;
          </p>
        </Link>
      </section>
    </main>
  );
}
