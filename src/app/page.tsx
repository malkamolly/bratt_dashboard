import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { allowedHubsFor, getAllowedUser, type Hub } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type HubCard = {
  hub: Hub;
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  available: boolean;
};

const HUB_CARDS: HubCard[] = [
  {
    hub: 'pace',
    href: '/pace',
    eyebrow: 'Hub 1',
    title: 'Pace Dashboard',
    description:
      'Daily sales and production pace. Goals, MTD totals, per-day burn rate, and weekly recaps.',
    available: true,
  },
  {
    hub: 'hub',
    href: '/hub',
    eyebrow: 'Hub 2',
    title: 'Sales Arborist Hub',
    description:
      'Resources, rosters, and performance for the sales arborist team.',
    available: true,
  },
  {
    hub: 'crew',
    href: '/crew',
    eyebrow: 'Hub 3',
    title: 'Field Crew Hub',
    description:
      'Skills, trainings, and development plans for the Bratt Tree field team.',
    available: true,
  },
];

export default async function LandingPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const myHubs = allowedHubsFor(user.role);

  // Auto-redirect: if the user only has access to one hub, send them
  // straight there — skip the picker.
  if (myHubs.length === 1) {
    const card = HUB_CARDS.find((c) => c.hub === myHubs[0]);
    if (card?.available) redirect(card.href);
  }

  const visibleCards = HUB_CARDS.filter((c) => myHubs.includes(c.hub));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="bt-eyebrow">Bratt Tree Company</p>
          <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-wider text-ink uppercase">
            Welcome
          </h1>
          <p className="mt-4 max-w-xl text-fg-2">
            Pick a hub to jump in. Your access is set by your role &mdash; reach
            out to an admin if something looks missing.
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
        {visibleCards.map((card) =>
          card.available ? (
            <Link
              key={card.hub}
              href={card.href}
              className="bt-card group transition-colors hover:!border-orange"
            >
              <p className="bt-eyebrow">{card.eyebrow}</p>
              <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
                {card.title}
              </h2>
              <p className="mt-3 text-sm text-fg-2">{card.description}</p>
              <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                Open &rarr;
              </p>
            </Link>
          ) : (
            <div
              key={card.hub}
              className="bt-card opacity-60"
              aria-disabled="true"
            >
              <p className="bt-eyebrow">{card.eyebrow}</p>
              <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
                {card.title}
              </h2>
              <p className="mt-3 text-sm text-fg-2">{card.description}</p>
              <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                Coming soon
              </p>
            </div>
          ),
        )}
      </section>
    </main>
  );
}
