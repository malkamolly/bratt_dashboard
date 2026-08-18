import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SERVICES, SERVICE_CATEGORIES, pricingSummary } from '@/lib/phc-pricing';
import { quoteTreatment, relevanceToSpecies, formatCents } from '@/lib/php-quote';
import {
  requirePartner,
  getProposal,
  getTree,
  getWorkOrder,
  isLocked,
} from '@/lib/partner-data';
import { addTreatmentAction, removeTreatmentAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

/**
 * The treatment picker: cards, not a dropdown.
 *
 * Each card shows what the treatment costs FOR THIS TREE — computed from the
 * tree's own DBH and height against the shared price book — rather than a
 * generic price range. A rep should be choosing between real numbers.
 *
 * Cards relevant to the species sort first (an ash tree surfaces the emerald ash
 * borer treatments), but nothing is hidden: the species field is a best guess,
 * and a rep may be treating something it doesn't capture.
 */
export default async function TreatmentsPage({
  params,
}: {
  params: Promise<{ id: string; treeId: string }>;
}) {
  await requirePartner();
  const { id, treeId } = await params;

  const [proposal, tree, order] = await Promise.all([
    getProposal(id),
    getTree(treeId),
    getWorkOrder(id),
  ]);
  if (!proposal || !tree || tree.proposalId !== id) notFound();
  if (isLocked(proposal)) redirect(`/partner/proposals/${id}`);

  const chosen = order?.trees.find((t) => t.id === treeId)?.treatments ?? [];
  const chosenIds = new Set(chosen.map((c) => c.serviceId));

  // Sort within each category by species relevance, keeping the price book's
  // own category order so the list still reads like the price guide.
  const byCategory = SERVICE_CATEGORIES.map((category) => ({
    category,
    services: SERVICES.filter((s) => s.category === category).sort(
      (a, b) =>
        relevanceToSpecies(b, tree.species) - relevanceToSpecies(a, tree.species) ||
        a.name.localeCompare(b.name),
    ),
  })).filter((g) => g.services.length > 0);

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href={`/partner/proposals/${id}`} className="hover:underline">
          {proposal.reference}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {tree.label}
        <span className="mx-2 text-fg-3">/</span>
        Treatments
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Pick Treatments
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Prices below are for <strong>this tree</strong> &mdash; {tree.dbh}&quot; DBH
        {tree.heightFt != null && `, ${tree.heightFt} ft tall`}
        {tree.species && `, ${tree.species}`}. Each price covers a full year of
        treatment.
      </p>

      {/* ---- What's already on this tree ---- */}
      {chosen.length > 0 && (
        <section className="bt-card mt-8">
          <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            On this tree ({chosen.length})
          </h2>
          <ul className="mt-4 space-y-2">
            {chosen.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-edge/60 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink">{c.serviceName ?? c.serviceId}</p>
                  {c.needsQuote && c.quoteNote && (
                    <p className="text-xs font-bold text-orange-press">{c.quoteNote}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-headline text-lg font-extrabold text-ink">
                    {c.needsQuote ? 'Bratt to quote' : formatCents(c.unitPriceCents ?? 0)}
                  </span>
                  <form action={removeTreatmentAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="text-xs font-bold uppercase tracking-ribbon text-fg-3 hover:text-orange-press hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={`/partner/proposals/${id}`}
            className="bt-btn bt-btn-primary mt-6 justify-center"
          >
            Done with This Tree
          </Link>
        </section>
      )}

      {/* ---- The catalogue ---- */}
      {byCategory.map(({ category, services }) => (
        <section key={category} className="mt-10">
          <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
            {category}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const quote = quoteTreatment(service, {
                dbh: tree.dbh,
                heightFt: tree.heightFt,
              });
              const already = chosenIds.has(service.id);
              const relevant = relevanceToSpecies(service, tree.species) > 0;

              return (
                <li key={service.id}>
                  <form action={addTreatmentAction} className="h-full">
                    <input type="hidden" name="treeId" value={tree.id} />
                    <input type="hidden" name="serviceId" value={service.id} />
                    <button
                      type="submit"
                      disabled={already}
                      className={`flex h-full w-full flex-col gap-2 rounded-card border-[3px] p-4 text-left transition ${
                        already
                          ? 'cursor-default border-green-dark bg-green/10'
                          : 'border-paper-edge bg-white hover:border-orange hover:shadow-sh-2'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-headline text-base font-extrabold leading-tight text-ink">
                          {service.name}
                        </span>
                        {already && (
                          <span className="bt-status-ahead flex-shrink-0">Added</span>
                        )}
                        {!already && relevant && (
                          <span className="php-chip flex-shrink-0">Likely</span>
                        )}
                      </span>

                      <span className="text-xs text-fg-3">
                        {[service.treatmentType, service.chemical, service.frequency]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>

                      <span className="mt-auto pt-2">
                        {quote.priced ? (
                          <span className="font-display text-2xl tracking-wide text-ink">
                            {formatCents(quote.unitPriceCents)}
                          </span>
                        ) : (
                          <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange-press">
                            Bratt to quote
                          </span>
                        )}
                        <span className="mt-1 block text-[0.7rem] text-fg-3">
                          {quote.priced ? pricingSummary(service) : quote.note}
                        </span>
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
