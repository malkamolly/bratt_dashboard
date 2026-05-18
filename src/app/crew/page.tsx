import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function FieldCrewHubPage() {
  await requireHubAccess('crew');

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Field Crew Hub
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Field Crew Hub
      </h1>
      <p className="mt-4 max-w-xl text-fg-2">
        Schedules, daily targets, and resources for field crews.
      </p>

      <section className="mt-10 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
          Phase 3
        </p>
        <p className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Coming soon
        </p>
        <p className="mt-3 text-sm text-fg-2">
          Future home for crew-side tools. Reach out if there&apos;s something
          specific you&apos;d like in here.
        </p>
      </section>
    </main>
  );
}
