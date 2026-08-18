'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { JOB_STATUSES, type JobStatus } from '@/lib/partner-types';
import type { FormState } from '@/app/partner/actions';

const INITIAL: FormState = { error: null };

// Matches the field styling used across the app (see QuoteBuilder): heavy paper
// edge, orange focus. text-base, not smaller — these get filled in on a phone.
export const FIELD =
  'mt-1.5 block w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2.5 ' +
  'text-base text-ink placeholder:text-fg-3 focus:border-orange focus:outline-none';

export const LABEL =
  'block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2';

/**
 * Submit button. Reads pending state from useFormStatus rather than the third
 * value of useActionState — that one was observed sticking on `true` after an
 * action returned an error, leaving the button permanently disabled.
 * useFormStatus reads the parent form's state directly and recovers.
 */
export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bt-btn bt-btn-primary justify-center disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

export type ProposalFormValues = {
  id?: string;
  salespersonName: string | null;
  jobName: string;
  siteAddress: string;
  jobStatus: JobStatus;
};

export function ProposalForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  values?: ProposalFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-7">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div>
        <label className={LABEL} htmlFor="salespersonName">
          Your name
        </label>
        <input
          id="salespersonName"
          name="salespersonName"
          type="text"
          defaultValue={values?.salespersonName ?? ''}
          placeholder="e.g. Taylor M"
          className={FIELD}
          autoComplete="name"
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="jobName">
          Job name
        </label>
        <input
          id="jobName"
          name="jobName"
          type="text"
          required
          defaultValue={values?.jobName ?? ''}
          placeholder="e.g. Anderson backyard oaks"
          className={FIELD}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="siteAddress">
          Site address
        </label>
        <input
          id="siteAddress"
          name="siteAddress"
          type="text"
          required
          defaultValue={values?.siteAddress ?? ''}
          placeholder="Street, city, state"
          className={FIELD}
          autoComplete="street-address"
        />
        <p className="mt-1.5 text-xs text-fg-3">
          We look this up and show the site on a map. Include the city and state
          so it lands in the right place.
        </p>
      </div>

      <fieldset>
        <legend className={LABEL}>Job status</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {JOB_STATUSES.map((s) => (
            <label
              key={s.value}
              className="flex cursor-pointer flex-col gap-0.5 rounded-2 border-2 border-paper-edge bg-white p-3 transition hover:border-orange has-[:checked]:border-orange has-[:checked]:bg-orange/5"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="jobStatus"
                  value={s.value}
                  defaultChecked={(values?.jobStatus ?? 'proposing') === s.value}
                  className="accent-orange"
                />
                <span className="text-sm font-bold text-ink">{s.label}</span>
              </span>
              <span className="pl-6 text-xs text-fg-3">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p
          role="alert"
          className="rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2.5 text-sm font-bold text-orange-press"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton label={submitLabel} />
        <p className="text-xs text-fg-2">
          Saved right away &mdash; you add trees next.
        </p>
      </div>
    </form>
  );
}
