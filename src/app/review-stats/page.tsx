// ============================================================================
// /review-stats — Proposal Reviews: who's reviewing the sales team's proposals?
// ============================================================================
// Answers "of the proposals sent for review, what share did each supervisor
// review?" with exact counts.
//
// The sweep is live (nothing cached), so it takes 20–60 seconds depending on the
// window. That's why the table streams in behind a Suspense fallback rather than
// blocking the whole page, and why maxDuration is raised well above the default.
// ============================================================================

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeReviewStats } from '@/lib/auth';
import { getConnection } from '@/lib/slack';
import {
  buildReviewReport,
  share,
  REVIEW_SUBTEAM_ID,
  SALES_CHANNELS,
  type ReviewReport,
} from '@/lib/review-attribution';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
] as const;

export default async function ReviewStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeReviewStats(user.email)) redirect('/access-denied');

  const params = await searchParams;
  const days = WINDOWS.some((w) => String(w.days) === params.days)
    ? Number(params.days)
    : 30;

  const connection = await getConnection(user.email);

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Proposal Reviews
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Proposal Reviews
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        When an arborist posts a proposal for review, a supervisor marks it with
        a ❤️. This counts those hearts across all {SALES_CHANNELS.length} sales
        channels and shows who did the reviewing.
      </p>

      {!connection ? (
        <section className="mt-10 rounded-card border-[3px] border-paper-edge bg-white p-8 text-center">
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Connect your Slack first
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-fg-2">
            This reads the sales channels <strong>as you</strong> — only what you
            can already see, and read-only. Connect once on the Slack Tags page
            and this report works from then on.
          </p>
          <Link
            href="/tags"
            className="mt-6 inline-block rounded-2 border-2 border-bark-deep bg-bark-deep px-6 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-white transition-colors hover:bg-orange hover:border-orange"
          >
            Go to Slack Tags &rarr;
          </Link>
        </section>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
              Show
            </span>
            {WINDOWS.map((w) => (
              <Link
                key={w.days}
                href={`/review-stats?days=${w.days}`}
                className={`rounded-2 border-2 px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                  w.days === days
                    ? 'border-orange bg-orange text-white'
                    : 'border-paper-edge bg-white text-fg-2 hover:border-orange'
                }`}
              >
                {w.label}
              </Link>
            ))}
          </div>

          {/* keyed on `days` so switching window re-triggers the fallback */}
          <Suspense key={days} fallback={<Loading days={days} />}>
            <Report token={connection.token} days={days} />
          </Suspense>
        </>
      )}
    </main>
  );
}

function Loading({ days }: { days: number }) {
  return (
    <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-white p-8">
      <p className="font-headline text-lg font-black uppercase text-bark-deep">
        Counting hearts…
      </p>
      <p className="mt-2 text-sm text-fg-2">
        Reading {days} days across {SALES_CHANNELS.length} channels. This takes
        20–60 seconds — it&rsquo;s checking every message, not a sample. Leave
        the page open.
      </p>
    </section>
  );
}

