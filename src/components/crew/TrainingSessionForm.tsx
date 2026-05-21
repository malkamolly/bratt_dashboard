'use client';

// ============================================================================
// TrainingSessionForm
// ============================================================================
// Client-side form for logging one training session (one date + notes,
// multiple (training, hours) rows). Submits to the recordTrainingSession
// server action.
//
// Visibility: only rendered for admin / field_manager users — the server
// action also enforces this.
// ============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordTrainingSession } from '@/app/crew/actions';

type TrainingOption = { key: string; display_name: string };

type Row = {
  // local-only id so React keys work when we add/remove rows
  rid: number;
  training_key: string;
  hours: string;
};

export function TrainingSessionForm({
  employeeSlug,
  employeeName,
  trainings,
}: {
  employeeSlug: string;
  employeeName: string;
  trainings: TrainingOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Default the date to today (in YYYY-MM-DD using local time).
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [sessionDate, setSessionDate] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { rid: 1, training_key: '', hours: '' },
  ]);
  const [nextRid, setNextRid] = useState(2);

  function addRow() {
    setRows((r) => [...r, { rid: nextRid, training_key: '', hours: '' }]);
    setNextRid((n) => n + 1);
  }

  function removeRow(rid: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((row) => row.rid !== rid)));
  }

  function updateRow(rid: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.rid === rid ? { ...row, ...patch } : row)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const entries = rows
      .map((r) => ({
        training_key: r.training_key,
        hours: Number(r.hours),
      }))
      .filter((e) => e.training_key && Number.isFinite(e.hours) && e.hours > 0);

    if (entries.length === 0) {
      setError('Add at least one training row with hours greater than zero.');
      return;
    }

    startTransition(async () => {
      const result = await recordTrainingSession({
        employee_slug: employeeSlug,
        session_date: sessionDate,
        notes: notes.trim() || null,
        entries,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reset on success.
      setSuccess(true);
      setNotes('');
      setRows([{ rid: nextRid, training_key: '', hours: '' }]);
      setNextRid((n) => n + 1);
      // Server action already revalidates, but force a soft refresh so the
      // activity log + hours totals re-render.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border-[3px] border-lime bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
          Log training
        </p>
        <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          {employeeName}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          required
          aria-label="Session date"
          className="rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Session notes"
          className="flex-1 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
        />
      </div>

      <div className="mt-3">
        <span className="block font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Trainings
        </span>
        <ul className="mt-1.5 space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.rid}
              className="grid grid-cols-[1fr_72px_auto] items-center gap-1.5"
            >
              <select
                value={row.training_key}
                onChange={(e) => updateRow(row.rid, { training_key: e.target.value })}
                className="rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
              >
                <option value="">Select training…</option>
                {trainings.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.display_name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                placeholder="Hrs"
                value={row.hours}
                onChange={(e) => updateRow(row.rid, { hours: e.target.value })}
                className="rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeRow(row.rid)}
                disabled={rows.length === 1}
                className="rounded-full px-1.5 py-1 font-headline text-[9px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:bg-paper-edge disabled:opacity-30"
                aria-label="Remove this training row"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-orange hover:underline"
        >
          + Add training
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-2 bg-orange/10 px-2 py-1 text-xs text-orange-press">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="mt-2 rounded-2 bg-green/10 px-2 py-1 text-xs text-green-dark">
          Saved.
        </p>
      )}

      <div className="mt-3">
        <button
          type="submit"
          disabled={isPending}
          className="bt-btn bt-btn-primary !text-[11px] !px-4 !py-2 disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save session'}
        </button>
      </div>
    </form>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
