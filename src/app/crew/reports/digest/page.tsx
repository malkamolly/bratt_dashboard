// ============================================================================
// Daily progress digest — /crew/reports/digest
// ============================================================================
// An auto-generated, read-only visualization of the last 7 days of the
// activity feed, for the trainer's daily huddle. Recomputed live on each load.
//
// Layout: every crew member on their own line summarizing their week (left),
// with a totals scoreboard + by-day chart and a CDL pipeline overview (right).
// Source data is field_crew_activity, classified by lib/huddle-digest.ts
// (certifications are deduped — a pass supersedes an earlier fail).
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { listActivitySince, listCdlProgress } from '@/lib/crew-data';
import { buildDigest, type ClassifiedActivity } from '@/lib/huddle-digest';
import { CDL_STAGES } from '@/lib/cdl';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

type PersonWeek = { slug: string; name: string; events: ClassifiedActivity[] };

// What one achievement reads as on a crew member's line: a tag + the specific
// thing they did (which cert, which skill, how many hours).
function achievementOf(e: ClassifiedActivity): { tag: string; cls: string; detail: string } {
  switch (e.kind) {
    case 'cert_pass':
      return { tag: 'Certified', cls: 'bg-green-dark text-white', detail: e.certName ?? '' };
    case 'skill_up':
      return {
        tag: 'Leveled up',
        cls: 'bg-orange text-white',
        detail: e.description.replace(/\.$/, '').replace(/:\s*/, ' '),
      };
    case 'hours':
      return {
        tag: 'Training',
        cls: 'bg-bark-deep text-cream',
        detail: e.description.replace(/^Training session:\s*/i, ''),
      };
    case 'cert_fail':
      return { tag: 'Did not pass', cls: 'bg-orange-press text-white', detail: e.certName ?? '' };
    default:
      return { tag: 'Update', cls: 'bg-paper-edge text-bark-deep', detail: e.description };
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

  const [entries, cdl] = await Promise.all([
    listActivitySince(sinceISO),
    listCdlProgress(),
  ]);
  const digest = buildDigest(entries, { days: WINDOW_DAYS, todayISO });
  const { callouts } = digest;

  // Group CDL trainees by stage for the overview column.
  const cdlByStage = CDL_STAGES.map((_, i) => cdl.filter((t) => t.stage === i + 1));

  // One line per crew member who did something this week, listing exactly what.
  const bySlug = new Map<string, PersonWeek>();
  for (const e of digest.events) {
    let p = bySlug.get(e.employee_slug);
    if (!p) {
      p = { slug: e.employee_slug, name: e.employee_name, events: [] };
      bySlug.set(e.employee_slug, p);
    }
    p.events.push(e);
  }
  const roster = Array.from(bySlug.values()).sort(
    (a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name),
  );

  const maxDay = Math.max(1, ...digest.days.map((d) => d.count));
  const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <main className="bt-page">
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

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Achievement feed (left, narrower) */}
          <section className="bt-card lg:col-span-2">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Who moved the needle
            </h2>
            {roster.length === 0 ? (
              <p className="mt-4 text-sm text-fg-3">
                No level-ups, certifications, or training logged this week.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-paper-edge">
                {roster.map((p) => (
                  <li key={p.slug} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <Link
                      href={`/crew/employees/${p.slug}`}
                      className="shrink-0 pt-0.5 font-headline font-extrabold text-bark-deep hover:underline"
                    >
                      {p.name}
                    </Link>
                    <ul className="flex flex-col items-end gap-1 text-right">
                      {p.events.map((e) => {
                        const a = achievementOf(e);
                        return (
                          <li key={e.id} className="flex flex-wrap items-center justify-end gap-1.5">
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 font-headline text-[9px] font-extrabold uppercase tracking-ribbon ${a.cls}`}
                            >
                              {a.tag}
                            </span>
                            {a.detail && <span className="text-xs text-fg-2">{a.detail}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Right side (wider): summary + chart on top, CDL across the bottom */}
          <div className="space-y-6 lg:col-span-3">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* This week */}
              <div className="bt-card">
                <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                  This week
                </h2>
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Trailing 7 days
                </p>
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
                    value={fmtHours(callouts.hours)}
                    label="training hours logged"
                    color="text-bark-deep"
                  />
                </dl>
              </div>

              {/* Activity by day */}
              <div className="bt-card">
                <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                  Activity by day
                </h2>
                <div className="mt-5 flex items-end justify-between gap-1.5" style={{ height: 150 }}>
                  {digest.days.map((d) => {
                    const isToday = d.date === digest.toDate;
                    const h = Math.round((d.count / maxDay) * 110);
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
            </div>

            {/* CDL pipeline overview (full width under both) */}
            <div className="bt-card">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                  CDL tracking
                </h2>
                <Link
                  href="/crew/cdl"
                  className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange hover:underline"
                >
                  Manage →
                </Link>
              </div>
              {cdl.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">Nobody on the CDL track yet.</p>
              ) : (
                <ol className="mt-4 divide-y divide-paper-edge">
                  {CDL_STAGES.map((label, i) => {
                    const people = cdlByStage[i];
                    return (
                      <li
                        key={label}
                        className="flex items-baseline justify-between gap-4 py-2.5"
                      >
                        <span className="w-44 shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep">
                          {i + 1}. {label}
                        </span>
                        <span className="flex-1 text-xs text-fg-2">
                          {people.map((p) => p.employee_name).join(', ')}
                        </span>
                        <span
                          className={`shrink-0 font-headline text-sm font-extrabold ${people.length ? 'text-orange' : 'text-fg-3'}`}
                        >
                          {people.length}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
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
      <dd className={`w-12 shrink-0 text-right font-display text-4xl leading-none ${color}`}>
        {value}
      </dd>
      <dt className="font-headline text-[11px] font-extrabold uppercase leading-tight tracking-ribbon text-fg-2">
        {label}
      </dt>
    </div>
  );
}
