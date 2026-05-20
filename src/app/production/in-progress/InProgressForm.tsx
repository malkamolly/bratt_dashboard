'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveInProgressAmounts, type WipSaveResult } from './actions';
import type { Crew } from '@/types';

type Meta = Record<
  string,
  { amount: number; updated_at: string | null; updated_by: string | null }
>;

type Props = {
  crews: Crew[];
  initial: Record<string, number>;
  meta: Meta;
  justSaved: boolean;
};

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save All'}
    </button>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const sec = Math.round((Date.now() - then.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function InProgressForm({ crews, initial, meta, justSaved }: Props) {
  const [state, formAction] = useActionState<WipSaveResult, FormData>(
    saveInProgressAmounts,
    undefined,
  );

  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of crews) {
      const v = initial[c.id];
      m[c.id] = v != null && v !== 0 ? String(v) : '';
    }
    return m;
  });

  const total = useMemo(() => {
    return Object.values(amounts).reduce((s, raw) => {
      const n = Number(String(raw).replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? s + n : s;
    }, 0);
  }, [amounts]);

  const dirty = useMemo(() => {
    for (const c of crews) {
      const before = initial[c.id] ?? 0;
      const after =
        Number(String(amounts[c.id] ?? '').replace(/[$,\s]/g, '')) || 0;
      if (Math.round(before * 100) !== Math.round(after * 100)) return true;
    }
    return false;
  }, [amounts, crews, initial]);

  const totalCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(total);

  return (
    <form action={formAction} className="space-y-6">
      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. Numbers will refresh on the dashboard.
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
                Crew
              </th>
              <th className="px-5 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                In-Progress ($)
              </th>
              <th className="px-5 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {crews.map((c, idx) => {
              const m = meta[c.id];
              return (
                <tr
                  key={c.id}
                  className={idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'}
                >
                  <td className="px-5 py-2 font-headline text-base font-bold text-ink">
                    {c.name}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      name={`amount__${c.id}`}
                      value={amounts[c.id] ?? ''}
                      onChange={(e) =>
                        setAmounts((p) => ({ ...p, [c.id]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-40 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                    />
                  </td>
                  <td className="px-5 py-2 text-right text-xs text-fg-3">
                    {m?.updated_at ? (
                      <>
                        {fmtRelative(m.updated_at)}
                        {m.updated_by && (
                          <>
                            <br />
                            <span className="text-fg-3/80">by {m.updated_by}</span>
                          </>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
              <td className="px-5 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                Total In Progress
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
          href="/production"
          className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
        >
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
