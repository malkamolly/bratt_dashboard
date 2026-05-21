'use client';

// ============================================================================
// TrainingRowEditor
// ============================================================================
// One row on the per-training detail page. Two shapes:
//
//   - Completion-based training → editable completed date, card_received
//     date (when the training is card-required), notes. Save button per row.
//   - Hours-based training → read-only total hours + last-logged date +
//     inline "Add hours" form (date + hours + notes) that creates a 1-entry
//     session.
//
// The action handlers are the same ones used elsewhere; this is just an
// inline editor so an admin / field_manager doesn't have to bounce through
// the employee profile to update one cell.
// ============================================================================

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  setEmployeeTrainingRecord,
  logHoursForTraining,
} from '@/app/crew/actions';
import type { TrainingEmployeeRecord } from '@/lib/crew-data';

type Props = {
  record: TrainingEmployeeRecord;
  training: {
    key: string;
    display_name: string;
    is_hours_based: boolean;
    card_required: boolean;
  };
  editable: boolean;
};

export function TrainingRowEditor({ record, training, editable }: Props) {
  if (training.is_hours_based) {
    return <HoursRow record={record} training={training} editable={editable} />;
  }
  return <CompletionRow record={record} training={training} editable={editable} />;
}

// ---------- Completion-based row ----------

function CompletionRow({ record, training, editable }: Props) {
  const router = useRouter();
  const [completed, setCompleted] = useState(record.completed ?? '');
  const [cardReceived, setCardReceived] = useState(record.card_received ?? '');
  const [notes, setNotes] = useState(record.notes ?? '');
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const dirty =
    (completed || null) !== (record.completed ?? null) ||
    (cardReceived || null) !== (record.card_received ?? null) ||
    (notes.trim() || null) !== (record.notes ?? null);

  function save() {
    setFlash(null);
    startTransition(async () => {
      const result = await setEmployeeTrainingRecord({
        employee_slug: record.employee_slug,
        training_key: training.key,
        completed: completed || null,
        card_received: cardReceived || null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFlash({ kind: 'err', msg: result.error });
        return;
      }
      setFlash({ kind: 'ok', msg: 'Saved.' });
      router.refresh();
      // Hide the success message after a moment so the row settles.
      setTimeout(() => setFlash(null), 2000);
    });
  }

  return (
    <tr className="border-t border-paper-edge/60 align-top">
      <td className="px-3 py-2.5">
        <Link
          href={`/crew/employees/${record.employee_slug}`}
          className="font-headline text-sm font-extrabold text-bark-deep hover:underline"
        >
          {record.employee_name}
        </Link>
        {record.position_name && (
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            {record.position_name}
          </p>
        )}
      </td>
      <td className="px-2 py-2.5">
        <StatusChip
          completed={completed || null}
          cardReceived={cardReceived || null}
          cardRequired={training.card_required}
        />
      </td>
      <td className="px-2 py-2.5">
        {editable ? (
          <input
            type="date"
            value={completed}
            onChange={(e) => setCompleted(e.target.value)}
            className="w-36 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
          />
        ) : completed ? (
          <span className="text-sm text-fg-2">{format(parseISO(completed), 'MMM d, yyyy')}</span>
        ) : (
          <span className="text-sm text-fg-3">—</span>
        )}
      </td>
      {training.card_required && (
        <td className="px-2 py-2.5">
          {editable ? (
            <input
              type="date"
              value={cardReceived}
              onChange={(e) => setCardReceived(e.target.value)}
              className="w-36 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
            />
          ) : cardReceived ? (
            <span className="text-sm text-fg-2">{format(parseISO(cardReceived), 'MMM d, yyyy')}</span>
          ) : (
            <span className="text-sm text-fg-3">—</span>
          )}
        </td>
      )}
      <td className="px-2 py-2.5">
        {editable ? (
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes…"
            className="w-full rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
          />
        ) : notes ? (
          <span className="text-sm text-fg-2">{notes}</span>
        ) : (
          <span className="text-sm text-fg-3">—</span>
        )}
      </td>
      {editable && (
        <td className="px-2 py-2.5">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isPending}
            className="bt-btn bt-btn-primary !text-[10px] !px-3 !py-1.5 disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {flash && (
            <p
              className={`mt-1 text-[10px] font-headline font-extrabold uppercase tracking-ribbon ${flash.kind === 'ok' ? 'text-green-dark' : 'text-orange-press'}`}
            >
              {flash.msg}
            </p>
          )}
        </td>
      )}
    </tr>
  );
}

function StatusChip({
  completed,
  cardReceived,
  cardRequired,
}: {
  completed: string | null;
  cardReceived: string | null;
  cardRequired: boolean;
}) {
  if (completed) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
        Completed
      </span>
    );
  }
  if (cardRequired && cardReceived) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
        On file
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-paper-edge px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
      Not yet
    </span>
  );
}

// ---------- Hours-based row ----------

function HoursRow({ record, training, editable }: Props) {
  const router = useRouter();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [hoursToAdd, setHoursToAdd] = useState('');
  const [sessionDate, setSessionDate] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  function addHours() {
    const n = Number(hoursToAdd);
    if (!Number.isFinite(n) || n <= 0) {
      setFlash({ kind: 'err', msg: 'Enter hours > 0.' });
      return;
    }
    setFlash(null);
    startTransition(async () => {
      const result = await logHoursForTraining({
        employee_slug: record.employee_slug,
        training_key: training.key,
        session_date: sessionDate,
        hours: n,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFlash({ kind: 'err', msg: result.error });
        return;
      }
      setHoursToAdd('');
      setNotes('');
      setFlash({ kind: 'ok', msg: `+${n}h logged.` });
      router.refresh();
      setTimeout(() => setFlash(null), 2000);
    });
  }

  return (
    <tr className="border-t border-paper-edge/60 align-top">
      <td className="px-3 py-2.5">
        <Link
          href={`/crew/employees/${record.employee_slug}`}
          className="font-headline text-sm font-extrabold text-bark-deep hover:underline"
        >
          {record.employee_name}
        </Link>
        {record.position_name && (
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            {record.position_name}
          </p>
        )}
      </td>
      <td className="px-2 py-2.5">
        <span className="font-headline text-sm font-extrabold text-bark-deep">
          {formatHours(record.hours_total)}
          <span className="ml-1 font-normal text-fg-3">hrs</span>
        </span>
      </td>
      <td className="px-2 py-2.5 text-sm text-fg-2">
        {record.last_logged ? format(parseISO(record.last_logged), 'MMM d, yyyy') : <span className="text-fg-3">—</span>}
      </td>
      {editable && (
        <td className="px-2 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              placeholder="+ hrs"
              value={hoursToAdd}
              onChange={(e) => setHoursToAdd(e.target.value)}
              className="w-20 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
            />
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-32 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note (optional)"
              className="min-w-[8rem] flex-1 rounded-2 border border-paper-edge bg-cream px-2 py-1 text-xs focus:border-orange focus:outline-none"
            />
            <button
              type="button"
              onClick={addHours}
              disabled={isPending || !hoursToAdd}
              className="bt-btn bt-btn-primary !text-[10px] !px-3 !py-1.5 disabled:opacity-40"
            >
              {isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
          {flash && (
            <p
              className={`mt-1 text-[10px] font-headline font-extrabold uppercase tracking-ribbon ${flash.kind === 'ok' ? 'text-green-dark' : 'text-orange-press'}`}
            >
              {flash.msg}
            </p>
          )}
        </td>
      )}
    </tr>
  );
}

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
