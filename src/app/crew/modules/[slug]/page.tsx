// ============================================================================
// Training module detail — /crew/modules/[slug]
// ============================================================================
// One screen for the whole training session:
//   - Module summary + "Present" button (launches the slide viewer)
//   - Section breakdown of the deck
//   - Assignment list (per crew member): pass/fail/attempt history
//   - Assign-to-crew form (managers only)
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import {
  getTrainingModule,
  listModuleQuestions,
  listAssignmentsForModule,
  listEmployees,
  listPracticalItems,
} from '@/lib/crew-data';
import { countSlides, loadSourceText } from '@/lib/training-deck';
import {
  assignTrainingModule,
  startTrainingAttempt,
  unassignTrainingModule,
} from '@/app/crew/actions';

export const dynamic = 'force-dynamic';

export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ assigned?: string; unassigned?: string; error?: string }>;
}) {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const { slug } = await params;
  const sp = await searchParams;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();

  const [questions, assignments, employees, practicalItems] = await Promise.all([
    listModuleQuestions(slug),
    listAssignmentsForModule(slug),
    listEmployees({ activeOnly: true }),
    listPracticalItems(slug),
  ]);

  const sourceText = await loadSourceText(slug);
  const slideCount = countSlides(sourceText);
  const hasDeck = slideCount > 0;
  const safetyCount = questions.filter((q) => q.safety_critical).length;
  const practicalTotal = practicalItems.length;
  const hasPractical = practicalTotal > 0;

  // Crew not yet assigned to this module — for the assignment form options.
  const assignedSlugs = new Set(assignments.map((a) => a.employee_slug));
  const unassigned = employees.filter((e) => !assignedSlugs.has(e.slug));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/modules" className="hover:underline">
          Training modules
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {mod.name}
      </p>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            {mod.name}
          </h1>
          {mod.description && (
            <p className="mt-3 max-w-2xl text-fg-2">{mod.description}</p>
          )}
          <p className="mt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            v{mod.version} · {slideCount} slides · {questions.length} questions ·{' '}
            {safetyCount} safety-critical · Pass {mod.pass_threshold}%
            {hasPractical ? ` · ${practicalTotal}-item practical` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <Link
              href={`/crew/modules/${mod.slug}/edit`}
              className="bt-btn bt-btn-dark"
            >
              Edit deck
            </Link>
          )}
          {hasDeck && (
            <Link
              href={`/crew/modules/${mod.slug}/present`}
              className="bt-btn bt-btn-primary"
            >
              Present deck →
            </Link>
          )}
        </div>
      </header>

      {sp.assigned && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Assigned to {sp.assigned} crew member{Number(sp.assigned) === 1 ? '' : 's'}.
        </p>
      )}
      {sp.unassigned && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Assignment removed.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {/* ---------- Deck status ---------- */}
      {!hasDeck && (
        <section className="mt-10 bt-card">
          <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
            No deck yet
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            This module doesn&apos;t have slide content authored yet.
            {editable ? ' Click "Edit deck" above to add slides.' : ''}
          </p>
        </section>
      )}

      {/* ---------- Assignments ---------- */}
      <section className="mt-10">
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
          Assignments
        </h2>
        {assignments.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">No crew assigned yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-card border border-paper-edge bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-bone">
                <tr>
                  <th className="px-4 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Employee
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Written
                  </th>
                  {hasPractical && (
                    <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      Practical
                    </th>
                  )}
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Score
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Last activity
                  </th>
                  {editable && (
                    <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                      &nbsp;
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const passed = a.latest_attempt?.passed;
                  const status =
                    passed === true
                      ? 'Passed'
                      : passed === false
                        ? 'Failed'
                        : a.latest_attempt
                          ? 'In progress'
                          : 'Assigned';
                  const statusColor =
                    passed === true
                      ? 'bg-green-dark text-white'
                      : passed === false
                        ? 'bg-orange-press text-white'
                        : 'bg-paper-edge text-fg-2';
                  return (
                    <tr key={a.id} className="border-t border-paper-edge/60">
                      <td className="px-4 py-2">
                        <Link
                          href={`/crew/employees/${a.employee_slug}`}
                          className="font-headline font-extrabold text-bark-deep hover:underline"
                        >
                          {a.employee_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${statusColor}`}
                        >
                          {status}
                        </span>
                      </td>
                      {hasPractical && (
                        <td className="px-3 py-2 text-fg-2">
                          {(() => {
                            const signed = a.practical_signed_count;
                            const done = signed >= practicalTotal;
                            return (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${
                                  done
                                    ? 'bg-green-dark text-white'
                                    : signed > 0
                                      ? 'bg-paper-edge text-bark-deep'
                                      : 'bg-paper-edge text-fg-2'
                                }`}
                              >
                                {signed} / {practicalTotal}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      <td className="px-3 py-2 text-fg-2">
                        {a.latest_attempt?.score_total
                          ? `${a.latest_attempt.score_correct} / ${a.latest_attempt.score_total}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-fg-3">
                        {a.latest_attempt?.submitted_at
                          ? format(parseISO(a.latest_attempt.submitted_at), 'MMM d, yyyy')
                          : format(parseISO(a.assigned_at), 'MMM d, yyyy')}
                      </td>
                      {editable && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {a.latest_attempt?.certificate_number ? (
                              <Link
                                href={`/crew/certificates/${a.latest_attempt.certificate_number}`}
                                className="bt-btn bt-btn-dark !text-[10px] !px-2 !py-1"
                              >
                                Certificate
                              </Link>
                            ) : null}
                            {hasPractical && (
                              <Link
                                href={`/crew/modules/${mod.slug}/practical/${a.id}`}
                                className="bt-btn bt-btn-dark !text-[10px] !px-2 !py-1"
                              >
                                Practical
                              </Link>
                            )}
                            <form action={startTrainingAttempt}>
                              <input type="hidden" name="assignment_id" value={a.id} />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-primary !text-[10px] !px-2 !py-1"
                              >
                                {a.latest_attempt ? 'Retake' : 'Start test'}
                              </button>
                            </form>
                            {passed !== true && (
                              <form action={unassignTrainingModule}>
                                <input type="hidden" name="assignment_id" value={a.id} />
                                <input
                                  type="hidden"
                                  name="return_to"
                                  value={`/crew/modules/${mod.slug}`}
                                />
                                <button
                                  type="submit"
                                  title="Remove this assignment"
                                  className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange-press"
                                >
                                  Unassign
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Assign form (managers only) ---------- */}
      {editable && unassigned.length > 0 && (
        <section className="mt-10 bt-card">
          <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
            Assign to crew
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            Pick everyone you want to certify on this module. They&apos;ll appear
            in the Assignments table above once you save.
          </p>
          <form action={assignTrainingModule} className="mt-4">
            <input type="hidden" name="module_slug" value={mod.slug} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {unassigned.map((e) => (
                <label
                  key={e.slug}
                  className="flex items-center gap-2 rounded-2 border border-paper-edge bg-cream px-3 py-2"
                >
                  <input
                    type="checkbox"
                    name="employee_slug"
                    value={e.slug}
                    className="h-4 w-4 accent-orange"
                  />
                  <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
                    {e.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <button type="submit" className="bt-btn bt-btn-primary">
                Assign module
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
