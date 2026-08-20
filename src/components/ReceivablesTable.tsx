// ============================================================================
// The call list itself — shared by the arborist's page and the hub roll-up
// ============================================================================
// Presentational only (no data fetching, no auth), so the personal panel and
// the manager's roll-up can never drift into showing the same invoice two
// different ways.
//
// Rows arrive already sorted OLDEST FIRST and are rendered in that order. Don't
// re-sort here: the order is the product. If a caller wants a different order,
// that belongs in lib/receivables.ts where the reasoning lives.
// ============================================================================

import {
  type OpenInvoice,
  type Urgency,
  URGENCY_LABELS,
} from '@/lib/receivables';
import { fmtUsdCents } from '@/lib/format';

// Red for the ones that need a call today, warm amber in the middle, quiet for
// recent work. Recent invoices deliberately get NO badge colour — most of the
// list is recent and healthy, and colouring all of it makes the genuinely old
// rows stop standing out.
const URGENCY_CLS: Record<Urgency, string> = {
  critical: 'bg-status-behind text-cream',
  overdue: 'bg-orange/20 text-orange-press',
  watch: 'bg-status-warn/20 text-bark-deep',
  current: 'bg-paper-edge/60 text-fg-3',
};

/** "142 days" — or an honest label when the export gave us no date to age. */
export function ageLabel(daysOld: number): string {
  if (daysOld < 0) return 'No date';
  if (daysOld === 0) return 'Today';
  if (daysOld === 1) return '1 day';
  return `${daysOld} days`;
}

function Badge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${URGENCY_CLS[urgency]}`}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}

/**
 * One invoice as a card. A card rather than a table row on purpose: an arborist
 * reads this on a phone in a truck, and the phone number has to be tappable
 * without pinching.
 */
function InvoiceCard({ inv, rank }: { inv: OpenInvoice; rank: number }) {
  return (
    <li className="rounded-2 border-2 border-paper-edge bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 w-6 shrink-0 text-right font-headline text-sm font-black text-fg-3">
            {rank}
          </span>
          <div className="min-w-0">
            <p className="font-headline text-sm font-black text-ink">{inv.customer}</p>
            <p className="mt-0.5 text-xs text-fg-3">
              {inv.completedOn ? `Completed ${inv.completedOn}` : 'No completion date'}
              {inv.invoiceNumber && <> &middot; inv {inv.invoiceNumber}</>}
            </p>
            {/* tel: and mailto: so this is one tap from the list, which is the
                whole point of putting it on their phone. */}
            {(inv.phone || inv.email) && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {inv.phone &&
                  inv.phone.split(',').slice(0, 2).map((p) => {
                    const t = p.trim();
                    return (
                      <a
                        key={t}
                        href={`tel:${t.replace(/[^\d+]/g, '')}`}
                        className="font-bold text-teal-navy hover:underline"
                      >
                        {t}
                      </a>
                    );
                  })}
                {inv.email && (
                  <a
                    href={`mailto:${inv.email.split(',')[0].trim()}`}
                    className="truncate text-fg-2 hover:underline"
                  >
                    {inv.email.split(',')[0].trim()}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="font-headline text-base font-black text-ink">
            {fmtUsdCents(inv.balance)}
          </p>
          <p className="mt-0.5 font-headline text-[11px] font-bold text-fg-3">
            {ageLabel(inv.daysOld)}
          </p>
          <div className="mt-1">
            <Badge urgency={inv.urgency} />
          </div>
        </div>
      </div>
      {/* Only worth saying when it's NOT the whole invoice — a partial payment
          changes the conversation, a fully-unpaid invoice doesn't. */}
      {inv.total > inv.balance + 0.005 && (
        <p className="mt-2 border-t border-paper-edge pt-2 text-[11px] text-fg-3">
          Partly paid — {fmtUsdCents(inv.total - inv.balance)} of{' '}
          {fmtUsdCents(inv.total)} received
        </p>
      )}
    </li>
  );
}

export function ReceivablesTable({
  invoices,
  startRank = 1,
}: {
  invoices: OpenInvoice[];
  startRank?: number;
}) {
  if (invoices.length === 0) return null;
  return (
    <ol className="space-y-2">
      {invoices.map((inv, i) => (
        <InvoiceCard
          key={`${inv.invoiceNumber}-${inv.customer}-${i}`}
          inv={inv}
          rank={startRank + i}
        />
      ))}
    </ol>
  );
}
