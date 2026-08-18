import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRATT } from '@/lib/partner-config';
import { formatCents } from '@/lib/php-quote';
import {
  requirePartner,
  getWorkOrder,
  listRevisions,
  blockingIssues,
  isLocked,
  hasLocation,
  HANDOFF_STATUS_LABELS,
  JOB_STATUS_LABELS,
  type TreeWithTreatments,
} from '@/lib/partner-data';
import { SendWorkOrder } from '@/components/partner/SendWorkOrder';
import { startRevisionAction } from '@/app/partner/actions';

export const dynamic = 'force-dynamic';

/**
 * The work order: everything priced, in one place, ready to send.
 *
 * Built live from the stored trees and treatments rather than kept as its own
 * record, so editing a tree updates it with nothing to keep in sync. Sending
 * snapshots it (see sendWorkOrder) — that frozen copy is what Bratt holds.
 */
export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePartner();
  const { id } = await params;

  const order = await getWorkOrder(id);
  if (!order) notFound();
  const revisions = await listRevisions(id);

  const { proposal } = order;
  const locked = isLocked(proposal);
  const issues = blockingIssues(order);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/partner" className="hover:underline">
          Proposals
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/partner/proposals/${id}`} className="hover:underline">
          {proposal.reference}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Work Order
      </p>

      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Work Order
      </h1>

      {/* ---- Job summary ---- */}
      <section className="bt-card mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-ink">
              {proposal.jobName}
            </h2>
            <p className="text-sm text-fg-2">
              {proposal.formattedAddress ?? proposal.siteAddress}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-bold text-fg-2">
              {proposal.reference}
              {proposal.revision > 1 && ` · Rev ${proposal.revision}`}
            </p>
            <p className="mt-1 text-xs text-fg-3">
              {JOB_STATUS_LABELS[proposal.jobStatus]} ·{' '}
              {HANDOFF_STATUS_LABELS[proposal.handoffStatus]}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-paper-edge pt-4 text-sm sm:grid-cols-2">
          {proposal.salespersonName && (
            <div>
              <dt className="text-xs uppercase tracking-ribbon text-fg-3">Salesperson</dt>
              <dd className="font-semibold text-ink">{proposal.salespersonName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-ribbon text-fg-3">Trees</dt>
            <dd className="font-semibold text-ink">{order.trees.length}</dd>
          </div>
        </dl>

        {!hasLocation(proposal) && (
          <p className="mt-4 rounded-2 border-2 border-status-warn bg-status-warn/10 px-3 py-2 text-xs font-bold text-fg-1">
            Address not confirmed on the map. Bratt will verify before dispatch.
          </p>
        )}
      </section>

      {/* ---- Line items ---- */}
      {order.trees.length === 0 ? (
        <div className="mt-6 rounded-card border-2 border-dashed border-paper-edge bg-white/60 p-8 text-center">
          <p className="text-sm text-fg-2">
            No trees on this proposal yet.{' '}
            <Link
              href={`/partner/proposals/${id}/trees/new`}
              className="font-bold text-orange-press hover:underline"
            >
              Add one
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {order.trees.map((tree, i) => (
            <li key={tree.id}>
              <TreeLines
                tree={tree}
                index={i}
                proposalId={id}
                locked={locked}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ---- Total ---- */}
      <section className="mt-6 rounded-card bg-bark px-6 py-5 text-cream">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
              Quoted Total
            </p>
            <p className="mt-1 font-display text-4xl tracking-wider">
              {formatCents(order.totalCents)}
            </p>
          </div>
          {order.needsQuoteCount > 0 && (
            <p className="max-w-xs text-xs text-cream/80">
              Plus {order.needsQuoteCount} line
              {order.needsQuoteCount === 1 ? '' : 's'} {BRATT.contactName} will
              price by hand &mdash; those aren&apos;t in the total above.
            </p>
          )}
        </div>
      </section>

      {/* ---- Send / revise ---- */}
      <section className="mt-8">
        {locked ? (
          <div className="space-y-5">
            <div className="rounded-2 border-2 border-green-dark bg-green/10 p-5">
              <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                {HANDOFF_STATUS_LABELS[proposal.handoffStatus]}
              </h3>
              <p className="mt-2 text-sm text-fg-1">
                Sent to {BRATT.name}
                {proposal.sentAt &&
                  ` on ${new Date(proposal.sentAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`}
                . It&apos;s locked so our copy always matches yours.
              </p>
            </div>

            <form action={startRevisionAction}>
              <input type="hidden" name="id" value={proposal.id} />
              <button type="submit" className="bt-btn bt-btn-ghost">
                Start Revision {proposal.revision + 1}
              </button>
              <p className="mt-2 text-xs text-fg-3">
                Unlocks this work order for edits. What Bratt already received
                stays on record.
              </p>
            </form>
          </div>
        ) : (
          <SendWorkOrder
            proposalId={proposal.id}
            totalCents={order.totalCents}
            blocked={issues.length > 0}
            issues={issues}
          />
        )}
      </section>

      {/* ---- Send history ---- */}
      {revisions.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Sent history
          </h2>
          <ul className="mt-3 space-y-2">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2 border-2 border-paper-edge bg-white px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-bold text-ink">
                    Revision {r.revision}
                    {r.emailStatus === 'failed' && (
                      <span className="ml-2 text-xs font-bold uppercase tracking-ribbon text-orange-press">
                        Email failed
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-fg-3">
                    {new Date(r.sentAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {r.sentTo && ` · ${r.sentTo}`}
                  </p>
                  {r.emailError && (
                    <p className="mt-1 max-w-md text-xs text-orange-press">{r.emailError}</p>
                  )}
                </div>
                {r.pdfUrl && (
                  <a
                    href={r.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold uppercase tracking-ribbon text-orange-press hover:underline"
                  >
                    Download PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function TreeLines({
  tree,
  index,
  proposalId,
  locked,
}: {
  tree: TreeWithTreatments;
  index: number;
  proposalId: string;
  locked: boolean;
}) {
  const dims = [
    tree.species ?? 'Species not noted',
    `${tree.dbh}" DBH`,
    tree.heightFt != null ? `${tree.heightFt} ft tall` : null,
    tree.crownSpreadFt != null ? `${tree.crownSpreadFt} ft spread` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const treeTotal = tree.treatments.reduce(
    (sum, t) => sum + (t.needsQuote ? 0 : (t.unitPriceCents ?? 0)),
    0,
  );

  return (
    <div className="bt-card !p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-headline text-lg font-extrabold text-ink">
            {index + 1}. {tree.label}
          </h3>
          <p className="text-sm text-fg-2">{dims}</p>
        </div>
        {!locked && (
          <Link
            href={`/partner/proposals/${proposalId}/trees/${tree.id}/treatments`}
            className="text-xs font-bold uppercase tracking-ribbon text-orange-press hover:underline"
          >
            {tree.treatments.length === 0 ? 'Pick treatments' : 'Change'}
          </Link>
        )}
      </div>

      {tree.photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {tree.photos.slice(0, 4).map((p) => (
            <li key={p.id} className="h-16 w-16">
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

      {tree.treatments.length === 0 ? (
        <p className="mt-4 rounded-2 border-2 border-status-warn bg-status-warn/10 px-3 py-2 text-xs font-bold text-fg-1">
          No treatment picked yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2 border-t border-paper-edge pt-3">
          {tree.treatments.map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {t.serviceName ?? t.serviceId}
                </p>
                {t.needsQuote && t.quoteNote && (
                  <p className="text-xs text-orange-press">{t.quoteNote}</p>
                )}
              </div>
              <span
                className={
                  t.needsQuote
                    ? 'font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press'
                    : 'font-headline text-base font-extrabold text-ink'
                }
              >
                {t.needsQuote ? 'Bratt to quote' : formatCents(t.unitPriceCents ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tree.notes && <p className="mt-3 text-xs text-fg-2">{tree.notes}</p>}

      {treeTotal > 0 && (
        <p className="mt-3 border-t border-paper-edge/60 pt-2 text-right text-sm">
          <span className="text-xs uppercase tracking-ribbon text-fg-3">Tree total </span>
          <span className="font-headline font-extrabold text-ink">
            {formatCents(treeTotal)}
          </span>
        </p>
      )}
    </div>
  );
}
