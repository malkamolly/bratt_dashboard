import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRATT } from '@/lib/partner-config';
import {
  requirePartner,
  getProposal,
  getWorkOrder,
  isLocked,
  hasLocation,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  SPRAY_HEIGHT_LIMIT_FT,
  type TreeWithTreatments,
} from '@/lib/partner-data';
import { setJobStatusAction, deleteProposalAction } from '@/app/partner/actions';
import { formatCents } from '@/lib/php-quote';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePartner();
  const { id } = await params;

  const order = await getWorkOrder(id);
  if (!order) notFound();
  const { proposal, trees } = order;

  const locked = isLocked(proposal);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <span className="font-mono">{proposal.reference}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
            {proposal.jobName}
          </h1>
          {/* Google's canonical address when it resolved, otherwise what was
              typed. The typed version is never overwritten in the database. */}
          <p className="mt-2 text-fg-2">
            {proposal.formattedAddress ?? proposal.siteAddress}
          </p>
          {!hasLocation(proposal) && (
            <p className="mt-2 inline-block rounded-2 border-2 border-status-warn bg-status-warn/10 px-3 py-1.5 text-xs font-bold text-fg-1">
              Address not confirmed &mdash; we couldn&apos;t find it on the map.
              Editing it with the city and state usually fixes this.
            </p>
          )}
        </div>
        {!locked && (
          <Link
            href={`/partner/proposals/${proposal.id}/edit`}
            className="bt-btn bt-btn-ghost !px-5 !py-2 !text-xs"
          >
            Edit details
          </Link>
        )}
      </div>

      {locked && (
        <p className="mt-6 rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm text-fg-1">
          <strong>
            {HANDOFF_STATUS_LABELS[proposal.handoffStatus]}
            {proposal.revision > 1 && ` · Rev ${proposal.revision}`}
          </strong>{' '}
          &mdash; this work order is locked so it keeps matching the copy{' '}
          {BRATT.name} received. Start a revision to change it.
        </p>
      )}

      {/* ---- Site map ---- */}
      {hasLocation(proposal) && (
        <section className="mt-8 overflow-hidden rounded-card border-[3px] border-lime">
          {/* A server-proxied static map: the Google key stays server-side, and
              the coordinates come from the row, not the query string, so this
              can't be used as an open map proxy on our key. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied image,
              not a static asset next/image can optimize. */}
          <img
            src={`/partner/map?proposal=${proposal.id}`}
            alt={`Map of ${proposal.formattedAddress ?? proposal.siteAddress}`}
            width={1280}
            height={640}
            className="block h-auto w-full"
          />
        </section>
      )}

      {/* ---- Job details ---- */}
      <section className="bt-card mt-6">
        <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Job details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Detail label="Salesperson" value={proposal.salespersonName} />
          <Detail label="Reference" value={proposal.reference} mono />
          <Detail label="Address as entered" value={proposal.siteAddress} />
          <Detail
            label="Confirmed address"
            value={proposal.formattedAddress}
          />
        </dl>
      </section>

      {/* ---- Their sales status: editable even once Bratt has it ---- */}
      <section className="bt-card mt-6">
        <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
          Job status
        </h2>
        <p className="mt-2 text-xs text-fg-2">
          Your sales status. Separate from where the work order stands with{' '}
          {BRATT.name}, and you can change it any time.
        </p>
        <form action={setJobStatusAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={proposal.id} />
          {JOB_STATUSES.map((s) => (
            <button
              key={s.value}
              type="submit"
              name="jobStatus"
              value={s.value}
              aria-pressed={s.value === proposal.jobStatus}
              className={
                s.value === proposal.jobStatus
                  ? 'bt-btn bt-btn-primary !px-5 !py-2 !text-xs'
                  : 'bt-btn bt-btn-ghost !px-5 !py-2 !text-xs'
              }
            >
              {JOB_STATUS_LABELS[s.value]}
            </button>
          ))}
        </form>
      </section>

      {/* ---- Trees ---- */}
      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl uppercase tracking-wide text-ink">
            Trees{trees.length > 0 && ` (${trees.length})`}
          </h2>
          {!locked && (
            <Link
              href={`/partner/proposals/${proposal.id}/trees/new`}
              className="bt-btn bt-btn-primary !px-5 !py-2 !text-xs"
            >
              Add a Tree
            </Link>
          )}
        </div>

        {trees.length === 0 ? (
          <div className="mt-4 rounded-card border-2 border-dashed border-paper-edge bg-white/60 p-8 text-center">
            <p className="text-sm text-fg-2">
              No trees yet. Add each tree with its size and a photo &mdash; then
              you&apos;ll pick treatments and the price adds up.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {trees.map((t) => (
              <li key={t.id}>
                <TreeCard tree={t} proposalId={proposal.id} locked={locked} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {trees.length > 0 && (
        <section className="mt-8 rounded-card bg-bark px-6 py-5 text-cream">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
                Running Total
              </p>
              <p className="mt-1 font-display text-3xl tracking-wider">
                {formatCents(order.totalCents)}
              </p>
              {order.needsQuoteCount > 0 && (
                <p className="mt-1 text-xs text-cream/80">
                  + {order.needsQuoteCount} line
                  {order.needsQuoteCount === 1 ? '' : 's'} for Bratt to quote
                </p>
              )}
            </div>
            <Link
              href={`/partner/proposals/${proposal.id}/work-order`}
              className="bt-btn bt-btn-primary"
            >
              {locked ? 'View Work Order' : 'Review & Send'}
            </Link>
          </div>
        </section>
      )}

      {!locked && (
        <form action={deleteProposalAction} className="mt-10 border-t border-paper-edge pt-6">
          <input type="hidden" name="id" value={proposal.id} />
          <button
            type="submit"
            className="text-xs font-bold uppercase tracking-ribbon text-fg-3 hover:text-orange-press hover:underline"
          >
            Delete this proposal
          </button>
        </form>
      )}
    </main>
  );
}

function TreeCard({
  tree,
  proposalId,
  locked,
}: {
  tree: TreeWithTreatments;
  proposalId: string;
  locked: boolean;
}) {
  const tall = tree.heightFt != null && tree.heightFt > SPRAY_HEIGHT_LIMIT_FT;

  const measurements = [
    `${tree.dbh}" DBH`,
    tree.heightFt != null ? `${tree.heightFt} ft tall` : null,
    tree.crownSpreadFt != null ? `${tree.crownSpreadFt} ft spread` : null,
  ].filter(Boolean);

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-headline text-lg font-extrabold text-ink">
            {tree.label}
          </h3>
          <p className="text-sm text-fg-2">
            {tree.species ?? 'Species not noted'} &middot; {measurements.join(' · ')}
          </p>
        </div>
        {tall && (
          <span className="bt-status-warn">Over {SPRAY_HEIGHT_LIMIT_FT} ft</span>
        )}
      </div>

      {tree.photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {tree.photos.map((p) => (
            <li key={p.id} className="h-20 w-20">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element -- signed
                // URL from a private bucket; next/image would need a loader.
                <img
                  src={p.url}
                  alt=""
                  className="h-full w-full rounded-2 border-2 border-paper-edge object-cover"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {tree.notes && <p className="mt-3 text-sm text-fg-2">{tree.notes}</p>}

      {tree.treatments.length === 0 ? (
        <p className="mt-3 border-t border-paper-edge/60 pt-3 text-xs font-bold text-orange-press">
          No treatment picked yet &mdash; tap to choose
        </p>
      ) : (
        <ul className="mt-3 space-y-1 border-t border-paper-edge/60 pt-3">
          {tree.treatments.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-fg-2">
                {t.serviceName ?? t.serviceId}
              </span>
              <span
                className={
                  t.needsQuote
                    ? 'flex-shrink-0 font-bold text-orange-press'
                    : 'flex-shrink-0 font-bold text-ink'
                }
              >
                {t.needsQuote ? 'Bratt to quote' : formatCents(t.unitPriceCents ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // A locked work order's trees aren't editable, so don't dangle a link.
  return locked ? (
    <div className="bt-card !p-5">{body}</div>
  ) : (
    <div className="bt-card !p-5">
      {body}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-paper-edge pt-3">
        <Link
          href={`/partner/proposals/${proposalId}/trees/${tree.id}/treatments`}
          className="text-xs font-bold uppercase tracking-ribbon text-orange-press hover:underline"
        >
          {tree.treatments.length === 0 ? 'Pick treatments' : 'Change treatments'}
        </Link>
        <Link
          href={`/partner/proposals/${proposalId}/trees/${tree.id}`}
          className="text-xs font-bold uppercase tracking-ribbon text-fg-3 hover:text-orange-press hover:underline"
        >
          Edit tree
        </Link>
      </div>
    </div>
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
      <dt className="font-headline text-[0.65rem] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm ${value ? 'font-semibold text-ink' : 'text-fg-3'} ${mono ? 'font-mono' : ''}`}
      >
        {value || 'Not set'}
      </dd>
    </div>
  );
}
