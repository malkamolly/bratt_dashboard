'use client';

// ============================================================================
// TestTaker
// ============================================================================
// Client-side test form. Tracks one answer per question, supports
// "answer all required" guard, and submits via the submitTrainingAttempt
// server action which calls into the SECURITY DEFINER grading function.
//
// On submit:
//   - The grader runs server-side (the answer key never reaches the browser).
//   - The grader marks the attempt, logs activity, and — on pass — completes
//     the linked training row for the employee.
//   - This component navigates to the result/certificate page.
// ============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { submitTrainingAttempt } from '@/app/crew/actions';
import type { ModuleQuestion } from '@/lib/crew-data';

type Props = {
  attemptId: string;
  moduleSlug: string;
  moduleName: string;
  employeeName: string;
  passThreshold: number;
  requiresAllSafety: boolean;
  questions: ModuleQuestion[];
  exitHref: string;
};

type Choice = 'A' | 'B' | 'C' | 'D';

export function TestTaker({
  attemptId,
  moduleSlug,
  moduleName,
  employeeName,
  passThreshold,
  requiresAllSafety,
  questions,
  exitHref,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Choice | null>>(() => {
    const init: Record<string, Choice | null> = {};
    for (const q of questions) init[q.id] = null;
    return init;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalQs = questions.length;
  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v != null).length,
    [answers],
  );
  const unansweredIndexes = useMemo(
    () =>
      questions
        .map((q, i) => (answers[q.id] == null ? i + 1 : null))
        .filter((n): n is number => n !== null),
    [answers, questions],
  );

  function pick(qid: string, letter: Choice) {
    setAnswers((prev) => ({ ...prev, [qid]: letter }));
  }

  function submit() {
    setError(null);
    if (unansweredIndexes.length > 0) {
      setError(
        `Please answer every question. Missing: ${unansweredIndexes
          .map((n) => `#${n}`)
          .join(', ')}`,
      );
      // Scroll to the first unanswered question.
      const el = document.getElementById(`q-${unansweredIndexes[0]}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!confirm(`Submit ${employeeName}'s test? You won't be able to change answers after this.`)) {
      return;
    }

    startTransition(async () => {
      const result = await submitTrainingAttempt({
        attempt_id: attemptId,
        answers: questions.map((q) => ({ question_id: q.id, chosen: answers[q.id] })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Send the user to the result screen. The grader stored the
      // certificate number (or null on fail) on the attempt row.
      router.push(`/crew/modules/${moduleSlug}/result/${attemptId}`);
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {/* ---------- Sticky header (test meta + progress) ---------- */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-paper-edge bg-cream/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="bt-eyebrow">{moduleName}</p>
            <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep">
              {employeeName}
            </p>
          </div>
          <div className="text-right">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              {answeredCount} / {totalQs} answered
            </p>
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Pass {passThreshold}%
              {requiresAllSafety && ' · all ★ correct'}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Instructions ---------- */}
      <section className="rounded-card border-2 border-paper-edge bg-paper p-5 text-sm text-fg-2">
        <p>
          Pick ONE answer per question. Multiple selections are scored as
          incorrect. Closed book — no notes, no phones, no help.
        </p>
        <p className="mt-2">
          <span className="font-headline font-extrabold text-orange">★</span> marks
          a safety-critical question — these must all be answered correctly to
          pass, regardless of overall score.
        </p>
      </section>

      {/* ---------- Questions ---------- */}
      <ol className="mt-6 space-y-6">
        {questions.map((q, idx) => (
          <li
            key={q.id}
            id={`q-${idx + 1}`}
            className={`rounded-card border-2 p-5 ${
              q.safety_critical ? 'border-orange/60 bg-orange/5' : 'border-paper-edge bg-paper'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                {q.section ? `${q.section} · ` : ''}Question {idx + 1}
              </p>
              {q.safety_critical && (
                <span className="inline-flex items-center rounded-full bg-orange px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
                  ★ Safety-critical
                </span>
              )}
            </div>
            <p className="mt-2 text-base text-ink">{q.prompt}</p>
            <ul className="mt-3 space-y-2">
              {q.choices.map((c) => {
                const selected = answers[q.id] === c.letter;
                return (
                  <li key={c.letter}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2 border px-3 py-2 ${
                        selected
                          ? 'border-orange bg-orange/10'
                          : 'border-paper-edge bg-cream hover:border-bark-deep/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={c.letter}
                        checked={selected}
                        onChange={() => pick(q.id, c.letter)}
                        className="mt-1 h-4 w-4 accent-orange"
                      />
                      <span>
                        <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
                          {c.letter}.
                        </span>{' '}
                        <span className="text-sm text-ink">{c.text}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      {/* ---------- Submit ---------- */}
      <section className="mt-8 rounded-card border-2 border-paper-edge bg-paper p-5">
        {error && (
          <p className="mb-3 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bt-btn bt-btn-primary disabled:opacity-60"
          >
            {isPending ? 'Submitting…' : 'Submit test'}
          </button>
          <Link href={exitHref} className="bt-btn bt-btn-ghost">
            Cancel
          </Link>
        </div>
        <p className="mt-3 text-xs text-fg-3">
          Once submitted, this attempt is final. Retakes go through the
          assignments list on the module page.
        </p>
      </section>
    </main>
  );
}
