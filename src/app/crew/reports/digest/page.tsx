// ============================================================================
// Daily progress digest — /crew/reports/digest
// ============================================================================
// An auto-generated, screenshot-friendly visualization of the last 7 days of
// the activity feed, for the trainer's daily huddle. Read-only; recomputed
// live on each load. The source data is field_crew_activity, classified by
// lib/huddle-digest.ts into skill level-ups, training hours, and completions.
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { listActivitySince } from '@/lib/crew-data';
import { buildDigest } from '@/lib/huddle-digest';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

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

  const maxDay = Math.max(1, ...digest.days.map((d) => d.count));
  const maxHours = Math.max(1, ...digest.hoursByPerson.map((p) => p.count));
  const maxPerson = Math.max(1, ...digest.perPerson.map((p) => p.count));
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

      {/* Headline */}
      <p className="mt-6 rounded-card bg-bark-deep px-5 py-4 font-headline text-lg font-extrabold text-cream">
        {digest.headline}
      </p>

      {/* Stat cards */}
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Skill level-ups" value={digest.totals.skillUps} accent="orange" />
        <StatCard label="Training hours" value={fmtHours(digest.totals.hours)} accent="green" />
        <StatCard label="Completions" value={digest.totals.completions} accent="orange" />
        <StatCard label="Active crew" value={digest.totals.activeCrew} accent="bark" />
      </section>

      {digest.totals.entries === 0 ? (
        <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
            Nothing yet
          </p>
          <p className="mt-2 text-sm text-fg-2">
            No activity has been logged in this window. Once the trainer logs
            skill bumps, training hours, or completions, they&apos;ll show up
            here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* 7-day activity bars */}
          <section className="mt-8 bt-card">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Activity by day
            </h2>
            <div className="mt-5 flex items-end justify-between gap-2" style={{ height: 160 }}>
              {digest.days.map((d) => {
                const isToday = d.date === digest.toDate;
                const h = Math.round((d.count / maxDay) * 120);
                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-2">
                    <span className="font-headline text-xs font-extrabold text-bark-deep">
                      {d.count || ''}
                    </span>
                    <div
                      className={`w-full rounded-t ${isToday ? 'bg-orange' : 'bg-bark-deep/70'}`}
                      style={{ height: Math.max(d.count ? 6 : 2, h) }}
                    />
                    <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      {format(parseISO(d.date), 'EEE')}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Skill level-ups + completions */}
          <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Skill level-ups ({digest.skillUps.length})
              </h2>
              {digest.skillUps.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">None this week.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {digest.skillUps.map((s) => (
                    <li key={s.id} className="text-sm">
                      <Link
                        href={`/crew/employees/${s.employee_slug}`}
                        className="font-headline font-extrabold text-bark-deep hover:underline"
                      >
                        {s.employee_name}
                      </Link>{' '}
                      <span className="text-fg-2">— {s.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Completions &amp; certs ({digest.completions.length})
              </h2>
              {digest.completions.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">None this week.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {digest.completions.map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link
                        href={`/crew/employees/${c.employee_slug}`}
                        className="font-headline font-extrabold text-bark-deep hover:underline"
                      >
                        {c.employee_name}
                      </Link>{' '}
                      <span className="text-fg-2">— {c.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Hours by person */}
          {digest.hoursByPerson.length > 0 && (
            <section className="mt-6 bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Training hours by person
              </h2>
              <ul className="mt-4 space-y-3">
                {digest.hoursByPerson.map((p) => (
                  <BarRow
                    key={p.slug}
                    slug={p.slug}
                    name={p.name}
                    label={`${fmtHours(p.count)}h`}
                    pct={(p.count / maxHours) * 100}
                    color="bg-green-dark"
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Per-person activity leaderboard */}
          <section className="mt-6 bt-card">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Who moved the needle
            </h2>
            <ul className="mt-4 space-y-3">
              {digest.perPerson.map((p) => (
                <BarRow
                  key={p.slug}
                  slug={p.slug}
                  name={p.name}
                  label={`${p.count}`}
                  pct={(p.count / maxPerson) * 100}
                  color="bg-orange"
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'orange' | 'green' | 'bark';
}) {
  const color =
    accent === 'orange' ? 'text-orange' : accent === 'green' ? 'text-green-dark' : 'text-bark-deep';
  return (
    <div className="bt-card text-center">
      <p className={`font-display text-5xl ${color}`}>{value}</p>
      <p className="mt-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
    </div>
  );
}

function BarRow({
  slug,
  name,
  label,
  pct,
  color,
}: {
  slug: string;
  name: string;
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <li>
      <div className="flex items-center justify-between">
        <Link
          href={`/crew/employees/${slug}`}
          className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep hover:underline"
        >
          {name}
        </Link>
        <span className="font-headline text-xs font-extrabold text-fg-2">{label}</span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-edge">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </li>
  );
}
