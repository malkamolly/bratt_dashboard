'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveOffSeasonSettings, type SaveResult } from '../actions';

type WindowInput = {
  osWindow: string;
  windowLabel: string;
  goalAmount: number;
  milestoneStep: number;
};

type SeasonInput = {
  id: string;
  label: string;
  isCurrent: boolean;
  windows: WindowInput[];
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bt-btn bt-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Saving…' : 'Save Goals'}
    </button>
  );
}

export function SettingsForm({
  seasons,
  saved,
}: {
  seasons: SeasonInput[];
  saved: boolean;
}) {
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveOffSeasonSettings,
    undefined,
  );
  const [current, setCurrent] = useState(
    () => seasons.find((s) => s.isCurrent)?.id ?? seasons[0]?.id ?? '',
  );

  return (
    <form action={formAction} className="space-y-6">
      {saved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Goals saved.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      {seasons.map((s) => (
        <fieldset key={s.id} className="bt-card !p-5">
          <legend className="px-1 font-headline text-lg font-black uppercase text-bark-deep">
            {s.label}
          </legend>

          <label className="mb-4 mt-1 inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-fg-1">
            <input
              type="radio"
              name="current_season_id"
              value={s.id}
              checked={current === s.id}
              onChange={() => setCurrent(s.id)}
              className="h-4 w-4 accent-orange"
            />
            Current season (shown on the dashboard by default)
          </label>

          <div className="space-y-4">
            {s.windows.map((w) => {
              const base = `${s.id}__${w.osWindow}`;
              return (
                <div key={w.osWindow} className="rounded-2 border-2 border-paper-edge bg-white/60 p-4">
                  <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-wood">
                    {w.windowLabel} &mdash; combined goal
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="bt-eyebrow">Top goal ($)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`goal__${base}`}
                        defaultValue={w.goalAmount ? String(w.goalAmount) : ''}
                        placeholder="0"
                        className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="bt-eyebrow">Milestone step ($)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`step__${base}`}
                        defaultValue={w.milestoneStep ? String(w.milestoneStep) : '100000'}
                        placeholder="100000"
                        className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <a href="/off-season" className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto">
          Back to Dashboard
        </a>
        <SaveButton />
      </div>
    </form>
  );
}
