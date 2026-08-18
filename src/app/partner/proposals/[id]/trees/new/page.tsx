import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePartner, getProposal, isLocked } from '@/lib/partner-data';
import { TreeForm } from '@/components/partner/TreeForm';

export const dynamic = 'force-dynamic';

export default async function NewTreePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePartner();
  const { id } = await params;
  const proposal = await getProposal(id);
  if (!proposal) notFound();
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
        Add Tree
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Add a Tree
      </h1>
      <p className="mt-4 text-fg-2">
        {proposal.jobName} &mdash; {proposal.formattedAddress ?? proposal.siteAddress}
      </p>

      <div className="mt-8">
        <TreeForm proposalId={id} />
      </div>
    </main>
  );
}
