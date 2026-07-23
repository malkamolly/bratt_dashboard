import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { loadSettings, WINDOW_LABELS } from '@/lib/off-season-data';
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

  const seasons = settings.map((s) => ({
    id: s.id,
    label: s.label,
    isCurrent: s.isCurrent,
    windows: s.targets.map((t) => ({
      osWindow: t.osWindow,
      windowLabel: WINDOW_LABELS[t.osWindow],
      goalAmount: t.goalAmount,
      milestoneStep: t.milestoneStep,
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
        One combined goal per window &mdash; discounted and dormant work counted
        together. Set the top goal and the milestone step (the size of each rung,
        e.g. $100k). Pick which season the dashboard shows by default with{' '}
        <strong>Current</strong>.
      </p>

      {settings.length === 0 ? (
        <p className="mt-8 rounded-2 border-2 border-paper-edge bg-paper/40 px-4 py-6 text-fg-2">
          No seasons exist yet. (The database seed creates them &mdash; if you
          see this, the migrations may not have run.)
        </p>
      ) : (
        <div className="mt-8">
          <SettingsForm seasons={seasons} saved={params.saved === '1'} />
        </div>
      )}
    </main>
  );
}
