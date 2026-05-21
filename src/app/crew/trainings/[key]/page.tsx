// ============================================================================
// Per-training detail — /crew/trainings/[key]
// ============================================================================
// Shows ONE row per active crew member with all the editable fields for
// this training inline. Admins / field managers can update every cell
// without leaving the page.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getTraining, listTrainingEmployeeRecords } from '@/lib/crew-data';
import { TrainingRowEditor } from '@/components/crew/TrainingRowEditor';

export const dynamic = 'force-dynamic';

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const { key } = await params;

  const training = await getTraining(key);
  if (!training) notFound();

  const records = await listTrainingEmployeeRecords(key);

  // Header counts: how many employees have a "current" state vs not.
  const counts = records.reduce(
    (acc, r) => {
      if (training.is_hours_based) {
        if (r.hours_total > 0) acc.active += 1;
        else acc.pending += 1;
      } else if (r.completed || (training.card_required && r.card_received)) {
        acc.active += 1;
      } else {
        acc.pending += 1;
      }
      return acc;
    },
    { active: 0, pending: 0 },
  );

  const verb = training.is_hours_based ? 'Logging hours' : 'Completed';

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/trainings" className="hover:underline">
          Trainings
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {training.display_name}
      </p>

      <header className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            {training.display_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-paper-edge px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
              {training.is_hours_based ? 'Hours-based' : 'Completion date'}
            </span>
            {training.card_required && (
              <span className="inline-flex items-center rounded-full bg-orange text-white px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon">
                Card required
              </span>
            )}
          </div>
        </div>
        <div className="text-sm text-fg-2">
          <span className="font-headline text-base text-bark-deep font-extrabold">
            {counts.active}
          </span>{' '}
          {verb.toLowerCase()} ·{' '}
          <span className="font-headline text-base text-bark-deep font-extrabold">
            {counts.pending}
          </span>{' '}
          remaining
        </div>
      </header>

      {!editable && (
        <p className="mt-4 rounded-2 bg-paper px-3 py-2 text-xs text-fg-3">
          View-only — only admins and field managers can edit records here.
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-card border border-paper-edge bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-bone">
            <tr>
              <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                Employee
              </th>
              {training.is_hours_based ? (
                <>
                  <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Total hrs
                  </th>
                  <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Last logged
                  </th>
                  {editable && (
                    <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      Add hours
                    </th>
                  )}
                </>
              ) : (
                <>
                  <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Status
                  </th>
                  <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Completed
                  </th>
                  {training.card_required && (
                    <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      Card received
                    </th>
                  )}
                  <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Notes
                  </th>
                  {editable && (
                    <th className="px-2 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      &nbsp;
                    </th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <TrainingRowEditor
                key={r.employee_slug}
                record={r}
                training={{
                  key: training.key,
                  display_name: training.display_name,
                  is_hours_based: training.is_hours_based,
                  card_required: training.card_required,
                }}
                editable={editable}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
