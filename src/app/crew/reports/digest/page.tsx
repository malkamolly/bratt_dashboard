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
import { listActivitySince, listCdlProgress, listEmployees } from '@/lib/crew-data';
import { buildDigest } from '@/lib/huddle-digest';
import { CDL_STAGES } from '@/lib/cdl';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

// One crew member's week, summarized for their roster line.
type PersonWeek = {
  slug: string;
  name: string;
  certified: number;
  leveledUp: number;
  failed: number;
  hours: number;
  total: number;
};

type Chip = { label: string; cls: string };

function chipsFor(p: PersonWeek, fmtHours: (n: number) => string): Chip[] {
  const chips: Chip[] = [];
  const times = (n: number) => (n > 1 ? ` ×${n}` : '');
  if (p.certified) chips.push({ label: `Certified${times(p.certified)}`, cls: 'bg-green-dark text-white' });
  if (p.leveledUp) chips.push({ label: `Leveled up${times(p.leveledUp)}`, cls: 'bg-orange text-white' });
  if (p.hours) chips.push({ label: `${fmtHours(p.hours)}h`, cls: 'bg-bark-deep text-cream' });
  if (p.failed) chips.push({ label: `Did not pass${times(p.failed)}`, cls: 'bg-orange-press text-white' });
  return chips;
}

export default async function ProgressDigestPage() {
  await requireHubAccess('crew');

  // Match how activity occurred_on is written (UTC date) so "today" lines up.
  const todayISO = new Date().toISOString().slice(0, 10);
  const sinceISO = format(
    new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000),
    'yyyy-MM-dd',
  );

  const [entries, cdl, employees] = await Promise.all([
    listActivitySince(sinceISO),
    listCdlProgress(),
    listEmployees({ activeOnly: true }),
  ]);
  const digest = buildDigest(entries, { days: WINDOW_DAYS, todayISO });
  const { callouts } = digest;

  // Group CDL trainees by stage for the overview column.
  const cdlByStage = CDL_STAGES.map((_, i) => cdl.filter((t) => t.stage === i + 1));

  // One summarized line per crew member — everyone, even if idle this week.
  const bySlug = new Map<string, PersonWeek>();
  const ensurePerson = (slug: string, name: string) => {
    let p = bySlug.get(slug);
    if (!p) {
      p = { slug, name, certified: 0, leveledUp: 0, failed: 0, hours: 0, total: 0 };
      bySlug.set(slug, p);
    }
    return p;
  };
  for (const emp of employees) ensurePerson(emp.slug, emp.name);
  for (const e of digest.events) {
    const p = ensurePerson(e.employee_slug, e.employee_name);
    p.total++;
    if (e.kind === 'cert_pass') p.certified++;
    else if (e.kind === 'skill_up') p.leveledUp++;
    else if (e.kind === 'cert_fail') p.failed++;
    else if (e.kind === 'hours' && e.hours) p.hours += e.hours;
  }
  const roster = Array.from(bySlug.values()).sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );

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

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Achievement feed (left, narrower) */}
          <section className="bt-card lg:col-span-2">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Who moved the needle
            </h2>
            {roster.length === 0 ? (
              <p className="mt-4 text-sm text-fg-3">No active crew on file.</p>
            ) : (
              <ul className="mt-4 divide-y divide-paper-edge">
                {roster.map((p) => {
                  const chips = chipsFor(p, fmtHours);
                  return (
                    <li key={p.slug} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link
                        href={`/crew/employees/${p.slug}`}
                        className={`shrink-0 font-headline font-extrabold hover:underline ${
                          p.total ? 'text-bark-deep' : 'text-fg-3'
                        }`}
                      >
                        {p.name}
                      </Link>
                      {chips.length > 0 ? (
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          {chips.map((c) => (
                            <span
                              key={c.label}
                              className={`rounded-full px-2 py-0.5 font-headline text-[9px] font-extrabold uppercase tracking-ribbon ${c.cls}`}
                            >
                              {c.label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                          — no activity
                        </span>
                      )}
                    </li>
                  );
                })}
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
                <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {CDL_STAGES.map((label, i) => {
                    const people = cdlByStage[i];
                    return (
                      <li key={label} className="rounded-2 border border-paper-edge bg-cream px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                            {i + 1}. {label}
                          </span>
                          <span
                            className={`font-headline text-sm font-extrabold ${people.length ? 'text-orange' : 'text-fg-3'}`}
                          >
                            {people.length}
                          </span>
                        </div>
                        {people.length > 0 && (
                          <p className="mt-1 text-xs text-fg-2">
                            {people.map((p) => p.employee_name).join(', ')}
                          </p>
                        )}
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
