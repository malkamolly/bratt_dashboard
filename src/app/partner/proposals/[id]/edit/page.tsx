import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePartner, getProposal, listSalespeople, isLocked } from '@/lib/partner-data';
import { ProposalForm } from '@/components/partner/ProposalForm';
import { updateProposalAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePartner();
  const { id } = await params;

  const [proposal, salespeople] = await Promise.all([
    getProposal(id),
    listSalespeople(),
  ]);
  if (!proposal) notFound();

  // A sent work order is frozen. Bounce rather than render a form that would
  // only fail on save.
  if (isLocked(proposal)) redirect(`/partner/proposals/${id}`);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/partner/proposals/${id}`} className="hover:underline">
          {proposal.reference}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Edit job details
      </h1>

      <div className="mt-8">
        <ProposalForm
          action={updateProposalAction}
          salespeople={salespeople}
          values={{
            id: proposal.id,
            salespersonId: proposal.salespersonId,
            jobName: proposal.jobName,
            siteAddress: proposal.siteAddress,
            customerName: proposal.customerName,
            customerPhone: proposal.customerPhone,
            accessNotes: proposal.accessNotes,
            jobStatus: proposal.jobStatus,
          }}
          submitLabel="Save changes"
        />
      </div>
    </main>
  );
}
