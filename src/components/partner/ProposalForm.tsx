'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { JOB_STATUSES, type JobStatus, type Salesperson } from '@/lib/partner-types';
import type { FormState } from '@/app/partner/actions';

const INITIAL: FormState = { error: null };

// Matches the field styling used across the app (see QuoteBuilder): heavy paper
// edge, orange focus. text-base, not smaller — these get filled in on a phone.
const FIELD =
  'mt-1.5 block w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2.5 ' +
  'text-base text-ink placeholder:text-fg-3 focus:border-orange focus:outline-none';

const LABEL =
  'block font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2';

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
      className="bt-btn bt-btn-primary justify-center disabled:opacity-60"
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
              className="mt-2 text-sm font-bold text-orange-press hover:underline"
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
            <p className="mt-1.5 text-xs text-fg-3">
              First name and last initial &mdash; e.g. <strong>Taylor M</strong>.
              You&apos;ll be in the list next time.
            </p>
            {salespeople.length > 0 && (
              <button
                type="button"
                onClick={() => setAddingName(false)}
                className="mt-2 text-sm font-bold text-orange-press hover:underline"
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
                <span className="text-sm font-bold text-ink">
                  {s.label}
                </span>
              </span>
              <span className="pl-6 text-xs text-fg-3">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ---- Customer contact ---- */}
      <div className="bt-card !p-5">
        <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Site contact <span className="text-fg-3">(optional)</span>
        </h2>
        <p className="mt-2 text-xs text-fg-2">
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
          className="rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2.5 text-sm font-bold text-orange-press"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton label={submitLabel} />
        <p className="text-xs text-fg-2">
          Saved right away &mdash; you add trees on the next screen.
        </p>
      </div>
    </form>
  );
}