async function Report({ token, days }: { token: string; days: number }) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);

  let report: ReviewReport;
  try {
    report = await buildReviewReport(token, { since, until });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return (
      <section className="mt-8 rounded-card border-[3px] border-orange bg-orange/5 p-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          Couldn&rsquo;t build the report
        </h2>
        <p className="mt-3 text-sm text-fg-1">{message}</p>
        <p className="mt-3 text-sm text-fg-2">
          If it mentions <code>missing_scope</code> or{' '}
          <code>invalid_auth</code>, reconnect Slack from{' '}
          <Link href="/tags" className="underline">
            Slack Tags
          </Link>{' '}
          and try again.
        </p>
      </section>
    );
  }

  if (!report.total) {
    return (
      <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-white p-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          No review requests found
        </h2>
        <p className="mt-3 text-sm text-fg-2">
          Nothing in {report.windowLabel} mentioned the review group. If the team
          has switched to a different @-group, <code>REVIEW_SUBTEAM_ID</code> in{' '}
          <code>src/lib/review-attribution.ts</code> needs updating (it&rsquo;s
          currently <code>{REVIEW_SUBTEAM_ID}</code>).
        </p>
      </section>
    );
  }

  const top = report.reviewers.slice(0, 4);

  return (
    <>
      {/* ---- The headline answer ------------------------------------------ */}
      <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-white p-6 sm:p-8">
        <p className="bt-eyebrow">{report.windowLabel}</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Who did the reviewing
        </h2>

        <div className="mt-6 space-y-4">
          {report.reviewers.map((r) => (
            <div key={r.id}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-headline text-lg font-extrabold uppercase text-ink">
                  {r.name}
                </span>
                <span className="whitespace-nowrap text-sm text-fg-2">
                  <strong className="font-headline text-xl text-ink">
                    {share(r.count, report.attributions)}
                  </strong>{' '}
                  · {r.count} review{r.count === 1 ? '' : 's'}
                </span>
              </div>
              {/* Simple proportional bar — no chart library needed for one series. */}
              <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-paper-edge/40">
                <div
                  className="h-full rounded-full bg-orange"
                  style={{
                    width: `${report.attributions ? (r.count / report.attributions) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-4 border-t-2 border-paper-edge pt-6 sm:grid-cols-3">
          <Stat label="Proposals sent for review" value={report.total} />
          <Stat
            label="Reviewed"
            value={`${report.reviewedCount} (${share(report.reviewedCount, report.total)})`}
          />
          <Stat
            label="No ❤️ yet"
            value={`${report.unreviewedCount} (${share(report.unreviewedCount, report.total)})`}
          />
        </dl>
      </section>

      {/* ---- Week by week ------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          Week by week
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-2">
          This is the view worth reading. Coverage runs in multi-day stretches —
          one supervisor picks up the load while the other is out — so the split
          swings a lot from week to week, and a single overall percentage hides
          that.
        </p>
        <Breakdown groups={report.byWeek} reviewers={top} firstHeading="Week of" />
      </section>

      {/* ---- By arborist -------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="font-headline text-xl font-black uppercase text-bark-deep">
          By arborist
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-2">
          Whether a supervisor is spread across the team or concentrated on
          particular people.
        </p>
        <Breakdown groups={report.byChannel} reviewers={top} firstHeading="Channel" />
      </section>

      {/* ---- Honest limits ------------------------------------------------ */}
      <section className="mt-8 rounded-card border-2 border-paper-edge bg-paper-edge/10 p-6">
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
          Worth knowing about these numbers
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-fg-2">
          {report.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden className="text-fg-3">
                •
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-fg-3">
        Every message checked individually — {report.total} requests, no
        sampling. Reviewer columns count reviewer-per-message, so a proposal
        hearted by two supervisors counts once for each.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </dt>
      <dd className="mt-1 font-headline text-2xl font-black text-ink">{value}</dd>
    </div>
  );
}

/**
 * Shared table for the week and arborist breakdowns. Wrapped in an
 * overflow-x-auto container so a wide table scrolls itself rather than making
 * the whole page scroll sideways on a phone.
 */
function Breakdown({
  groups,
  reviewers,
  firstHeading,
}: {
  groups: { label: string; total: number; perReviewer: Record<string, number> }[];
  reviewers: { id: string; name: string }[];
  firstHeading: string;
}) {
  const firstName = (full: string) => full.split(' ')[0];

  if (!groups.length) {
    return <p className="mt-4 text-sm text-fg-3">No reviews in this window.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-card border-[3px] border-paper-edge bg-white">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b-2 border-paper-edge text-left">
            <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
              {firstHeading}
            </th>
            <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
              Reviews
            </th>
            {reviewers.map((r) => (
              <th
                key={r.id}
                className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3"
              >
                {firstName(r.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label} className="border-b border-paper-edge/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                {g.label}
              </td>
              <td className="px-4 py-3 text-right text-fg-2">{g.total}</td>
              {reviewers.map((r) => {
                const n = g.perReviewer[r.id] ?? 0;
                return (
                  <td key={r.id} className="px-4 py-3 text-right">
                    <span className="text-ink">{n}</span>
                    <span className="ml-1.5 text-xs text-fg-3">
                      {share(n, g.total)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
