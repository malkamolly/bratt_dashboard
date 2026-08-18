'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from '@/lib/partner-types';
import { setJobStatusAction, type FormState } from '@/app/partner/actions';

const INITIAL: FormState = { error: null };

/**
 * The Proposing / Sold / Dismissed control.
 *
 * ONE FORM PER BUTTON, each carrying its status in a hidden input, rather than
 * one form with three submit buttons that each set name="jobStatus". The status
 * was not reaching the server — clicking SOLD did nothing at all — and relying on
 * a submit button's own name/value to be serialized into the action's FormData is
 * the fragile part of that arrangement. A hidden input is always included.
 */
function StatusButton({ status, active }: { status: JobStatus; active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={active}
      className={
        active
          ? 'bt-btn bt-btn-primary !px-5 !py-2 !text-xs disabled:opacity-60'
          : 'bt-btn bt-btn-ghost !px-5 !py-2 !text-xs disabled:opacity-60'
      }
    >
      {pending ? 'Saving…' : JOB_STATUS_LABELS[status]}
    </button>
  );
}

export function JobStatusControl({
  proposalId,
  current,
}: {
  proposalId: string;
  current: JobStatus;
}) {
  const [state, formAction] = useActionState(setJobStatusAction, INITIAL);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {JOB_STATUSES.map((s) => (
          <form key={s.value} action={formAction}>
            <input type="hidden" name="id" value={proposalId} />
            <input type="hidden" name="jobStatus" value={s.value} />
            <StatusButton status={s.value} active={s.value === current} />
          </form>
        ))}
      </div>

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2 text-sm font-bold text-orange-press"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
