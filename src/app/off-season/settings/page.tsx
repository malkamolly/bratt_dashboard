import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { loadSettings, WORK_TYPE_LABELS } from '@/lib/off-season-data';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function OffSeasonSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireHubAccess('pace');
  const params = await searchParams;
  const settings = await loadSettings();

  // Reshape into plain, client-safe data (attach a display label to each
  // target so the client component doesn't import the server-only data module).
  const seasons = settings.map((s) => ({
    id: s.id,
    label: s.label,
    isCurrent: s.isCurrent,
    targets: s.targets.map((t) => ({
      workType: t.workType,
      typeLabel: WORK_TYPE_LABELS[t.workType],
      goalAmount: t.goalAmount,
      windowStart: t.windowStart,
      windowEnd: t.windowEnd,
    })),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/off-season" className="hover:underline">
          Off-Season Work
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Goals
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Goals &amp; Seasons
      </h1>
      <p className="mt-4 text-fg-2">
        Set the dollar goal and the booking window for each work type. The
        dashboard measures pace by spreading the goal evenly across its window,
        so the &ldquo;ahead / behind&rdquo; call is only as good as these dates.
        Pick which season the dashboard shows by default with{' '}
        <strong>Current</strong>.
      </p>

      {settings.length === 0 ? (
        <p className="mt-8 rounded-2 border-2 border-paper-edge bg-paper/40 px-4 py-6 text-fg-2">
          No seasons exist yet. (The database seed creates them &mdash; if you
          see this, the migration may not have run.)
        </p>
      ) : (
        <div className="mt-8">
          <SettingsForm seasons={seasons} saved={params.saved === '1'} />
        </div>
      )}
    </main>
  );
}
