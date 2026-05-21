// ============================================================================
// Activity feed — /crew/reports/feed
// ============================================================================
// Full chronological list of every activity entry across all employees.
// ============================================================================

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { listActivity } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function ActivityFeedPage() {
  await requireHubAccess('crew');
  const activity = await listActivity({ limit: 200 });

  // Group by date for visual scanning.
  const byDate = new Map<string, typeof activity>();
  for (const a of activity) {
    const arr = byDate.get(a.occurred_on) ?? [];
    arr.push(a);
    byDate.set(a.occurred_on, arr);
  }
  const dates = Array.from(byDate.keys()).sort().reverse();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/reports" className="hover:underline">
          Reports
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Feed
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Activity feed
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Every skill bump, training completion, and plan update — newest first.
      </p>

      {dates.length === 0 ? (
        <div className="mt-8 rounded-card border-2 border-dashed border-paper-edge bg-paper p-8 text-center">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
            Empty
          </p>
          <p className="mt-2 text-sm text-fg-2">No activity logged yet.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {dates.map((d) => (
            <section key={d}>
              <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
                {format(parseISO(d), 'EEEE, MMM d, yyyy')}
              </h2>
              <ul className="mt-2 divide-y divide-paper-edge rounded-card border border-paper-edge bg-paper">
                {byDate.get(d)!.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <Link
                      href={`/crew/employees/${a.employee_slug}`}
                      className="font-headline font-extrabold text-bark-deep hover:underline"
                    >
                      {a.employee_name}
                    </Link>{' '}
                    <span className="text-fg-2">— {a.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
