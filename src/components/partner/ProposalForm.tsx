'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { JOB_STATUSES, type JobStatus, type Salesperson } from '@/lib/partner-types';
import type { FormState } from '@/app/partner/actions';

const INITIAL: FormState = { error: null };

const FIELD =
  'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 ' +
  'text-base text-slate-900 placeholder:text-slate-400 focus:outline-none ' +
  'focus:ring-2 focus:ring-[color:var(--php-dark)]/25 focus:border-[color:var(--php-dark)]';

const LABEL = 'block text-sm font-semibold text-slate-700';

/**
 * Submit button. Reads the pending state via useFormStatus rather than the
 * third value from useActionState — that one has been observed sticking on
 * `true` after an action returns an error, leaving the button permanently
 * disabled. useFormStatus reads the parent form's state directly and recovers.
 */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[color:var(--php-dark)] px-5 py-2.5 text-base font-semibold text-white transition hover:bg-[color:var(--php-darker)] focus:outline-none focus:ring-2 focus:ring-[color:var(--php-dark)]/40 disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

export type ProposalFormValues = {
  id?: string;
  salespersonId: string | null;
  jobName: string;
  siteAddress: string;
  customerName: string | null;
  customerPhone: string | null;
  accessNotes: string | null;
  jobStatus: JobStatus;
};

export function ProposalForm({
  action,
  salespeople,
  values,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  salespeople: Salesperson[];
  values?: ProposalFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  // "Add my name" reveals a text field. Defaults on when their roster is still
  // empty, so the first rep to use the hub isn't staring at an empty dropdown.
  const [addingName, setAddingName] = useState(salespeople.length === 0);

  return (
    <form action={formAction} className="space-y-7">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      {/* ---- Who ---- */}
      <div>
        <label className={LABEL} htmlFor="salespersonId">
          Your name
        </label>
        {!addingName && (
          <>
            <select
              id="salespersonId"
              name="salespersonId"
              defaultValue={values?.salespersonId ?? ''}
              className={FIELD}
            >
              <option value="">Select your name…</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddingName(true)}
              className="mt-2 text-sm font-semibold text-[color:var(--php-dark)] hover:underline"
            >
              Not listed? Add your name
            </button>
          </>
        )}

        {addingName && (
          <>
            <input
              type="text"
              name="newSalespersonName"
              placeholder="e.g. Taylor M"
              className={FIELD}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              First name and last initial &mdash; e.g. <strong>Taylor M</strong>.
              You&apos;ll be in the list next time.
            </p>
            {salespeople.length > 0 && (
              <button
                type="button"
                onClick={() => setAddingName(false)}
                className="mt-2 text-sm font-semibold text-[color:var(--php-dark)] hover:underline"
              >
                Pick from the list instead
              </button>
            )}
          </>
        )}
      </div>

      {/* ---- The job ---- */}
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
          placeholder="Street, city"
          className={FIELD}
          autoComplete="street-address"
        />
      </div>

      {/* ---- Job status ---- */}
      <fieldset>
        <legend className={LABEL}>Job status</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {JOB_STATUSES.map((s) => (
            <label
              key={s.value}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-slate-300 bg-white p-3 transition hover:border-[color:var(--php-dark)] has-[:checked]:border-[color:var(--php-dark)] has-[:checked]:ring-2 has-[:checked]:ring-[color:var(--php-dark)]/20"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="jobStatus"
                  value={s.value}
                  defaultChecked={(values?.jobStatus ?? 'proposing') === s.value}
                  className="accent-[color:var(--php-dark)]"
                />
                <span className="text-sm font-semibold text-slate-900">
                  {s.label}
                </span>
              </span>
              <span className="pl-6 text-xs text-slate-500">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ---- Customer contact ---- */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">
          Site contact{' '}
          <span className="font-normal text-slate-500">(optional)</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Who Bratt&apos;s crew calls to get on the property. Without it, a locked
          gate means a wasted trip.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="customerName">
              Customer name
            </label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              defaultValue={values?.customerName ?? ''}
              placeholder="e.g. Dana R"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="customerPhone">
              Phone
            </label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              defaultValue={values?.customerPhone ?? ''}
              placeholder="612-555-0142"
              className={FIELD}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={LABEL} htmlFor="accessNotes">
            Access notes
          </label>
          <textarea
            id="accessNotes"
            name="accessNotes"
            rows={2}
            defaultValue={values?.accessNotes ?? ''}
            placeholder="Gate code, dog in the yard, park on the street…"
            className={FIELD}
          />
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton label={submitLabel} />
        <p className="text-xs text-slate-500">
          Saved right away &mdash; you add trees on the next screen.
        </p>
      </div>
    </form>
  );
}
