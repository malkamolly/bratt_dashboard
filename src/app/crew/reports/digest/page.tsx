// ============================================================================
// Daily progress digest — /crew/reports/digest
// ============================================================================
// An auto-generated, read-only visualization of the last 7 days of the
// activity feed, for the trainer's daily huddle. Recomputed live on each load.
// Source data is field_crew_activity, classified by lib/huddle-digest.ts into
// skill level-ups, certifications (pass/fail, deduped), and training hours.
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { listActivitySince } from '@/lib/crew-data';
import { buildDigest, type CertGroup } from '@/lib/huddle-digest';

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
  const { callouts } = digest;

  const maxDay = Math.max(1, ...digest.days.map((d) => d.count));
  const maxNeedle = Math.max(1, ...digest.leaderboard.map((p) => p.count));
  const maxHours = Math.max(1, ...digest.hoursByPerson.map((p) => p.count));
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
        <>
          {/* Who moved the needle (top) */}
          <section className="mt-8 bt-card">
            <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              Who moved the needle
            </h2>
            <p className="mt-1 text-xs text-fg-3">
              Skill level-ups, certifications, and training sessions per person.
            </p>
            {digest.leaderboard.length === 0 ? (
              <p className="mt-3 text-sm text-fg-3">No progress events logged this week.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {digest.leaderboard.map((p) => (
                  <li key={p.slug}>
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/crew/employees/${p.slug}`}
                        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="font-headline text-xs font-extrabold text-fg-2">
                        {p.count}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-edge">
                      <div
                        className="h-full rounded-full bg-orange"
                        style={{ width: `${Math.max(4, (p.count / maxNeedle) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Specific callouts */}
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {callouts.leveledUpPeople > 0 && (
              <Callout
                value={callouts.leveledUpPeople}
                label={`crew member${callouts.leveledUpPeople === 1 ? '' : 's'} leveled up`}
                accent="orange"
                note={
                  callouts.leveledUpEvents > callouts.leveledUpPeople
                    ? `${callouts.leveledUpEvents} skill level-ups total`
                    : undefined
                }
              />
            )}
            {callouts.certifiedTotal > 0 && (
              <Callout
                value={callouts.certifiedTotal}
                label="certified"
                accent="green"
                breakdown={callouts.certifiedByCert}
              />
            )}
            {callouts.failedTotal > 0 && (
              <Callout
                value={callouts.failedTotal}
                label={`failed a certification`}
                accent="rust"
                breakdown={callouts.failedByCert}
              />
            )}
            {callouts.hours > 0 && (
              <Callout
                value={`${fmtHours(callouts.hours)}h`}
                label="training logged"
                accent="bark"
              />
            )}
          </section>

          {/* Activity by day */}
          <section className="mt-6 bt-card">
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

          {/* Who specifically: level-ups, certs, fails */}
          <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <DetailList
              title={`Leveled up (${digest.skillUps.length})`}
              empty="None this week."
              items={digest.skillUps.map((s) => ({
                id: s.id,
                slug: s.employee_slug,
                name: s.employee_name,
                detail: s.description.replace(/\.$/, ''),
              }))}
            />
            <DetailList
              title={`Certified (${digest.certified.length})`}
              empty="None this week."
              items={digest.certified.map((c) => ({
                id: c.id,
                slug: c.employee_slug,
                name: c.employee_name,
                detail: c.certName,
              }))}
            />
            <DetailList
              title={`Did not pass (${digest.failed.length})`}
              empty="None this week."
              items={digest.failed.map((c) => ({
                id: c.id,
                slug: c.employee_slug,
                name: c.employee_name,
                detail: c.certName,
              }))}
            />
          </section>

          {/* Hours by person */}
          {digest.hoursByPerson.length > 0 && (
            <section className="mt-6 bt-card">
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                Training hours by person
              </h2>
              <ul className="mt-4 space-y-3">
                {digest.hoursByPerson.map((p) => (
                  <li key={p.slug}>
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/crew/employees/${p.slug}`}
                        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="font-headline text-xs font-extrabold text-fg-2">
                        {fmtHours(p.count)}h
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-edge">
                      <div
                        className="h-full rounded-full bg-green-dark"
                        style={{ width: `${Math.max(4, (p.count / maxHours) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Callout({
  value,
  label,
  accent,
  breakdown,
  note,
}: {
  value: number | string;
  label: string;
  accent: 'orange' | 'green' | 'rust' | 'bark';
  breakdown?: CertGroup[];
  note?: string;
}) {
  const color =
    accent === 'orange'
      ? 'text-orange'
      : accent === 'green'
        ? 'text-green-dark'
        : accent === 'rust'
          ? 'text-orange-press'
          : 'text-bark-deep';
  return (
    <div className="bt-card">
      <p className={`font-display text-5xl ${color}`}>{value}</p>
      <p className="mt-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
      {note && <p className="mt-1 text-[11px] text-fg-3">{note}</p>}
      {breakdown && breakdown.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-paper-edge pt-2">
          {breakdown.map((b) => (
            <li
              key={b.name}
              className="flex items-center justify-between text-xs text-fg-2"
            >
              <span className="truncate pr-2">{b.name}</span>
              <span className="font-headline font-extrabold text-bark-deep">{b.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: string; slug: string; name: string; detail: string }[];
  empty: string;
}) {
  return (
    <div className="bt-card">
      <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-fg-3">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="text-sm">
              <Link
                href={`/crew/employees/${it.slug}`}
                className="font-headline font-extrabold text-bark-deep hover:underline"
              >
                {it.name}
              </Link>{' '}
              <span className="text-fg-2">— {it.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
