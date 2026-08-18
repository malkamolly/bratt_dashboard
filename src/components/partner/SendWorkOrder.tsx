'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendWorkOrderAction, type SendState } from '@/app/partner/actions';
import { formatCents } from '@/lib/php-quote';

const INITIAL: SendState = { error: null };

function SendButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bt-btn bt-btn-primary justify-center disabled:opacity-60"
    >
      {pending ? 'Sending…' : `Accept & Send to Bratt — ${formatCents(total)}`}
    </button>
  );
}

/**
 * The accept-and-send control.
 *
 * Two-step on purpose: sending freezes the work order and puts a PDF in Bratt's
 * inbox, which is not something to do on a stray tap in a truck. The confirm step
 * restates what is about to happen.
 *
 * A mail failure comes back as a WARNING rather than an error, because the send
 * itself succeeded — the order is locked and the PDF stored. Saying "it failed"
 * would send the rep round the loop again on a job that is already with us.
 */
export function SendWorkOrder({
  proposalId,
  totalCents,
  blocked,
  issues,
}: {
  proposalId: string;
  totalCents: number;
  blocked: boolean;
  issues: string[];
}) {
  const [state, formAction] = useActionState(sendWorkOrderAction, INITIAL);

  if (blocked) {
    return (
      <div className="rounded-2 border-2 border-status-warn bg-status-warn/10 p-5">
        <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Not ready to send
        </h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-1">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.warning) {
    return (
      <div className="rounded-2 border-2 border-status-warn bg-status-warn/10 p-5">
        <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Sent, but the email didn&apos;t go out
        </h3>
        <p className="mt-2 text-sm text-fg-1">
          The work order is accepted and saved, and the PDF is stored &mdash; you
          can download it below and send it on. {state.warning}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={proposalId} />

      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="bt-btn bt-btn-primary justify-center group-open:hidden">
            Accept &amp; Send to Bratt
          </span>
        </summary>

        <div className="rounded-2 border-2 border-paper-edge bg-white p-5">
          <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Send this work order?
          </h3>
          {/* Deliberately does not name the destination address — no inbox is
              advertised in this tool (see partner-config.ts). */}
          <p className="mt-2 text-sm text-fg-2">
            This sends the work order and its photos to Bratt and locks it, so
            what Bratt receives always matches your record. You can still start a
            revision afterwards if something changes.
          </p>
          <div className="mt-5">
            <SendButton total={totalCents} />
          </div>
        </div>
      </details>

      {state.error && (
        <div
          role="alert"
          className="rounded-2 border-2 border-orange-press bg-orange/10 p-4 text-sm font-bold text-orange-press"
        >
          {state.error}
          {state.issues && state.issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">
              {state.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
