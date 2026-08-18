import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRATT } from '@/lib/partner-config';
import {
  requirePartner,
  getProposal,
  isLocked,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
} from '@/lib/partner-data';
import { setJobStatusAction, deleteProposalAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

/**
 * One proposal. Job details today; trees, treatments, and the priced work order
 * are the next build steps.
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePartner();
  const { id } = await params;
  const proposal = await getProposal(id);
  if (!proposal) notFound();

  const locked = isLocked(proposal);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm text-slate-500">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono">{proposal.reference}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {proposal.jobName}
          </h1>
          <p className="mt-1 text-slate-600">{proposal.siteAddress}</p>
        </div>
        {!locked && (
          <Link
            href={`/partner/proposals/${proposal.id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[color:var(--php-dark)] hover:text-[color:var(--php-dark)]"
          >
            Edit details
          </Link>
        )}
      </div>

      {locked && (
        <p className="mt-5 rounded-lg border border-[color:var(--php-accent)] bg-[color:var(--php-accent)]/10 px-4 py-3 text-sm text-slate-700">
          <strong>
            {HANDOFF_STATUS_LABELS[proposal.handoffStatus]}
            {proposal.revision > 1 && ` · Rev ${proposal.revision}`}
          </strong>{' '}
          &mdash; this work order is locked so it keeps matching the copy{' '}
          {BRATT.name} received. Start a revision to change it.
        </p>
      )}

      {/* ---- Job details ---- */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Job details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Detail label="Salesperson" value={proposal.salespersonName} />
          <Detail label="Reference" value={proposal.reference} mono />
          <Detail label="Site contact" value={proposal.customerName} />
          <Detail label="Phone" value={proposal.customerPhone} />
          <Detail
            label="Access notes"
            value={proposal.accessNotes}
            className="sm:col-span-2"
          />
        </dl>
      </section>

      {/* ---- Their sales status: editable even once Bratt has it ---- */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Job status
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Your sales status. Separate from where the work order stands with{' '}
          {BRATT.name}, and you can change it any time.
        </p>
        <form action={setJobStatusAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={proposal.id} />
          {JOB_STATUSES.map((s) => {
            const active = s.value === proposal.jobStatus;
            return (
              <button
                key={s.value}
                type="submit"
                name="jobStatus"
                value={s.value}
                aria-pressed={active}
                className={
                  active
                    ? 'rounded-lg bg-[color:var(--php-dark)] px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[color:var(--php-dark)] hover:text-[color:var(--php-dark)]'
                }
              >
                {JOB_STATUS_LABELS[s.value]}
              </button>
            );
          })}
        </form>
      </section>

      {/* ---- Trees: the next build step ---- */}
      <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Trees
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Next up: add each tree with its size and a photo, then pick treatments.
          The priced work order builds itself from those.
        </p>
      </section>

      {!locked && (
        <form action={deleteProposalAction} className="mt-8">
          <input type="hidden" name="id" value={proposal.id} />
          <button
            type="submit"
            className="text-sm font-semibold text-slate-400 hover:text-red-700 hover:underline"
          >
            Delete this proposal
          </button>
        </form>
      )}
    </main>
  );
}

function Detail({
  label,
  value,
  mono,
  className = '',
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm ${value ? 'text-slate-900' : 'text-slate-400'} ${mono ? 'font-mono' : ''}`}
      >
        {value || 'Not set'}
      </dd>
    </div>
  );
}
