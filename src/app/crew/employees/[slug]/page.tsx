// ============================================================================
// Employee profile — /crew/employees/[slug]
// ============================================================================
// Mirrors the Jekyll employee.html layout: header with position/hire/status,
// recent activity, skill table, training table, active development plans.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import {
  getCatalogs,
  getEmployee,
  listActivity,
  listPlansForEmployee,
} from '@/lib/crew-data';
import { SkillBadge } from '@/components/crew/SkillBadge';
import { ForemanPill, SpecialtyPill } from '@/components/crew/CrewPills';

export const dynamic = 'force-dynamic';

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireHubAccess('crew');
  const { slug } = await params;
  const editable = canEditCrew(user.role);

  const employee = await getEmployee(slug);
  if (!employee) notFound();

  const [{ positions, skills, trainings, specialties }, activity, plans] =
    await Promise.all([
      getCatalogs(),
      listActivity({ slug, limit: 50 }),
      listPlansForEmployee(slug),
    ]);

  const positionName =
    positions.find((p) => p.key === employee.position_key)?.display_name ??
    'Unassigned';
  const specialtyByKey = new Map(specialties.map((s) => [s.key, s.display_name]));
  const activePlans = plans.filter((p) => p.status === 'active');
  const completedPlans = plans.filter((p) => p.status === 'completed');

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Crew profile
      </p>

      {/* ---------- Profile header ---------- */}
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            {employee.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {employee.leads_crew && <ForemanPill size="md" />}
            {employee.specialties.map((sp) => (
              <SpecialtyPill
                key={sp}
                specialtyKey={sp}
                label={specialtyByKey.get(sp) ?? sp}
                size="md"
              />
            ))}
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
              Code {employee.code}
            </span>
            {!employee.active && (
              <span className="rounded-full bg-paper-edge px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
                Inactive
              </span>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-4 text-sm sm:min-w-[18rem]">
          <Meta label="Position" value={positionName} />
          <Meta
            label="Hire date"
            value={
              employee.hire_date
                ? format(new Date(employee.hire_date), 'MMM d, yyyy')
                : 'TBD'
            }
          />
          <Meta label="Status" value={employee.active ? 'Active' : 'Inactive'} />
        </dl>
      </header>

      {editable && (
        <div className="mt-4">
          <Link
            href={`/admin/crew/employees/${employee.slug}`}
            className="bt-btn bt-btn-dark text-xs"
          >
            Edit profile &rarr;
          </Link>
        </div>
      )}

      {/* ---------- Recent activity + notes ---------- */}
      <section className="mt-8 bt-card">
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
          Recent activity &amp; notes
        </h2>
        {activity.length === 0 && !employee.notes ? (
          <p className="mt-3 text-sm text-fg-3">No activity logged yet.</p>
        ) : (
          <>
            {activity.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3 mt-0.5">
                      {format(new Date(a.occurred_on), 'MMM d, yyyy')}
                    </span>
                    <span className="text-ink">{a.description}</span>
                  </li>
                ))}
              </ul>
            )}
            {employee.notes && (
              <div className="mt-5 border-t border-paper-edge pt-4">
                <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Notes
                </h3>
                <div className="prose prose-sm mt-2 max-w-none text-fg-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {employee.notes}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Skills + Trainings grids ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Skills */}
        <section>
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
            Skills
          </h2>
          <div className="mt-3 overflow-hidden rounded-card border border-paper-edge bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-bone">
                <tr>
                  <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Skill
                  </th>
                  <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.key} className="border-t border-paper-edge/60">
                    <td className="px-4 py-2 text-ink">{s.display_name}</td>
                    <td className="px-4 py-2">
                      <SkillBadge level={employee.skills[s.key] ?? null} verbose />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Trainings */}
        <section>
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
            Trainings
          </h2>
          <div className="mt-3 overflow-hidden rounded-card border border-paper-edge bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-bone">
                <tr>
                  <th className="px-3 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Training
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Date / Hours
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Card
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((t) => {
                  const rec = employee.trainings[t.key];
                  return (
                    <tr key={t.key} className="border-t border-paper-edge/60">
                      <td className="px-3 py-2 text-ink">{t.display_name}</td>
                      <td className="px-3 py-2">
                        <TrainingStatus rec={rec} hoursBased={t.is_hours_based} cardRequired={t.card_required} />
                      </td>
                      <td className="px-3 py-2 text-fg-2">
                        {t.is_hours_based && rec?.hours != null ? (
                          <>
                            {rec.hours} hrs
                            {rec.last_updated && (
                              <span className="ml-1 text-xs text-fg-3">
                                (as of {format(new Date(rec.last_updated), 'MMM d, yyyy')})
                              </span>
                            )}
                          </>
                        ) : rec?.completed ? (
                          format(new Date(rec.completed), 'MMM d, yyyy')
                        ) : rec?.status === 'completed_date_tbd' ? (
                          <span className="text-fg-3">TBD</span>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {t.card_required ? (
                          rec?.card_received ? (
                            <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
                              {format(new Date(rec.card_received), 'MMM yyyy')}
                            </span>
                          ) : rec?.status === 'card_pending' ||
                            rec?.status === 'completed_date_tbd' ? (
                            <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                              Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-paper-edge px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                              Not received
                            </span>
                          )
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ---------- Plans ---------- */}
      <section className="mt-10">
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
          Development plans
        </h2>
        {activePlans.length === 0 && completedPlans.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">
            No development plans on file for {employee.name}.{' '}
            <Link href="/crew/plans" className="text-orange hover:underline">
              Browse all plans &rarr;
            </Link>
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {activePlans.length > 0 && (
              <div>
                <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Active
                </h3>
                <ul className="mt-2 space-y-2">
                  {activePlans.map((p) => (
                    <PlanListItem key={p.slug} plan={p} />
                  ))}
                </ul>
              </div>
            )}
            {completedPlans.length > 0 && (
              <div>
                <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Completed
                </h3>
                <ul className="mt-2 space-y-2">
                  {completedPlans.map((p) => (
                    <PlanListItem key={p.slug} plan={p} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </dt>
      <dd className="mt-0.5 font-headline text-sm font-extrabold text-bark-deep">
        {value}
      </dd>
    </div>
  );
}

function TrainingStatus({
  rec,
  hoursBased,
  cardRequired,
}: {
  rec: { completed: string | null; card_received: string | null; hours: number | null; status: string | null } | undefined;
  hoursBased: boolean;
  cardRequired: boolean;
}) {
  if (!rec) {
    return (
      <span className="inline-flex items-center rounded-full bg-paper-edge px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Not yet
      </span>
    );
  }
  if (rec.completed) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
        Completed
      </span>
    );
  }
  if (hoursBased && rec.hours != null) {
    return (
      <span className="inline-flex items-center rounded-full bg-green/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
        Logging hours
      </span>
    );
  }
  if (cardRequired && rec.card_received) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
        On file
      </span>
    );
  }
  if (rec.status === 'completed_date_tbd') {
    return (
      <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
        Completed · date TBD
      </span>
    );
  }
  if (rec.status === 'card_pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
        Card pending
      </span>
    );
  }
  if (rec.status === 'in_progress') {
    return (
      <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
      {rec.status?.replace(/_/g, ' ') ?? 'In progress'}
    </span>
  );
}

function PlanListItem({
  plan,
}: {
  plan: {
    slug: string;
    skill_name: string;
    current_level: number;
    target_level: number;
    target_date: string | null;
    status: 'active' | 'completed' | 'dropped';
  };
}) {
  return (
    <li className="rounded-card border border-paper-edge bg-paper p-3 text-sm">
      <Link
        href={`/crew/plans/${plan.slug}`}
        className="font-headline font-extrabold text-bark-deep hover:underline"
      >
        {plan.skill_name}
      </Link>{' '}
      <span className="text-fg-2">
        — L{plan.current_level} → L{plan.target_level}
        {plan.target_date && plan.status === 'active' && (
          <>, target {format(new Date(plan.target_date), 'MMM d, yyyy')}</>
        )}
      </span>
    </li>
  );
}
