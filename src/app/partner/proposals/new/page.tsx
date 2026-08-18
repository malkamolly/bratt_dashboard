import Link from 'next/link';
import { requirePartner } from '@/lib/partner-data';
import { ProposalForm } from '@/components/partner/ProposalForm';
import { createProposalAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  await requirePartner();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        New
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Start a Proposal
      </h1>
      <p className="mt-4 text-fg-2">
        Just the job details for now. Trees, photos, and treatments come next.
      </p>

      <div className="mt-8">
        <ProposalForm
          action={createProposalAction}
          submitLabel="Save and Add Trees"
        />
      </div>
    </main>
  );
}
