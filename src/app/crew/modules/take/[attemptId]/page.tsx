// ============================================================================
// Test-taking page — /crew/modules/take/[attemptId]
// ============================================================================
// Loads the attempt + assignment + questions and hands them to the
// TestTaker client component. Manager-only (the start-attempt action also
// enforces canEditCrew).
//
// Important: this page never queries the answer key. Grading happens in
// the SECURITY DEFINER `field_crew_grade_attempt` SQL function so correct
// answers never reach the browser, even when a manager is signed in.
// ============================================================================

import { notFound, redirect } from 'next/navigation';
import { getAllowedUser, canEditCrew } from '@/lib/auth';
import {
  getTrainingModule,
  listModuleQuestions,
} from '@/lib/crew-data';
import { serverClient } from '@/lib/supabase';
import { TestTaker } from '@/components/crew/TestTaker';

export const dynamic = 'force-dynamic';

export default async function TakeTestPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canEditCrew(user.role)) redirect('/access-denied');

  const { attemptId } = await params;

  const supabase = await serverClient();
  const { data: attempt } = await supabase
    .from('field_crew_training_attempts')
    .select(
      'id, assignment_id, submitted_at,' +
        ' field_crew_training_assignments!inner(' +
        '   module_slug, employee_slug,' +
        '   field_crew_employees!inner(name)' +
        ' )',
    )
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) notFound();

  type AttemptRow = {
    id: string;
    assignment_id: string;
    submitted_at: string | null;
    field_crew_training_assignments:
      | {
          module_slug: string;
          employee_slug: string;
          field_crew_employees: { name: string } | { name: string }[] | null;
        }
      | {
          module_slug: string;
          employee_slug: string;
          field_crew_employees: { name: string } | { name: string }[] | null;
        }[]
      | null;
  };
  const row = attempt as unknown as AttemptRow;
  const a = Array.isArray(row.field_crew_training_assignments)
    ? row.field_crew_training_assignments[0]
    : row.field_crew_training_assignments;
  if (!a) notFound();

  // If this attempt is already submitted, send the user to the result page
  // — we don't allow editing answers after grading.
  if (row.submitted_at) {
    redirect(`/crew/modules/${a.module_slug}/result/${row.id}`);
  }

  const employeeName = Array.isArray(a.field_crew_employees)
    ? a.field_crew_employees[0]?.name ?? a.employee_slug
    : a.field_crew_employees?.name ?? a.employee_slug;

  const [mod, questions] = await Promise.all([
    getTrainingModule(a.module_slug),
    listModuleQuestions(a.module_slug),
  ]);
  if (!mod) notFound();

  return (
    <TestTaker
      attemptId={row.id}
      moduleSlug={mod.slug}
      moduleName={mod.name}
      employeeName={employeeName}
      passThreshold={mod.pass_threshold}
      requiresAllSafety={mod.requires_all_safety}
      questions={questions}
      exitHref={`/crew/modules/${mod.slug}`}
    />
  );
}
