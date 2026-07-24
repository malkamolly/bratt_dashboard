import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import {
  loadEntrySeason,
  todayIso,
  TRACKS,
  trackKey,
  WORK_TYPE_LABELS,
  WINDOW_LABELS,
  WORK_TYPE_HAS_DISCOUNT,
} from '@/lib/off-season-data';
import { EntryForm } from './EntryForm';

export const dynamic = 'force-dynamic';

// ServiceTitan reports the numbers come from. Grouped so it's obvious which
// report feeds which field on the form below.
const REPORT_GROUPS: { heading: string; reports: { label: string; url: string }[] }[] = [
  {
    heading: 'Scheduled work',
    reports: [
      { label: 'Discounted — Nov/Dec', url: 'https://go.servicetitan.com/#/new/reports/205251409' },
      { label: 'Discounted — Jan/March', url: 'https://go.servicetitan.com/#/new/reports/205244081' },
      { label: 'Dormant — Nov/Dec', url: 'https://go.servicetitan.com/#/new/reports/205436316' },
      { label: 'Dormant — Jan/March', url: 'https://go.servicetitan.com/#/new/reports/180568124' },
    ],
  },
  {
    heading: 'Discounts',
    reports: [
      { label: 'Off-Season Discounts', url: 'https://go.servicetitan.com/#/new/reports/204773557' },
    ],
  },
];

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
      hasDiscount: WORK_TYPE_HAS_DISCOUNT[workType],
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
        Update Totals
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Update today
      </h1>
      <p className="mt-4 text-fg-2">
        Update each track&rsquo;s <strong>running total scheduled</strong> (work
        on the calendar) and the <strong>discount given</strong> on discounted
        work &mdash; the latest numbers from ServiceTitan. Leave a track blank to
        skip it. The date below stamps the dashboard&rsquo;s &ldquo;last
        updated.&rdquo;
      </p>

      {/* Where the numbers come from — the ServiceTitan reports. */}
      <section className="mt-6 rounded-2 border-2 border-paper-edge bg-paper/40 p-5">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Pull the numbers &mdash; ServiceTitan reports
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORT_GROUPS.map((g) => (
            <div key={g.heading}>
              <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-wood">
                {g.heading}
              </p>
              <ul className="mt-1.5 space-y-1">
                {g.reports.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-orange underline decoration-orange/40 underline-offset-2 hover:decoration-orange"
                    >
                      {r.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

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
