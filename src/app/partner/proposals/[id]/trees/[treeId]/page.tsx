import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePartner, getProposal, getTree, isLocked } from '@/lib/partner-data';
import { TreeForm } from '@/components/partner/TreeForm';
import { deleteTreeAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

export default async function EditTreePage({
  params,
}: {
  params: Promise<{ id: string; treeId: string }>;
}) {
  await requirePartner();
  const { id, treeId } = await params;

  const [proposal, tree] = await Promise.all([getProposal(id), getTree(treeId)]);
  if (!proposal || !tree || tree.proposalId !== id) notFound();
  if (isLocked(proposal)) redirect(`/partner/proposals/${id}`);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href={`/partner/proposals/${id}`} className="hover:underline">
          {proposal.reference}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit Tree
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        {tree.label}
      </h1>

      <div className="mt-8">
        <TreeForm proposalId={id} tree={tree} />
      </div>

      <form action={deleteTreeAction} className="mt-10 border-t border-paper-edge pt-6">
        <input type="hidden" name="id" value={tree.id} />
        <button
          type="submit"
          className="text-xs font-bold uppercase tracking-ribbon text-fg-3 hover:text-orange-press hover:underline"
        >
          Remove this tree
        </button>
      </form>
    </main>
  );
}
