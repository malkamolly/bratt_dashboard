// ============================================================================
// Employee profile — /crew/employees/[slug]
// ============================================================================
// Layout, top to bottom:
//   1. Breadcrumb + header (name, foreman/specialty pills, position meta)
//   2. Recent activity & notes
//   3. Skills — compact card grid showing current level for every skill
//   4. Trainings — table with hours aggregated from logged sessions
//   5. Training session log (most-recent first)
//   6. Log-new-session form (admin / field_manager only)
//   7. Development plans
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { startTrainingAttempt } from '@/app/crew/actions';
import {
  getCatalogs,
  getEmployee,
  listActivity,
  listPlansForEmployee,
  listTrainingSessionsForEmployee,
  getHoursByTrainingForEmployee,
  listCertificatesForEmployee,
  listAssignmentsForEmployee,
  type TrainingSession,
} from '@/lib/crew-data';
import { SkillLevelCard } from '@/components/crew/SkillLevelCard';
import { ForemanPill, SpecialtyPill } from '@/components/crew/CrewPills';
import { TrainingSessionForm } from '@/components/crew/TrainingSessionForm';

export const dynamic = 'force-dynamic';

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireHubAccess('crew');
  const { slug } = await params;
  const { saved } = await searchParams;
  const editable = canEditCrew(user.role);

  const employee = await getEmployee(slug);
  if (!employee) notFound();

  // Is the signed-in user viewing their own profile? Used to surface the
  // "Take test" button to a field_crew user looking at their own page.
  const isSelf =
    !!employee.auth_email &&
    employee.auth_email.toLowerCase() === user.email.toLowerCase();

  const [
    { positions, skills, trainings, specialties },
    activity,
    plans,
    sessions,
    hoursByTraining,
    certificates,
    assignments,
  ] = await Promise.all([
    getCatalogs(),
    listActivity({ slug, limit: 50 }),
    listPlansForEmployee(slug),
    listTrainingSessionsForEmployee(slug),
    getHoursByTrainingForEmployee(slug),
    listCertificatesForEmployee(slug),
    listAssignmentsForEmployee(slug),
  ]);

  const positionName =
    positions.find((p) => p.key === employee.position_key)?.display_name ??
    'Unassigned';
  const specialtyByKey = new Map(specialties.map((s) => [s.key, s.display_name]));
  const activePlans = plans.filter((p) => p.status === 'active');
  const completedPlans = plans.filter((p) => p.status === 'completed');

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* ---------- Breadcrumb ---------- */}
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

      {/* ---------- Header ---------- */}
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
                ? format(parseISO(employee.hire_date), 'MMM d, yyyy')
                : 'TBD'
            }
          />
          <Meta label="Status" value={employee.active ? 'Active' : 'Inactive'} />
        </dl>
      </header>

      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/crew/employees/${employee.slug}`}
            className="bt-btn bt-btn-dark text-xs"
          >
            Edit profile &rarr;
          </Link>
          {saved && (
            <span className="rounded-full bg-green/15 px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
              Saved
            </span>
          )}
        </div>
      )}

      {/* ---------- Recent activity + log-training form ----------
          Side-by-side on lg+ screens for editors (admins / field_manager);
          activity expands to full width for view-only users since the form
          isn't rendered. */}
      <section
        className={
          editable
            ? 'mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start'
            : 'mt-8'
        }
      >
        <div className="bt-card">
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
                      <span className="mt-0.5 shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
                        {format(parseISO(a.occurred_on), 'MMM d, yyyy')}
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
        </div>

        {editable && (
          <TrainingSessionForm
            employeeSlug={employee.slug}
            employeeName={employee.name}
            trainings={trainings.map((t) => ({
              key: t.key,
              display_name: t.display_name,
            }))}
          />
        )}
      </section>

      {/* ---------- Skills (compact card grid) ---------- */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
            Skills
          </h2>
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            {employee.name}&apos;s current ratings
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {skills.map((s) => (
            <SkillLevelCard
              key={s.key}
              skillName={s.display_name}
              level={employee.skills[s.key] ?? null}
            />
          ))}
        </div>
      </section>

      {/* ---------- Trainings ---------- */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
            Trainings
          </h2>
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Hours-based totals come from the session log below
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-card border border-paper-edge bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-bone">
              <tr>
                <th className="px-4 py-2 text-left font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
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
                const hoursAgg = hoursByTraining[t.key];
                // If a module is assigned for this training and the latest
                // attempt hasn't passed yet, force the status to "In progress".
                const linkedAssignment = assignments.find(
                  (a) => a.module_training_key === t.key,
                );
                const openAssignment =
                  !!linkedAssignment && linkedAssignment.latest_attempt?.passed !== true;
                return (
                  <tr key={t.key} className="border-t border-paper-edge/60">
                    <td className="px-4 py-2 text-ink">
                      <Link
                        href={`/crew/trainings/${t.key}`}
                        className="hover:underline"
                      >
                        {t.display_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <TrainingStatus
                        rec={rec}
                        hoursBased={t.is_hours_based}
                        cardRequired={t.card_required}
                        hoursLogged={hoursAgg?.total ?? 0}
                        openAssignment={openAssignment}
                      />
                    </td>
                    <td className="px-3 py-2 text-fg-2">
                      {t.is_hours_based ? (
                        hoursAgg && hoursAgg.total > 0 ? (
                          <>
                            {formatHours(hoursAgg.total)} hrs
                            {hoursAgg.lastLogged && (
                              <span className="ml-1 text-xs text-fg-3">
                                (last {format(parseISO(hoursAgg.lastLogged), 'MMM d, yyyy')})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )
                      ) : rec?.completed ? (
                        format(parseISO(rec.completed), 'MMM d, yyyy')
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.card_required ? (
                        rec?.card_received ? (
                          <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
                            {format(parseISO(rec.card_received), 'MMM yyyy')}
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

      {/* ---------- Training session log ---------- */}
      <section className="mt-10">
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
          Training log
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">
            No training sessions logged yet.{' '}
            {editable && 'Use the form below to add the first one.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => (
              <SessionLogRow key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>

      {/* (Log-training form lives next to Recent activity at the top of the page.) */}

      {/* ---------- Training modules + certificates ---------- */}
      <section className="mt-12">
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
          Training modules
        </h2>
        {assignments.length === 0 && certificates.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">
            No training modules assigned.{' '}
            <Link href="/crew/modules" className="text-orange hover:underline">
              Browse modules &rarr;
            </Link>
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {certificates.length > 0 && (
              <div>
                <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Certificates earned
                </h3>
                <ul className="mt-2 space-y-2">
                  {certificates.map((c) => (
                    <li
                      key={c.certificate_number}
                      className="flex flex-wrap items-baseline justify-between gap-3 rounded-card border border-paper-edge bg-paper p-3 text-sm"
                    >
                      <div>
                        <Link
                          href={`/crew/certificates/${c.certificate_number}`}
                          className="font-headline font-extrabold text-bark-deep hover:underline"
                        >
                          {c.module_name}
                        </Link>
                        <span className="ml-2 text-fg-2">
                          {c.score_correct} / {c.score_total} ·{' '}
                          {c.passed_on ? format(parseISO(c.passed_on), 'MMM d, yyyy') : '—'}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-fg-3">{c.certificate_number}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assignments.length > 0 && (
              <div>
                <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                  Assignments
                </h3>
                <ul className="mt-2 space-y-2">
                  {assignments.map((a) => {
                    const passed = a.latest_attempt?.passed;
                    const status =
                      passed === true
                        ? 'Passed'
                        : passed === false
                          ? 'Failed'
                          : 'In progress';
                    const statusColor =
                      passed === true
                        ? 'bg-green-dark text-white'
                        : passed === false
                          ? 'bg-orange-press text-white'
                          : 'bg-paper-edge text-fg-2';
                    // The "Take test" button shows when:
                    //   - viewer is admin / field_manager (canEdit), OR
                    //   - viewer's email matches the profile owner (self).
                    // We don't render it once a passing attempt exists —
                    // there's nothing to take.
                    const canTake = (editable || isSelf) && passed !== true;
                    return (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-paper-edge bg-paper p-3 text-sm"
                      >
                        <Link
                          href={`/crew/modules/${a.module_slug}`}
                          className="font-headline font-extrabold text-bark-deep hover:underline"
                        >
                          {a.module_name}
                        </Link>
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${statusColor}`}
                          >
                            {status}
                          </span>
                          {canTake && (
                            <form action={startTrainingAttempt}>
                              <input type="hidden" name="assignment_id" value={a.id} />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-primary !text-[10px] !px-2.5 !py-1"
                              >
                                {a.latest_attempt ? 'Retake' : 'Take test'}
                              </button>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Plans ---------- */}
      <section className="mt-12">
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
  hoursLogged,
  openAssignment,
}: {
  rec:
    | {
        completed: string | null;
        card_received: string | null;
        hours: number | null;
        status: string | null;
      }
    | undefined;
  hoursBased: boolean;
  cardRequired: boolean;
  hoursLogged: number;
  openAssignment: boolean;
}) {
  // Hours-based trainings: derived purely from the session log.
  if (hoursBased) {
    if (hoursLogged > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-green/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
          Logging hours
        </span>
      );
    }
    if (openAssignment) {
      return (
        <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
          In progress
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-paper-edge px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Not yet
      </span>
    );
  }

  // Completion-based trainings: fall back to the existing record state.
  if (!rec) {
    if (openAssignment) {
      return (
        <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
          In progress
        </span>
      );
    }
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
  if (cardRequired && rec.card_received) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
        On file
      </span>
    );
  }
  // Anything else (status='completed_date_tbd', 'card_pending',
  // 'in_progress', etc.) means "we're working on it" — render uniformly
  // as "In progress" so the table reads consistently.
  return (
    <span className="inline-flex items-center rounded-full bg-status-warn/30 px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
      In progress
    </span>
  );
}

function SessionLogRow({ session }: { session: TrainingSession }) {
  const total = session.entries.reduce((sum, e) => sum + e.hours, 0);
  return (
    <li className="rounded-card border border-paper-edge bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
          {format(parseISO(session.session_date), 'EEEE, MMM d, yyyy')}
        </p>
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
          {formatHours(total)} hrs total
        </p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {session.entries.map((e) => (
          <li
            key={e.id}
            className="inline-flex items-center rounded-full border border-paper-edge bg-cream px-2.5 py-0.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep"
          >
            {e.training_name}
            <span className="ml-1.5 text-orange">{formatHours(e.hours)}h</span>
          </li>
        ))}
      </ul>
      {session.notes && (
        <p className="mt-3 text-sm text-fg-2">{session.notes}</p>
      )}
    </li>
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
          <>, target {format(parseISO(plan.target_date), 'MMM d, yyyy')}</>
        )}
      </span>
    </li>
  );
}

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
}
