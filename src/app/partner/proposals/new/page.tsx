import Link from 'next/link';
import { requirePartner, listSalespeople } from '@/lib/partner-data';
import { ProposalForm } from '@/components/partner/ProposalForm';
import { createProposalAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  await requirePartner();
  const salespeople = await listSalespeople();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2">/</span>
        New
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
        Start a proposal
      </h1>
      <p className="mt-2 text-slate-600">
        Just the job details for now. Trees, photos, and treatments come next.
      </p>

      <div className="mt-8">
        <ProposalForm
          action={createProposalAction}
          salespeople={salespeople}
          submitLabel="Save and add trees"
        />
      </div>
    </main>
  );
}
