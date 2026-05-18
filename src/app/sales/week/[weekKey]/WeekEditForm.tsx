'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  saveWeekEntries,
  deleteWeekCell,
  type SaveWeekResult,
} from './actions';
import { fmtUsd } from '@/lib/format';
import type { Salesperson } from '@/types';
import type { IsoDate } from '@/lib/dates';

type Props = {
  weekKey: IsoDate;
  /** Every calendar day in the week that's in the target month, Mon→Sun. */
  days: IsoDate[];
  /** Subset of `days` that are M-F (not a holiday). Weekend/holiday rows are
   *  still editable but visually labeled so users see when a sale is off-hours. */
  workingDaySet: IsoDate[];
  salespeople: Salesperson[];
  /** Map keyed by `${date}__${salesperson_id}` -> amount. */
  initialAmounts: Record<string, number>;
  year: number;
  month: number;
};

function cellKey(date: IsoDate, salespersonId: string): string {
  return `${date}__${salespersonId}`;
}

function dayLabel(iso: IsoDate): { weekday: string; date: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
    date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Saving…' : 'Save Week'}
    </button>
  );
}

export function WeekEditForm({
  weekKey,
  days,
  workingDaySet,
  salespeople,
  initialAmounts,
  year,
  month,
}: Props) {
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveWeekResult, FormData>(
    saveWeekEntries,
    undefined,
  );

  const workingDays = useMemo(() => new Set(workingDaySet), [workingDaySet]);

  // String map so users can clear a cell and we still track the edit.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const d of days) {
      for (const sp of salespeople) {
        const k = cellKey(d, sp.id);
        const v = initialAmounts[k];
        m[k] = v != null && v !== 0 ? String(v) : '';
      }
    }
    return m;
  });

  const numericAmounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of Object.keys(amounts)) {
      const raw = amounts[k] ?? '';
      const n = Number(String(raw).replace(/[$,\s]/g, ''));
      m[k] = Number.isFinite(n) ? n : 0;
    }
    return m;
  }, [amounts]);

  const dayTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of days) {
      let sum = 0;
      for (const sp of salespeople) sum += numericAmounts[cellKey(d, sp.id)] ?? 0;
      m[d] = sum;
    }
    return m;
  }, [numericAmounts, days, salespeople]);

  const spTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const sp of salespeople) {
      let sum = 0;
      for (const d of days) sum += numericAmounts[cellKey(d, sp.id)] ?? 0;
      m[sp.id] = sum;
    }
    return m;
  }, [numericAmounts, days, salespeople]);

  const weekTotal = useMemo(
    () => Object.values(dayTotals).reduce((s, n) => s + n, 0),
    [dayTotals],
  );

  const dirty = useMemo(() => {
    for (const k of Object.keys(amounts)) {
      const initial = initialAmounts[k] ?? 0;
      const current = numericAmounts[k] ?? 0;
      if (Math.round(initial * 100) !== Math.round(current * 100)) return true;
    }
    return false;
  }, [amounts, numericAmounts, initialAmounts]);

  const justSaved = searchParams.get('saved') === '1';
  const justDeleted = searchParams.get('deleted') === '1';

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="week_key" value={weekKey} />
      <input type="hidden" name="year" value={String(year)} />
      <input type="hidden" name="month" value={String(month)} />

      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. Dashboard totals will refresh.
        </div>
      )}
      {justDeleted && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Entry deleted.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <div className="bt-card !p-0 overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-paper-edge/40">
            <tr>
              <th className="sticky left-0 z-10 bg-paper-edge/40 px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Day
              </th>
              {salespeople.map((sp) => (
                <th
                  key={sp.id}
                  className="whitespace-nowrap px-3 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2"
                >
                  {sp.name}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Day Total
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, idx) => {
              const { weekday, date } = dayLabel(d);
              const isOffHours = !workingDays.has(d);
              return (
                <tr
                  key={d}
                  className={`${
                    idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'
                  } ${isOffHours ? 'bg-paper/30' : ''}`}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-4 py-2 font-headline text-sm font-bold text-ink">
                    <div className="flex flex-col leading-tight">
                      <span>
                        {weekday}
                        {isOffHours && (
                          <span className="ml-1.5 rounded-full bg-status-warn/30 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-ribbon text-fg-1">
                            Off
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-normal text-fg-3">
                        {date}
                      </span>
                    </div>
                  </td>
                  {salespeople.map((sp) => {
                    const k = cellKey(d, sp.id);
                    const hasExisting = initialAmounts[k] != null;
                    return (
                      <td key={sp.id} className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            name={`amount__${k}`}
                            value={amounts[k] ?? ''}
                            onChange={(e) =>
                              setAmounts((m) => ({ ...m, [k]: e.target.value }))
                            }
                            placeholder="0"
                            className="w-28 rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline text-sm focus:border-orange focus:outline-none"
                          />
                          {hasExisting ? (
                            <button
                              type="submit"
                              formAction={deleteWeekCell}
                              name="delete_target"
                              value={`${d}::${sp.id}`}
                              onClick={(e) => {
                                if (
                                  !window.confirm(
                                    `Delete ${sp.name}'s entry for ${date}? This can't be undone.`,
                                  )
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              title={`Delete ${sp.name}'s entry for ${date}`}
                              aria-label={`Delete ${sp.name}'s entry for ${date}`}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-paper-edge text-xs text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                            >
                              ×
                            </button>
                          ) : (
                            <span className="inline-block h-6 w-6 shrink-0" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-2 text-right font-headline text-sm font-extrabold text-ink">
                    {fmtUsd(dayTotals[d])}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-paper-edge/30 px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Salesperson Total
              </td>
              {salespeople.map((sp) => (
                <td
                  key={sp.id}
                  className="whitespace-nowrap px-3 py-3 text-right font-headline text-sm font-extrabold text-ink"
                >
                  {fmtUsd(spTotals[sp.id])}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-3 text-right font-headline text-lg font-black text-ink">
                {fmtUsd(weekTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <a
          href={`/sales?year=${year}&month=${month}`}
          className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
        >
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
