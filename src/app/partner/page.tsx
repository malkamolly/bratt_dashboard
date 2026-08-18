import Link from 'next/link';
import { BRATT, PARTNER } from '@/lib/partner-config';
import {
  requirePartner,
  listProposals,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  type Proposal,
} from '@/lib/partner-data';

export const dynamic = 'force-dynamic';

/**
 * Plant Health Program home: proposals, newest first, and one obvious way in.
 * Deliberately not a calculator — pricing happens inside a proposal now.
 */
export default async function PartnerHomePage() {
  await requirePartner();
  const proposals = await listProposals();

  return (
    <main className="bt-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="bt-eyebrow">Plant Health Program</p>
          <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
            Proposals
          </h1>
          <p className="mt-4 max-w-2xl text-fg-2">
            Price tree health work for your customers. Our ISA-Certified
            arborists and licensed applicators do the treatments.
          </p>
        </div>
        <Link href="/partner/proposals/new" className="bt-btn bt-btn-primary">
          Start a Proposal
        </Link>
      </div>

      {proposals.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-10 space-y-4">
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
    <div className="mt-10 rounded-card border-2 border-dashed border-paper-edge bg-white/60 p-10 text-center">
      <h2 className="font-display text-3xl uppercase tracking-wide text-ink">
        No Proposals Yet
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-fg-2">
        Start one and we&apos;ll walk you through it: the job, then each tree with
        a photo, then the treatments. The price adds up as you go.
      </p>
      <Link
        href="/partner/proposals/new"
        className="bt-btn bt-btn-primary mt-6 justify-center"
      >
        Start Your First Proposal
      </Link>
    </div>
  );
}

/** Two chips, because the two statuses answer different questions: did the
 *  customer buy it, and does Bratt have it yet. Their green marks the handoff
 *  so the pair never reads as one status. */
function ProposalCard({ proposal: p }: { proposal: Proposal }) {
  const trees = p.treeCount ?? 0;

  return (
    <Link
      href={`/partner/proposals/${p.id}`}
      className="bt-card block !p-5 transition-shadow hover:shadow-sh-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span className="font-mono font-bold text-fg-2">{p.reference}</span>
            {p.salespersonName && <span>&middot; {p.salespersonName}</span>}
          </p>
          <h2 className="mt-1 truncate font-headline text-xl font-extrabold text-ink">
            {p.jobName}
          </h2>
          <p className="truncate text-sm text-fg-2">{p.siteAddress}</p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <span
            className={
              p.jobStatus === 'sold'
                ? 'bt-status-ahead'
                : p.jobStatus === 'dismissed'
                  ? 'bt-status-neutral'
                  : 'bt-status-warn'
            }
          >
            {JOB_STATUS_LABELS[p.jobStatus]}
          </span>
          <span className={p.handoffStatus === 'draft' ? 'bt-status-neutral' : 'php-chip'}>
            {HANDOFF_STATUS_LABELS[p.handoffStatus]}
          </span>
        </div>
      </div>

      <p className="mt-3 border-t border-paper-edge/60 pt-3 text-xs text-fg-3">
        {trees === 0 ? 'No trees added yet' : `${trees} ${trees === 1 ? 'tree' : 'trees'}`}
        {p.revision > 1 && ` · Rev ${p.revision}`}
      </p>
    </Link>
  );
}
