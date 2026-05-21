// ============================================================================
// Plans index — /crew/plans
// ============================================================================
// Shows all development plans, split into Active (with overdue called out)
// and Completed/Dropped.
// ============================================================================

import Link from 'next/link';
import { format, parseISO, isBefore } from 'date-fns';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { listPlans, type PlanSummary } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function PlansIndexPage() {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const all = await listPlans();

  const active = all.filter((p) => p.status === 'active');
  const completed = all.filter((p) => p.status === 'completed');
  const dropped = all.filter((p) => p.status === 'dropped');
  const today = new Date();
  const overdue = active.filter(
    (p) => p.target_date && isBefore(parseISO(p.target_date), today),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Plans
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
          Development plans
        </h1>
        {editable && (
          <Link href="/admin/crew/plans/new" className="bt-btn bt-btn-primary text-sm">
            New plan
          </Link>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-fg-2">
        Each plan targets a specific skill level for a specific crew member by
        a target date. {active.length} active, {completed.length} completed,
        {' '}{dropped.length} dropped.
      </p>

      {overdue.length > 0 && (
        <div className="mt-6 rounded-card border-2 border-orange bg-orange/5 p-4">
          <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange-press">
            Overdue ({overdue.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.map((p) => (
              <li key={p.slug}>
                <PlanInlineLink plan={p} /> — target was{' '}
                {p.target_date && format(parseISO(p.target_date), 'MMM d, yyyy')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlanSection title="Active" plans={active} emptyMessage="No active plans." />
      <PlanSection title="Completed" plans={completed} emptyMessage="No completed plans yet." />
      {dropped.length > 0 && <PlanSection title="Dropped" plans={dropped} emptyMessage="" />}
    </main>
  );
}

function PlanSection({
  title,
  plans,
  emptyMessage,
}: {
  title: string;
  plans: PlanSummary[];
  emptyMessage: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
        {title}
      </h2>
      {plans.length === 0 ? (
        <p className="mt-2 text-sm text-fg-3">{emptyMessage}</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-card border border-paper-edge bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-bone">
              <tr>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Employee
                </th>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Skill
                </th>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  From → To
                </th>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Target
                </th>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Opened
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.slug} className="border-t border-paper-edge/60">
                  <td className="px-4 py-2">
                    <Link
                      href={`/crew/employees/${p.employee_slug}`}
                      className="font-headline font-extrabold text-bark-deep hover:underline"
                    >
                      {p.employee_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/crew/plans/${p.slug}`} className="text-ink hover:underline">
                      {p.skill_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-fg-2">
                    L{p.current_level} → L{p.target_level}
                  </td>
                  <td className="px-4 py-2 text-fg-2">
                    {p.target_date
                      ? format(parseISO(p.target_date), 'MMM d, yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-fg-3">
                    {format(parseISO(p.opened), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PlanInlineLink({ plan }: { plan: PlanSummary }) {
  return (
    <Link
      href={`/crew/plans/${plan.slug}`}
      className="font-headline font-extrabold text-bark-deep hover:underline"
    >
      {plan.employee_name} — {plan.skill_name} L{plan.current_level}→L{plan.target_level}
    </Link>
  );
}
