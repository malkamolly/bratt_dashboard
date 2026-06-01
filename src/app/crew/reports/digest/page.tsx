// ============================================================================
// Daily progress digest — /crew/reports/digest
// ============================================================================
// An auto-generated, read-only visualization of the last 7 days of the
// activity feed, for the trainer's daily huddle. Recomputed live on each load.
//
// Layout: a feed of achievement cards (who · what · when) on the left, and a
// totals scoreboard + by-day chart on the right. Source data is
// field_crew_activity, classified by lib/huddle-digest.ts (certifications are
// deduped — a pass supersedes an earlier fail for the same cert).
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { listActivitySince } from '@/lib/crew-data';
import { buildDigest, type ClassifiedActivity } from '@/lib/huddle-digest';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

type CardSpec = { tag: string; tagClass: string; detail: string };

// Map a classified activity to how its achievement card reads.
function toCard(e: ClassifiedActivity): CardSpec {
  switch (e.kind) {
    case 'cert_pass':
      return {
        tag: 'Certified',
        tagClass: 'bg-green-dark text-white',
        detail: e.certName ?? e.description,
      };
    case 'skill_up':
      return {
        tag: 'Leveled up',
        tagClass: 'bg-orange text-white',
        detail: e.description.replace(/\.$/, ''),
      };
    case 'hours':
      return {
        tag: 'Training',
        tagClass: 'bg-bark-deep text-cream',
        detail: e.description.replace(/^Training session:\s*/i, ''),
      };
    case 'cert_fail':
      return {
        tag: 'Did not pass',
        tagClass: 'bg-orange-press text-white',
        detail: e.certName ?? e.description,
      };
    default:
      return { tag: 'Update', tagClass: 'bg-paper-edge text-bark-deep', detail: e.description };
  }
}

export default async function ProgressDigestPage() {
  await requireHubAccess('crew');

  // Match how activity occurred_on is written (UTC date) so "today" lines up.
  const todayISO = new Date().toISOString().slice(0, 10);
  const sinceISO = format(
    new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000),
    'yyyy-MM-dd',
  );

  const entries = await listActivitySince(sinceISO);
  const digest = buildDigest(entries, { days: WINDOW_DAYS, todayISO });
  const { callouts } = digest;

  const maxDay = Math.max(1, ...digest.days.map((d) => d.count));
  const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/reports" className="hover:underline">
          Reports
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Daily progress
      </p>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            Daily progress
          </h1>
          <p className="mt-2 text-fg-2">
            {format(parseISO(digest.fromDate), 'MMM d')} –{' '}
            {format(parseISO(digest.toDate), 'MMM d, yyyy')} · auto-generated
            from the activity feed.
          </p>
        </div>
        <Link href="/crew/reports/feed" className="bt-btn bt-btn-ghost">
          See full feed →
        </Link>
      </header>

      {digest.totalEntries === 0 ? (
        <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
            Nothing yet
          </p>
          <p className="mt-2 text-sm text-fg-2">
            No activity has been logged in this window. Once the trainer logs
            skill bumps, training hours, or certifications, they&apos;ll show up
            here automatically.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Achievement feed (left) */}
          <section className="lg:col-span-2">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Who moved the needle
            </h2>
            {digest.events.length === 0 ? (
              <p className="mt-3 text-sm text-fg-3">
                No level-ups, certifications, or training logged this week.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {digest.events.map((e) => {
                  const card = toCard(e);
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-card border border-paper-edge bg-paper p-4"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${card.tagClass}`}
                      >
                        {card.tag}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <Link
                            href={`/crew/employees/${e.employee_slug}`}
                            className="truncate font-headline text-base font-extrabold text-bark-deep hover:underline"
                          >
                            {e.employee_name}
                          </Link>
                          <span className="shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
                            {format(parseISO(e.occurred_on), 'EEE, MMM d')}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-fg-2">{card.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Totals + by-day (right) */}
          <aside className="space-y-6">
            <div className="bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                This week
              </h2>
              <dl className="mt-4 space-y-3">
                <TotalRow
                  value={callouts.leveledUpPeople}
                  label={`crew member${callouts.leveledUpPeople === 1 ? '' : 's'} leveled up`}
                  color="text-orange"
                />
                <TotalRow value={callouts.certifiedTotal} label="certified" color="text-green-dark" />
                <TotalRow
                  value={callouts.failedTotal}
                  label="failed a certification"
                  color="text-orange-press"
                />
                <TotalRow
                  value={`${fmtHours(callouts.hours)}h`}
                  label="training logged"
                  color="text-bark-deep"
                />
              </dl>
            </div>

            <div className="bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Activity by day
              </h2>
              <div className="mt-5 flex items-end justify-between gap-1.5" style={{ height: 130 }}>
                {digest.days.map((d) => {
                  const isToday = d.date === digest.toDate;
                  const h = Math.round((d.count / maxDay) * 95);
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="font-headline text-[11px] font-extrabold text-bark-deep">
                        {d.count || ''}
                      </span>
                      <div
                        className={`w-full rounded-t ${isToday ? 'bg-orange' : 'bg-bark-deep/70'}`}
                        style={{ height: Math.max(d.count ? 6 : 2, h) }}
                      />
                      <span className="font-headline text-[9px] font-extrabold uppercase tracking-ribbon text-fg-3">
                        {format(parseISO(d.date), 'EEEEE')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function TotalRow({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <dd className={`w-14 shrink-0 text-right font-display text-4xl leading-none ${color}`}>
        {value}
      </dd>
      <dt className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </dt>
    </div>
  );
}
