'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveSalesEntries, deleteSalesEntry, type SaveResult } from './actions';
import type { Salesperson } from '@/types';

type Props = {
  date: string; // YYYY-MM-DD
  salespeople: Salesperson[];
  initialAmounts: Record<string, number>;
};

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Saving…' : 'Save Day'}
    </button>
  );
}

export function EntryForm({ date, salespeople, initialAmounts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveSalesEntries,
    undefined,
  );

  // Local state tracks the live inputs so we can show running totals and a
  // dirty flag without re-render gymnastics. The parent passes key={date}
  // which remounts this component when the date changes, so this initializer
  // always reflects the currently-selected day.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const sp of salespeople) {
      const v = initialAmounts[sp.id];
      m[sp.id] = v != null && v !== 0 ? String(v) : '';
    }
    return m;
  });

  const total = useMemo(() => {
    return Object.values(amounts).reduce((sum, raw) => {
      const n = Number(String(raw).replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
  }, [amounts]);

  const dirty = useMemo(() => {
    for (const sp of salespeople) {
      const initial = initialAmounts[sp.id] ?? 0;
      const current = Number(String(amounts[sp.id] ?? '').replace(/[$,\s]/g, '')) || 0;
      if (Math.round(initial * 100) !== Math.round(current * 100)) return true;
    }
    return false;
  }, [amounts, salespeople, initialAmounts]);

  const justSaved = searchParams.get('saved') === '1';
  const justDeleted = searchParams.get('deleted') === '1';

  function changeDate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('saved');
    params.delete('deleted');
    router.push(`/sales/entry?${params.toString()}`);
  }

  const totalCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(total);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entry_date" value={date} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1">
          <span className="bt-eyebrow">Entry Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>
        <p className="text-sm text-fg-2 sm:max-w-md">
          Need to fix a past day? Just change the date — existing numbers pre-fill
          so you can overwrite them. Use the <strong>×</strong> button to remove
          an entry entirely.
        </p>
      </div>

      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. Numbers will refresh on the dashboard.
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

      <div className="bt-card !p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-paper-edge/40">
            <tr>
              <th className="px-5 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Salesperson
              </th>
              <th className="px-5 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Amount ($)
              </th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {salespeople.map((sp, idx) => {
              const hasExistingEntry = initialAmounts[sp.id] != null;
              return (
                <tr
                  key={sp.id}
                  className={idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'}
                >
                  <td className="px-5 py-2 font-headline text-base font-bold text-ink">
                    {sp.name}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      name={`amount__${sp.id}`}
                      value={amounts[sp.id] ?? ''}
                      onChange={(e) =>
                        setAmounts((m) => ({ ...m, [sp.id]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-40 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    {hasExistingEntry ? (
                      <button
                        type="submit"
                        name="delete_salesperson_id"
                        value={sp.id}
                        formAction={deleteSalesEntry}
                        onClick={(e) => {
                          if (
                            !window.confirm(
                              `Delete ${sp.name}'s entry for ${date}? This can't be undone.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                        title={`Delete ${sp.name}'s entry for this day`}
                        aria-label={`Delete ${sp.name}'s entry`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
              <td className="px-5 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                Day Total
              </td>
              <td className="px-5 py-3 text-right font-headline text-xl font-black text-ink">
                {totalCurrency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <a
          href="/sales"
          className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
        >
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
