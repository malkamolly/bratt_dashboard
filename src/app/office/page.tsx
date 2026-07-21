import Image from 'next/image';
import Link from 'next/link';
import {
  requireHubAccess,
  canUsePhcScheduling,
  canUseOffSeason,
} from '@/lib/auth';
import { isTagsUser } from '@/lib/tags-config';

export const dynamic = 'force-dynamic';

export default async function OfficeHubPage() {
  // Same audience as the Pace hub: admin, office (user), sales manager.
  const user = await requireHubAccess('pace');

  return (
    <main className="bt-page">
      <section className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="bt-eyebrow">
            <Link href="/" className="hover:underline">
              Bratt Tree
            </Link>
            <span className="mx-2 text-fg-3">/</span>
            Office Hub
          </p>
          <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            Office Hub
          </h1>
          <p className="mt-4 max-w-2xl text-fg-2">
            The office toolkit &mdash; pace dashboards, off-season work,
            scheduling, and your Slack tags, all in one place.
          </p>
        </div>
        <Image
          src="/brand/mascot.png"
          alt=""
          width={140}
          height={140}
          className="mt-6 sm:mt-0"
          priority
        />
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/pace"
          className="bt-card group transition-colors hover:!border-orange"
        >
          <p className="bt-eyebrow">Pace</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Pace Dashboards
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Daily sales and production pace &mdash; goals, MTD totals, per-day
            burn rate, tomorrow&rsquo;s schedule, and the SOP library.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>

        {canUseOffSeason(user.role) && (
          <Link
            href="/off-season"
            className="bt-card group transition-colors hover:!border-orange"
          >
            <p className="bt-eyebrow">Seasonal</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
              Off-Season Work
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Track the discounted fall push and dormant-season work against
              goal &mdash; booking pace and what the discounts are costing.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open &rarr;
            </p>
          </Link>
        )}

        {canUsePhcScheduling(user.role) && (
          <Link
            href="/phc"
            className="bt-card group transition-colors hover:!border-orange"
          >
            <p className="bt-eyebrow">Plant Health Care</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
              PHC Scheduling
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Turn the season&rsquo;s renewals export into an organized call
              list &mdash; bundled by property, flagged for missing info.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open &rarr;
            </p>
          </Link>
        )}

        {isTagsUser(user.email) && (
          <Link
            href="/tags"
            className="bt-card group transition-colors hover:!border-orange"
          >
            <p className="bt-eyebrow">Private</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
              Slack Tags
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Every Slack message you&rsquo;re tagged in, sorted by what
              actually needs a reply. Only you can see this.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open &rarr;
            </p>
          </Link>
        )}
      </section>
    </main>
  );
}
