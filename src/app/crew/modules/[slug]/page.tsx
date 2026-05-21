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
  listModuleSlides,
  listModuleQuestions,
  listAssignmentsForModule,
  listEmployees,
} from '@/lib/crew-data';
import { assignTrainingModule, startTrainingAttempt } from '@/app/crew/actions';

export const dynamic = 'force-dynamic';

const SECTION_LABELS: Record<string, string> = {
  intro: 'Intro',
  equipment: 'Equipment',
  safety: 'Safety',
  operations: 'Operations',
  maintenance: 'Maintenance',
  best_practices: 'Best Practices',
  closing: 'Closing',
};

const SECTION_ORDER = [
  'intro',
  'equipment',
  'safety',
  'operations',
  'maintenance',
  'best_practices',
  'closing',
];

export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ assigned?: string; error?: string }>;
}) {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const { slug } = await params;
  const sp = await searchParams;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();

  const [slides, questions, assignments, employees] = await Promise.all([
    listModuleSlides(slug),
    listModuleQuestions(slug),
    listAssignmentsForModule(slug),
    listEmployees({ activeOnly: true }),
  ]);

  // Bucket slides by section so we can show counts.
  const slidesBySection = new Map<string, number>();
  for (const s of slides) {
    const sec = s.section ?? 'intro';
    slidesBySection.set(sec, (slidesBySection.get(sec) ?? 0) + 1);
  }
  const presentSections = SECTION_ORDER.filter((s) => slidesBySection.get(s));

  const safetyCount = questions.filter((q) => q.safety_critical).length;

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
            v{mod.version} · {slides.length} slides · {questions.length} questions ·{' '}
            {safetyCount} safety-critical · Pass {mod.pass_threshold}%
          </p>
        </div>
        {slides.length > 0 && presentSections[0] && (
          <Link
            href={`/crew/modules/${mod.slug}/present/${presentSections[0]}`}
            className="bt-btn bt-btn-primary"
          >
            Present deck →
          </Link>
        )}
      </header>

      {sp.assigned && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Assigned to {sp.assigned} crew member{Number(sp.assigned) === 1 ? '' : 's'}.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {/* ---------- Sections of the deck ---------- */}
      <section className="mt-10">
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">
          Deck sections
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {presentSections.map((sec) => (
            <li key={sec}>
              <Link
                href={`/crew/modules/${mod.slug}/present/${sec}`}
                className="block rounded-card border-2 border-paper-edge bg-paper p-3 hover:border-orange"
              >
                <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  {slidesBySection.get(sec)} slides
                </p>
                <p className="mt-0.5 font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
                  {SECTION_LABELS[sec] ?? sec}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

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
                    Status
                  </th>
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
                          <div className="flex flex-wrap gap-2">
                            {a.latest_attempt?.certificate_number ? (
                              <Link
                                href={`/crew/certificates/${a.latest_attempt.certificate_number}`}
                                className="bt-btn bt-btn-dark !text-[10px] !px-2 !py-1"
                              >
                                Certificate
                              </Link>
                            ) : null}
                            <form action={startTrainingAttempt}>
                              <input type="hidden" name="assignment_id" value={a.id} />
                              <button
                                type="submit"
                                className="bt-btn bt-btn-primary !text-[10px] !px-2 !py-1"
                              >
                                {a.latest_attempt ? 'Retake' : 'Start test'}
                              </button>
                            </form>
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
