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
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-[120px] sm:w-[140px]" />
            {days.map((d) => (
              <col key={d} />
            ))}
            <col className="w-[88px]" />
          </colgroup>
          <thead className="bg-paper-edge/40">
            <tr>
              <th className="sticky left-0 z-10 bg-paper-edge/40 px-3 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Salesperson
              </th>
              {days.map((d) => {
                const { weekday, date } = dayLabel(d);
                const isOffHours = !workingDays.has(d);
                return (
                  <th
                    key={d}
                    className={`py-3 pl-1.5 pr-7 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2 ${
                      isOffHours ? 'bg-paper/30' : ''
                    }`}
                  >
                    <div className="flex flex-col items-end leading-tight">
                      <span className="flex items-center gap-1">
                        {weekday}
                        {isOffHours && (
                          <span className="rounded-full bg-status-warn/30 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-ribbon text-fg-1">
                            Off
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-normal normal-case tracking-normal text-fg-3">
                        {date}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="px-2 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Week Total
              </th>
            </tr>
          </thead>
          <tbody>
            {salespeople.map((sp, idx) => (
              <tr
                key={sp.id}
                className={idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'}
              >
                <td className="sticky left-0 z-10 truncate bg-inherit px-3 py-2 font-headline text-sm font-bold text-ink">
                  {sp.name}
                </td>
                {days.map((d) => {
                  const { date } = dayLabel(d);
                  const k = cellKey(d, sp.id);
                  const hasExisting = initialAmounts[k] != null;
                  const isOffHours = !workingDays.has(d);
                  return (
                    <td
                      key={d}
                      className={`px-1.5 py-2 text-right ${
                        isOffHours ? 'bg-paper/30' : ''
                      }`}
                    >
                      <div className="group/cell relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          name={`amount__${k}`}
                          value={amounts[k] ?? ''}
                          onChange={(e) =>
                            setAmounts((m) => ({ ...m, [k]: e.target.value }))
                          }
                          placeholder="0"
                          className={`w-full rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline text-sm focus:border-orange focus:outline-none ${
                            hasExisting ? 'pr-6' : ''
                          }`}
                        />
                        {hasExisting && (
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
                            className="absolute right-1.5 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-xs leading-none text-fg-3 opacity-50 transition-opacity hover:bg-orange-press hover:text-white hover:opacity-100 focus:opacity-100 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right font-headline text-sm font-extrabold text-ink">
                  {fmtUsd(spTotals[sp.id])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
              <td className="sticky left-0 z-10 bg-paper-edge/30 px-3 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Day Total
              </td>
              {days.map((d) => {
                const isOffHours = !workingDays.has(d);
                return (
                  <td
                    key={d}
                    className={`py-3 pl-1.5 pr-7 text-right font-headline text-sm font-extrabold text-ink ${
                      isOffHours ? 'bg-paper/30' : ''
                    }`}
                  >
                    {fmtUsd(dayTotals[d])}
                  </td>
                );
              })}
              <td className="px-2 py-3 text-right font-headline text-base font-black text-ink">
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
