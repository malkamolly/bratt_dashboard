'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  saveSalesCell,
  deleteSalesCell,
  type CellSaveResult,
} from '../actions';

type Props = {
  date: string;
  salespersonId: string;
  salespersonName: string;
  initialAmount: number | null;
  returnTo: string;
};

function SaveBtn({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

export function CellForm({
  date,
  salespersonId,
  salespersonName,
  initialAmount,
  returnTo,
}: Props) {
  const [state, formAction] = useActionState<CellSaveResult, FormData>(
    saveSalesCell,
    undefined,
  );
  const [amount, setAmount] = useState<string>(
    initialAmount != null ? String(initialAmount) : '',
  );

  const cleanedCurrent =
    Number(String(amount).replace(/[$,\s]/g, '')) || 0;
  const cleanedInitial = initialAmount ?? 0;
  const dirty =
    Math.round(cleanedCurrent * 100) !== Math.round(cleanedInitial * 100);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entry_date" value={date} />
      <input type="hidden" name="salesperson_id" value={salespersonId} />
      <input type="hidden" name="return_to" value={returnTo} />

      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="bt-eyebrow">Amount ($)</span>
        <input
          type="text"
          inputMode="decimal"
          name="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          autoFocus
          className="w-full rounded-2 border-2 border-paper-edge bg-white px-4 py-3 text-right font-headline text-2xl focus:border-orange focus:outline-none"
        />
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <a
          href={returnTo}
          className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
        >
          Cancel
        </a>
        {initialAmount != null && (
          <button
            type="submit"
            formAction={deleteSalesCell}
            onClick={(e) => {
              if (
                !window.confirm(
                  `Delete ${salespersonName}'s entry for ${date}? This can't be undone.`,
                )
              ) {
                e.preventDefault();
              }
            }}
            className="bt-btn bt-btn-ghost w-full justify-center text-orange-press sm:w-auto"
          >
            Delete
          </button>
        )}
        <SaveBtn dirty={dirty} />
      </div>
    </form>
  );
}
