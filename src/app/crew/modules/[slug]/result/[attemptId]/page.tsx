// ============================================================================
// Test result — /crew/modules/[slug]/result/[attemptId]
// ============================================================================
// After submission, this page summarizes pass/fail, score, safety-critical
// status, and links to the printable certificate when applicable.
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { requireHubAccess } from '@/lib/auth';
import { getTrainingModule } from '@/lib/crew-data';
import { serverClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ResultPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  await requireHubAccess('crew');
  const { slug, attemptId } = await params;

  const mod = await getTrainingModule(slug);
  if (!mod) notFound();

  const supabase = await serverClient();
  const { data } = await supabase
    .from('field_crew_training_attempts')
    .select(
      'id, submitted_at, score_correct, score_total, passed, missed_safety_critical, certificate_number,' +
        ' field_crew_training_assignments!inner(' +
        '   employee_slug,' +
        '   field_crew_employees!inner(name)' +
        ' )',
    )
    .eq('id', attemptId)
    .maybeSingle();

  if (!data) notFound();

  type Row = {
    id: string;
    submitted_at: string | null;
    score_correct: number | null;
    score_total: number | null;
    passed: boolean | null;
    missed_safety_critical: boolean | null;
    certificate_number: string | null;
    field_crew_training_assignments:
      | {
          employee_slug: string;
          field_crew_employees: { name: string } | { name: string }[] | null;
        }
      | {
          employee_slug: string;
          field_crew_employees: { name: string } | { name: string }[] | null;
        }[]
      | null;
  };
  const row = data as unknown as Row;
  const assignment = Array.isArray(row.field_crew_training_assignments)
    ? row.field_crew_training_assignments[0]
    : row.field_crew_training_assignments;
  const employeeName = assignment
    ? Array.isArray(assignment.field_crew_employees)
      ? assignment.field_crew_employees[0]?.name ?? assignment.employee_slug
      : assignment.field_crew_employees?.name ?? assignment.employee_slug
    : '—';
  const employeeSlug = assignment?.employee_slug;

  const passed = row.passed === true;
  const score = `${row.score_correct ?? 0} / ${row.score_total ?? mod.pass_threshold}`;
  const pct =
    row.score_total && row.score_total > 0
      ? Math.round(((row.score_correct ?? 0) / row.score_total) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/modules" className="hover:underline">
          Training modules
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Result
      </p>

      <div
        className={`mt-4 rounded-card border-[3px] p-8 ${
          passed ? 'border-green-dark bg-green-dark/5' : 'border-orange-press bg-orange/5'
        }`}
      >
        <p className="bt-eyebrow">{mod.name}</p>
        <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
          {passed ? 'Passed' : 'Did not pass'}
        </h1>
        <p className="mt-3 text-fg-2">{employeeName}</p>

        <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Score
            </dt>
            <dd className="mt-0.5 font-headline text-lg font-extrabold text-bark-deep">
              {score}
              <span className="ml-1 text-xs text-fg-3">({pct}%)</span>
            </dd>
          </div>
          <div>
            <dt className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Threshold
            </dt>
            <dd className="mt-0.5 font-headline text-lg font-extrabold text-bark-deep">
              {mod.pass_threshold}%
            </dd>
          </div>
          <div>
            <dt className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Submitted
            </dt>
            <dd className="mt-0.5 font-headline text-sm font-extrabold text-bark-deep">
              {row.submitted_at
                ? format(parseISO(row.submitted_at), 'MMM d, yyyy')
                : '—'}
            </dd>
          </div>
        </dl>

        {row.missed_safety_critical && !passed && (
          <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
            One or more safety-critical questions were missed. Per the policy,
            this is an automatic fail regardless of overall score. Retraining
            is required.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {passed && row.certificate_number && (
            <Link
              href={`/crew/certificates/${row.certificate_number}`}
              className="bt-btn bt-btn-primary"
            >
              View certificate →
            </Link>
          )}
          {!passed && (
            <Link href={`/crew/modules/${mod.slug}`} className="bt-btn bt-btn-primary">
              Back to module
            </Link>
          )}
          {employeeSlug && (
            <Link href={`/crew/employees/${employeeSlug}`} className="bt-btn bt-btn-dark">
              {employeeName}&apos;s profile
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
