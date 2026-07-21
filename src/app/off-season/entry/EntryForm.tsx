'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  saveOffSeasonDay,
  deleteOffSeasonDay,
  type SaveResult,
} from '../actions';

type Row = {
  key: string; // `${workType}__${osWindow}`
  workType: string;
  typeLabel: string;
  windowLabel: string;
  scheduled: string;
  discount: string;
};

type Props = {
  date: string;
  seasonId: string;
  rows: Row[];
  hasExisting: boolean;
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

export function EntryForm({ date, seasonId, rows, hasExisting }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveOffSeasonDay,
    undefined,
  );

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      m[`scheduled__${r.key}`] = r.scheduled;
      m[`discount__${r.key}`] = r.discount;
    }
    return m;
  });

  const dirty = useMemo(() => {
    for (const r of rows) {
      if (fields[`scheduled__${r.key}`] !== r.scheduled) return true;
      if (fields[`discount__${r.key}`] !== r.discount) return true;
    }
    return false;
  }, [fields, rows]);

  const justSaved = searchParams.get('saved') === '1';
  const justDeleted = searchParams.get('deleted') === '1';

  function changeDate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('saved');
    params.delete('deleted');
    router.push(`/off-season/entry?${params.toString()}`);
  }

  function set(name: string, value: string) {
    setFields((m) => ({ ...m, [name]: value }));
  }

  // Group the four tracks by work type (two fieldsets, two windows each).
  const groups = Array.from(new Set(rows.map((r) => r.workType))).map(
    (wt) => ({
      workType: wt,
      typeLabel: rows.find((r) => r.workType === wt)!.typeLabel,
      rows: rows.filter((r) => r.workType === wt),
    }),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entry_date" value={date} />
      <input type="hidden" name="season_id" value={seasonId} />

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
        <p className="text-sm text-fg-2 sm:max-w-xs">
          Fixing a past day? Change the date &mdash; existing numbers pre-fill so
          you can overwrite them.
        </p>
      </div>

      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. The dashboard will show the new numbers.
        </div>
      )}
      {justDeleted && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Day cleared.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <fieldset key={g.workType} className="bt-card !p-5">
            <legend className="px-1 font-headline text-lg font-black uppercase text-bark-deep">
              {g.typeLabel}
            </legend>
            <div className="mt-2 space-y-4">
              {g.rows.map((r) => (
                <div key={r.key}>
                  <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-wood">
                    {r.windowLabel}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="bt-eyebrow">Booked so far ($)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`scheduled__${r.key}`}
                        value={fields[`scheduled__${r.key}`] ?? ''}
                        onChange={(e) => set(`scheduled__${r.key}`, e.target.value)}
                        placeholder="0"
                        className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="bt-eyebrow">Discount given ($)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`discount__${r.key}`}
                        value={fields[`discount__${r.key}`] ?? ''}
                        onChange={(e) => set(`discount__${r.key}`, e.target.value)}
                        placeholder="0"
                        className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div>
          {hasExisting && (
            <button
              type="submit"
              formAction={deleteOffSeasonDay}
              onClick={(e) => {
                if (
                  !window.confirm(
                    `Clear all numbers for ${date}? This can't be undone.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
              className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
            >
              Clear this day
            </button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
          <a
            href="/off-season"
            className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
          >
            Back to Dashboard
          </a>
          <SaveButton dirty={dirty} />
        </div>
      </div>
    </form>
  );
}
