import Link from 'next/link';
import { PROGRAM, BRATT } from '@/lib/partner-config';
import {
  requirePartner,
  listProposals,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  type Proposal,
} from '@/lib/partner-data';

export const dynamic = 'force-dynamic';

/**
 * Plant Health Program home: the list of proposals, newest first, and one
 * obvious way in. Deliberately NOT a calculator — pricing happens inside a
 * proposal now.
 */
export default async function PartnerHomePage() {
  await requirePartner();
  const proposals = await listProposals();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Proposals
          </h1>
          <p className="mt-2 text-slate-600">
            Price tree health work for your customers. {BRATT.name} does the
            treatments.
          </p>
        </div>
        <Link
          href="/partner/proposals/new"
          className="rounded-lg bg-[color:var(--php-dark)] px-5 py-2.5 text-base font-semibold text-white transition hover:bg-[color:var(--php-darker)]"
        >
          Start a proposal
        </Link>
      </div>

      {proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-8 space-y-3">
          {proposals.map((p) => (
            <li key={p.id}>
              <ProposalCard proposal={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-bold text-slate-900">No proposals yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Start one and you&apos;ll be walked through it: the job, then each tree
        with a photo, then the treatments. {PROGRAM.name} prices it as you go.
      </p>
      <Link
        href="/partner/proposals/new"
        className="mt-6 inline-block rounded-lg bg-[color:var(--php-dark)] px-5 py-2.5 text-base font-semibold text-white transition hover:bg-[color:var(--php-darker)]"
      >
        Start your first proposal
      </Link>
    </div>
  );
}

/** Two chips, because the two statuses answer different questions: did the
 *  customer buy it, and does Bratt have it yet. */
function ProposalCard({ proposal: p }: { proposal: Proposal }) {
  const trees = p.treeCount ?? 0;

  return (
    <Link
      href={`/partner/proposals/${p.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-[color:var(--php-dark)] hover:shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-600">
              {p.reference}
            </span>
            {p.salespersonName && <span>· {p.salespersonName}</span>}
          </p>
          <h2 className="mt-1 truncate text-lg font-bold text-slate-900">
            {p.jobName}
          </h2>
          <p className="truncate text-sm text-slate-600">{p.siteAddress}</p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <StatusChip
            label={JOB_STATUS_LABELS[p.jobStatus]}
            tone={p.jobStatus === 'sold' ? 'good' : p.jobStatus === 'dismissed' ? 'muted' : 'neutral'}
          />
          <StatusChip
            label={HANDOFF_STATUS_LABELS[p.handoffStatus]}
            tone={p.handoffStatus === 'draft' ? 'muted' : 'accent'}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {trees === 0
          ? 'No trees added yet'
          : `${trees} ${trees === 1 ? 'tree' : 'trees'}`}
        {p.revision > 1 && ` · Rev ${p.revision}`}
      </p>
    </Link>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'good' | 'accent' | 'neutral' | 'muted';
}) {
  const styles: Record<typeof tone, string> = {
    good: 'bg-[color:var(--php-dark)] text-white',
    accent: 'bg-[color:var(--php-accent)]/25 text-[color:var(--php-darker)]',
    neutral: 'bg-slate-100 text-slate-700',
    muted: 'bg-slate-100 text-slate-500',
  };
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      {label}
    </span>
  );
}
