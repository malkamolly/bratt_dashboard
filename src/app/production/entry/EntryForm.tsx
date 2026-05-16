'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  saveProductionEntries,
  deleteProductionEntry,
  type SaveResult,
} from './actions';
import type { Crew } from '@/types';

type Props = {
  date: string;
  crews: Crew[];
  initialByCrew: Record<string, { jobs: number; revenue: number }>;
};

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save Day'}
    </button>
  );
}

export function EntryForm({ date, crews, initialByCrew }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveProductionEntries,
    undefined,
  );

  const [values, setValues] = useState<
    Record<string, { jobs: string; revenue: string }>
  >(() => {
    const m: Record<string, { jobs: string; revenue: string }> = {};
    for (const c of crews) {
      const v = initialByCrew[c.id];
      m[c.id] = {
        jobs: v && v.jobs ? String(v.jobs) : '',
        revenue: v && v.revenue ? String(v.revenue) : '',
      };
    }
    return m;
  });

  const totalRevenue = useMemo(() => {
    let s = 0;
    for (const v of Object.values(values)) {
      const n = Number(String(v.revenue).replace(/[$,\s]/g, ''));
      if (Number.isFinite(n)) s += n;
    }
    return s;
  }, [values]);

  const totalJobs = useMemo(() => {
    let s = 0;
    for (const v of Object.values(values)) {
      const n = Number(String(v.jobs).replace(/[\s,]/g, ''));
      if (Number.isFinite(n)) s += n;
    }
    return s;
  }, [values]);

  const dirty = useMemo(() => {
    for (const c of crews) {
      const initial = initialByCrew[c.id] ?? { jobs: 0, revenue: 0 };
      const cur = values[c.id] ?? { jobs: '', revenue: '' };
      const curJobs = Number(String(cur.jobs).replace(/[\s,]/g, '')) || 0;
      const curRev = Number(String(cur.revenue).replace(/[$,\s]/g, '')) || 0;
      if (curJobs !== initial.jobs) return true;
      if (Math.round(curRev * 100) !== Math.round(initial.revenue * 100)) return true;
    }
    return false;
  }, [values, crews, initialByCrew]);

  const justSaved = searchParams.get('saved') === '1';
  const justDeleted = searchParams.get('deleted') === '1';

  function changeDate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('saved');
    params.delete('deleted');
    router.push(`/production/entry?${params.toString()}`);
  }

  const fmtCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  const production = crews.filter((c) => c.kind === 'production');
  const phc = crews.filter((c) => c.kind === 'phc');

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
          Need to fix a past day? Change the date — existing numbers pre-fill so
          you can overwrite. Use the <strong>×</strong> button to remove a crew&apos;s row.
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

      <CrewGrid
        title="Production Crews"
        crews={production}
        values={values}
        setValues={setValues}
        initialByCrew={initialByCrew}
        date={date}
      />

      {phc.length > 0 && (
        <CrewGrid
          title="Plant Healthcare"
          crews={phc}
          values={values}
          setValues={setValues}
          initialByCrew={initialByCrew}
          date={date}
        />
      )}

      <div className="bt-card flex items-baseline justify-between !py-4">
        <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
          Day Total
        </span>
        <div className="text-right">
          <p className="font-headline text-2xl font-black text-ink">
            {fmtCurrency.format(totalRevenue)}
          </p>
          <p className="text-xs text-fg-3">
            {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a href="/production" className="bt-btn bt-btn-ghost">
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}

function CrewGrid({
  title,
  crews,
  values,
  setValues,
  initialByCrew,
  date,
}: {
  title: string;
  crews: Crew[];
  values: Record<string, { jobs: string; revenue: string }>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, { jobs: string; revenue: string }>>>;
  initialByCrew: Record<string, { jobs: number; revenue: number }>;
  date: string;
}) {
  return (
    <div>
      <h2 className="mb-2 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
        {title}
      </h2>
      <div className="bt-card !p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-paper-edge/40">
            <tr>
              <th className="px-5 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Crew
              </th>
              <th className="px-3 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Jobs
              </th>
              <th className="px-3 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Revenue ($)
              </th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {crews.map((c, idx) => {
              const has = initialByCrew[c.id] != null;
              const v = values[c.id] ?? { jobs: '', revenue: '' };
              return (
                <tr
                  key={c.id}
                  className={idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'}
                >
                  <td className="px-5 py-2 font-headline text-base font-bold text-ink">
                    {c.name}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`jobs__${c.id}`}
                      value={v.jobs}
                      onChange={(e) =>
                        setValues((m) => ({
                          ...m,
                          [c.id]: { ...m[c.id], jobs: e.target.value },
                        }))
                      }
                      placeholder="0"
                      className="w-20 rounded-2 border-2 border-paper-edge bg-white px-2 py-2 text-right font-headline focus:border-orange focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      name={`revenue__${c.id}`}
                      value={v.revenue}
                      onChange={(e) =>
                        setValues((m) => ({
                          ...m,
                          [c.id]: { ...m[c.id], revenue: e.target.value },
                        }))
                      }
                      placeholder="0"
                      className="w-36 rounded-2 border-2 border-paper-edge bg-white px-2 py-2 text-right font-headline focus:border-orange focus:outline-none"
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    {has ? (
                      <button
                        type="submit"
                        name="delete_crew_id"
                        value={c.id}
                        formAction={deleteProductionEntry}
                        onClick={(e) => {
                          if (
                            !window.confirm(
                              `Delete ${c.name}'s entry for ${date}? This can't be undone.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                        title={`Delete ${c.name}'s entry for this day`}
                        aria-label={`Delete ${c.name}'s entry`}
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
        </table>
      </div>
    </div>
  );
}
