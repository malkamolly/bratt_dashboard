import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SalesArboristHubPage() {
  await requireHubAccess('hub');

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
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
      <p className="mt-4 max-w-xl text-fg-2">
        This space will hold the arborist roster, resources, and per-arborist
        performance numbers pulled from the Pace dashboard.
      </p>

      <section className="mt-10 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
          Phase 2
        </p>
        <p className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Coming soon
        </p>
        <p className="mt-3 text-sm text-fg-2">
          We&apos;ll rebuild the existing{' '}
          <a
            href="https://bratttreeservice.github.io/salesarborist_hub/arborists/"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-orange underline"
          >
            Sales Arborist Hub
          </a>{' '}
          in here, behind sign-in.
        </p>
      </section>
    </main>
  );
}
