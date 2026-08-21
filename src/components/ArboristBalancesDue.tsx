// ============================================================================
// Open balances for ONE sales arborist — the panel on their roster page
// ============================================================================
// Rendered at the bottom of /hub/arborists/[slug], the same footer slot the PHC
// renewals panel uses. Oldest invoice first: the top of this list is the call
// they should make today.
//
// Visibility follows the page it sits on — anyone with Sales Arborist Hub access
// sees it, the same as the sales figures already on this page. The whole hub is
// behind a login and the team sees each other's numbers throughout it, so open
// balances are not treated as a secret.
//
// The arborist is matched to the export's "Sold By" column on their roster FIRST
// NAME, which is the same key the rest of the sales attribution uses.
// ============================================================================

import Link from 'next/link';
import { getAllowedUser, canUploadReceivables } from '@/lib/auth';
import { loadActiveReceivables } from '@/lib/receivables-data';
import {
  bookForKey,
  buildCallListText,
  callableInvoices,
  trivialInvoices,
} from '@/lib/receivables';
import { ReceivablesTable, ageLabel } from '@/components/ReceivablesTable';
import { SegmentSplitBar } from '@/components/SegmentSplitBar';
import { CopyButton } from '@/components/CopyButton';
import { fmtUsd, fmtUsdCents, fmtDateTime } from '@/lib/format';

function Stat({
  label,
  value,
  tone = 'normal',
  note,
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'alarm';
  note?: string;
}) {
  return (
    <div className="rounded-2 border-2 border-paper-edge bg-white px-4 py-3">
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
      <p
        className={`mt-1 font-headline text-2xl font-black ${
          tone === 'alarm' ? 'text-status-behind' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-fg-3">{note}</p>}
    </div>
  );
}

export async function ArboristBalancesDue({
  salespersonName,
  displayName,
}: {
  /** The roster row's raw first name — what the export's "Sold By" matches on. */
  salespersonName: string;
  /** Display name for headings, e.g. "Dave A". */
  displayName: string;
}) {
  const user = await getAllowedUser();
  if (!user) return null;

  const active = await loadActiveReceivables();
  if (!active) return null;

  const book = bookForKey(active.data, salespersonName);
  const callable = book ? callableInvoices(book) : [];
  const pennies = book ? trivialInvoices(book) : [];

  // Nothing owed is worth saying out loud — it's the good outcome, and a silent
  // panel would read as "not built yet" instead of "you're clear".
  if (!book || callable.length === 0) {
    return (
      <section id={COLLECTIONS_ANCHOR} className="mt-12 scroll-mt-6">
        <p className="bt-eyebrow">Collections</p>
        <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
          Money still out there
        </h2>
        <div className="mt-4 rounded-card border-2 border-green bg-green/10 px-4 py-4">
          <p className="font-headline text-sm font-black text-green-dark">
            Nothing outstanding. {displayName} is clear.
          </p>
          <p className="mt-1 text-xs text-fg-2">
            Every completed job in the current report has been paid
            {pennies.length > 0 && (
              <>
                {' '}— apart from {pennies.length}{' '}
                {pennies.length === 1 ? 'balance' : 'balances'} under $5 (
                {fmtUsdCents(pennies.reduce((s, i) => s + i.balance, 0))} total),
                not worth a call
              </>
            )}
            .
          </p>
        </div>
      </section>
    );
  }

  const callableTotal = callable.reduce((s, i) => s + i.balance, 0);
  const oldest = callable[0];

  return (
    <section id={COLLECTIONS_ANCHOR} className="mt-12 scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="bt-eyebrow">Collections</p>
          <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
            Money still out there ({callable.length})
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-fg-2">
            Completed jobs of {displayName}&apos;s that haven&apos;t been paid,{' '}
            <strong className="font-black text-ink">oldest first</strong>. Start
            at the top.
          </p>
        </div>
        <CopyButton
          text={buildCallListText(book)}
          label={`Copy all ${callable.length}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Outstanding" value={fmtUsd(callableTotal)} />
        <Stat
          label="61+ days"
          value={fmtUsd(book.over60Balance)}
          tone={book.over60Balance > 0 ? 'alarm' : 'normal'}
          note="Needs a call"
        />
        <Stat label="Oldest" value={ageLabel(book.oldestDays)} />
        <Stat label="Customers" value={String(book.customerCount)} />
      </div>

      <SegmentSplitBar split={book.bySegment} className="mt-4 max-w-2xl" />

      {/* Name the single oldest one in a sentence. A list of 30 invoices is easy
          to put off; one named customer is a task. */}
      <p className="mt-4 rounded-2 border-2 border-l-[7px] border-ink border-l-status-behind bg-bone px-4 py-3 text-[13px] leading-relaxed text-fg-2">
        <strong className="font-black text-ink">Oldest on the list:</strong>{' '}
        {oldest.customer} — {fmtUsdCents(oldest.balance)}, completed{' '}
        {oldest.completedOn ?? 'date unknown'} ({ageLabel(oldest.daysOld)} ago).
      </p>

      <div className="mt-4">
        <ReceivablesTable invoices={callable} />
      </div>

      {pennies.length > 0 && (
        <p className="mt-3 text-xs text-fg-3">
          Plus {pennies.length}{' '}
          {pennies.length === 1 ? 'balance' : 'balances'} under $5 (
          {fmtUsdCents(pennies.reduce((s, i) => s + i.balance, 0))} in total),
          left off the list — rounding left over from a partial payment, not
          worth a phone call.
        </p>
      )}

      <p className="mt-4 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
        From the Job Completed Detail report uploaded{' '}
        {fmtDateTime(active.uploadedAt)}. Ages are counted from the job&apos;s
        completion date, not from an invoice due date — the export doesn&apos;t
        carry payment terms.
        {canUploadReceivables(user.role) && (
          <>
            {' '}
            <Link href="/hub/receivables" className="font-bold underline">
              Refresh the report
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}

/** The id the on-page jump link targets. One constant, so the link and the
 *  section can't drift apart. */
export const COLLECTIONS_ANCHOR = 'collections';

/**
 * The pill under the month picker that jumps to the collections list.
 *
 * It carries the amount, not just a label — the whole reason to put it at the
 * top is so an arborist knows there's money waiting without scrolling to find
 * out. Renders nothing when they're clear: an empty prompt to go look at an
 * empty list is just noise.
 *
 * This loads the report a second time (ArboristBalancesDue loads it too). At
 * ten users that's a cheap query, and the alternative — threading the data
 * through SalespersonDetail, which otherwise knows nothing about collections —
 * costs more in coupling than it saves.
 */
export async function CollectionsJumpLink({
  salespersonName,
}: {
  salespersonName: string;
}) {
  const user = await getAllowedUser();
  if (!user) return null;

  const active = await loadActiveReceivables();
  if (!active) return null;

  const book = bookForKey(active.data, salespersonName);
  if (!book) return null;
  const callable = callableInvoices(book);
  if (callable.length === 0) return null;

  const total = callable.reduce((s, i) => s + i.balance, 0);

  return (
    <a
      href={`#${COLLECTIONS_ANCHOR}`}
      className="mt-3 inline-flex items-center gap-2 rounded-full border-[3px] border-orange bg-orange/10 px-3.5 py-1.5 transition-colors hover:!border-orange-press"
    >
      <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press">
        Money still out there
      </span>
      <span className="font-headline text-sm font-black text-ink">
        {fmtUsd(total)}
      </span>
      <span className="font-headline text-xs font-bold text-fg-2">
        {callable.length} invoice{callable.length === 1 ? '' : 's'} &darr;
      </span>
    </a>
  );
}
