// ============================================================================
// Trainings catalog — /crew/trainings
// ============================================================================
// Lists every tracked training. Marks card-required (physical card we mail
// the employee) and hours-based (saw hours) trainings.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { getCatalogs } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function TrainingsCatalogPage() {
  await requireHubAccess('crew');
  const { trainings } = await getCatalogs();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Trainings
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Trainings
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Every employee is tracked against the {trainings.length} trainings
        below. Items marked <span className="font-extrabold">Card</span> have a
        physical card we mail the employee and confirm separately;{' '}
        <span className="font-extrabold">Hours</span> entries track a running
        tally instead of a completion date.
      </p>

      <div className="mt-8 overflow-hidden rounded-card border border-paper-edge bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-bone">
            <tr>
              <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                Display name
              </th>
              <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                Tracks
              </th>
            </tr>
          </thead>
          <tbody>
            {trainings.map((t) => (
              <tr key={t.key} className="border-t border-paper-edge/60">
                <td className="px-4 py-2">
                  <Link
                    href={`/crew/trainings/${t.key}`}
                    className="font-headline font-extrabold text-bark-deep hover:underline"
                  >
                    {t.display_name}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {t.is_hours_based ? (
                      <span className="inline-flex items-center rounded-full bg-teal text-white px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon">
                        Hours
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-paper-edge text-fg-2 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon">
                        Completion date
                      </span>
                    )}
                    {t.card_required && (
                      <span className="inline-flex items-center rounded-full bg-orange text-white px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon">
                        Card
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-card border border-paper-edge bg-paper p-5">
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
          Status conventions
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-fg-2">
          <li>
            <strong>Not yet</strong> — no record on the employee&apos;s profile.
          </li>
          <li>
            <strong>In progress</strong> — currently working on it.
          </li>
          <li>
            <strong>Completed</strong> — completion date is on file.
          </li>
          <li>
            <strong>Completed · date TBD</strong> — recognized as completed, but
            the actual date isn&apos;t recorded yet.
          </li>
          <li>
            <strong>Card pending</strong> (card-required trainings only) —
            completion is logged, but the physical card hasn&apos;t arrived.
          </li>
        </ul>
      </div>
    </main>
  );
}
