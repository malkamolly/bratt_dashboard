import Image from 'next/image';
import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { listRoster } from '@/lib/roster-data';

export const dynamic = 'force-dynamic';

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export default async function ArboristRosterPage() {
  await requireHubAccess('hub');
  const arborists = await listRoster();
  const certifiedCount = arborists.filter((a) => a.certified).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Roster
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Team Roster
      </h1>
      <p className="mt-3 text-fg-2">
        {arborists.length} team members &middot; {certifiedCount} ISA Certified
        Arborists
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/arborists" />
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {arborists.map((a) => {
          const photo = a.photo;
          return (
          // `relative` + a stretched overlay link (below) makes the whole card
          // open the profile, while the phone number stays a separately
          // tappable tel: link. (A tel: link can't be nested inside the profile
          // <Link> — nested anchors are invalid HTML.)
          <li
            key={a.slug}
            className="bt-card relative flex h-full flex-col gap-4 transition-colors hover:!border-orange focus-within:!border-orange"
          >
            <div className="flex items-center gap-4">
              {photo ? (
                <Image
                  src={photo}
                  alt=""
                  width={72}
                  height={72}
                  className="h-18 w-18 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-bark text-cream font-display text-2xl uppercase">
                  {a.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-headline text-lg font-black uppercase text-bark-deep">
                  {a.name}
                </h2>
                <p className="truncate text-sm text-fg-2">{a.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {a.manager ? (
                <span className="rounded-full bg-bark px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
                  Sales Manager
                </span>
              ) : a.certified ? (
                <>
                  <span className="rounded-full bg-green/15 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
                    Certified
                  </span>
                  {a.isa_number && (
                    <span className="font-headline text-xs font-bold text-fg-3">
                      {a.isa_number}
                    </span>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-orange/15 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                  In progress
                </span>
              )}
            </div>
            {a.phone && (
              <a
                href={`tel:${a.phone.replace(/[^0-9+]/g, '')}`}
                className="relative z-10 mt-auto inline-flex w-fit items-center gap-1.5 font-headline text-sm font-bold text-fg-2 hover:text-orange"
              >
                <PhoneIcon />
                {a.phone}
              </a>
            )}
            {/* Stretched overlay: covers the whole card so a click anywhere
                (except the phone link above) opens the profile. */}
            <Link
              href={`/hub/arborists/${a.slug}`}
              className="absolute inset-0 rounded-card"
              aria-label={`View ${a.name}'s profile`}
            />
          </li>
          );
        })}
      </ul>
    </main>
  );
}
