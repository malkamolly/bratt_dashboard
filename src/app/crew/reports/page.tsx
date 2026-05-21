// ============================================================================
// Reports index — /crew/reports
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { listHuddles, getLatestHuddle } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function ReportsIndexPage() {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const [latest, recent] = await Promise.all([getLatestHuddle(), listHuddles(10)]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Reports
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Reports
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Where the daily huddle and the training activity feed live.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link href="/crew/reports/feed" className="bt-card transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Live</p>
          <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
            Activity feed
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Day-by-day list of skill bumps, training completions, and plan
            updates. Updated as the trainer logs them.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open &rarr;
          </p>
        </Link>

        <Link
          href={latest ? `/crew/reports/huddle/${latest.date}` : '/crew/reports/huddle'}
          className="bt-card transition-colors hover:!border-orange"
        >
          <p className="bt-eyebrow">
            {latest ? `Latest · ${format(parseISO(latest.date), 'MMM d, yyyy')}` : 'No huddles yet'}
          </p>
          <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
            Daily huddle
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            1–2 paragraphs the head trainer can copy/paste into Slack or email.
            Yesterday&apos;s activity, highlights, plans in flight, week ahead.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            {latest ? 'Read the latest' : 'No huddles yet'} &rarr;
          </p>
        </Link>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
            Huddle archive
          </h2>
          {editable && (
            <Link href="/admin/crew/huddles/new" className="bt-btn bt-btn-primary text-xs">
              Write today&apos;s huddle
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">No huddles on file yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-paper-edge rounded-card border border-paper-edge bg-paper">
            {recent.map((h) => (
              <li key={h.date} className="px-4 py-3 hover:bg-bone">
                <Link
                  href={`/crew/reports/huddle/${h.date}`}
                  className="flex items-center justify-between"
                >
                  <span className="font-headline font-extrabold text-bark-deep">
                    {format(parseISO(h.date), 'EEEE, MMM d, yyyy')}
                  </span>
                  <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
                    Read &rarr;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
