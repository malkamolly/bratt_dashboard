import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import {
  loadEntrySeason,
  todayIso,
  TRACKS,
  trackKey,
  WORK_TYPE_LABELS,
  WINDOW_LABELS,
} from '@/lib/off-season-data';
import { EntryForm } from './EntryForm';

export const dynamic = 'force-dynamic';

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

export default async function OffSeasonEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; deleted?: string }>;
}) {
  await requireHubAccess('pace');
  const params = await searchParams;
  const date = params.date && isValidIsoDate(params.date) ? params.date : todayIso();

  const entry = await loadEntrySeason(date);

  // One input group per track, with any existing values pre-filled.
  const rows = TRACKS.map(({ workType, osWindow }) => {
    const key = trackKey(workType, osWindow);
    const v = entry?.values[key];
    return {
      key,
      workType,
      typeLabel: WORK_TYPE_LABELS[workType],
      windowLabel: WINDOW_LABELS[osWindow],
      scheduled: v?.scheduled != null ? String(v.scheduled) : '',
      discount: v?.discount != null ? String(v.discount) : '',
    };
  });

  const hasExisting = rows.some((r) => r.scheduled !== '' || r.discount !== '');

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
        Daily Entry
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Enter the day
      </h1>
      <p className="mt-4 text-fg-2">
        For each track, enter the <strong>running total booked so far</strong>{' '}
        and the <strong>total discount given</strong> &mdash; the same
        cumulative numbers the old spreadsheet tracked. Leave a track blank to
        skip it. The dashboard does the rest of the math.
      </p>

      {!entry ? (
        <p className="mt-8 rounded-2 border-2 border-paper-edge bg-paper/40 px-4 py-6 text-fg-2">
          No current season is set up yet. Add one on the{' '}
          <Link href="/off-season/settings" className="text-orange underline">
            Goals
          </Link>{' '}
          screen first.
        </p>
      ) : (
        <div className="mt-8">
          <p className="mb-4 rounded-2 border-2 border-lime bg-lime/10 px-4 py-2 text-sm font-bold text-bark-deep">
            Season: {entry.season.label}
          </p>
          <EntryForm
            key={date}
            date={date}
            seasonId={entry.season.id}
            rows={rows}
            hasExisting={hasExisting}
          />
        </div>
      )}
    </main>
  );
}
