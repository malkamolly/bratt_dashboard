// ============================================================================
// Collections roll-up — /hub/receivables
// ============================================================================
// The manager's view of the same data each arborist sees on their own roster
// page: what's outstanding, how old it is, and whose book it sits in. Arborists
// don't come here (they get their own list on their page); this is for the
// people who run collections, so it's gated to canSeeAllReceivables.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  requireHubAccess,
  canSeeAllReceivables,
  canUploadReceivables,
} from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { listRoster } from '@/lib/roster-data';
import { loadActiveReceivables } from '@/lib/receivables-data';
import {
  AGE_BUCKET_ORDER,
  AGE_BUCKET_LABELS,
  AGE_BUCKET_COLORS,
  callableInvoices,
  type ArboristBook,
  type ReceivablesData,
} from '@/lib/receivables';
import { ReceivablesTable, ageLabel } from '@/components/ReceivablesTable';
import { fmtUsd, fmtUsdCents, fmtDateTime } from '@/lib/format';
import { uploadReceivablesData } from './actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

function Tile({
  label,
  value,
  note,
  tone = 'normal',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'normal' | 'alarm';
}) {
  return (
    <div className="rounded-card border-[3px] border-paper-edge bg-white p-4">
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {label}
      </p>
      <p
        className={`mt-1 font-headline text-3xl font-black ${
          tone === 'alarm' ? 'text-status-behind' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-fg-2">{note}</p>}
    </div>
  );
}

/** The aging spread as one stacked bar — oldest (darkest) on the left. */
function AgingBar({ data }: { data: ReceivablesData }) {
  const total = data.totals.balance || 1;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-2 border-2 border-ink">
        {AGE_BUCKET_ORDER.map((b) => {
          const pct = (data.byBucket[b].balance / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={b}
              style={{ width: `${pct}%`, backgroundColor: AGE_BUCKET_COLORS[b] }}
              title={`${AGE_BUCKET_LABELS[b]}: ${fmtUsd(data.byBucket[b].balance)}`}
            />
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {AGE_BUCKET_ORDER.map((b) => (
          <li key={b} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-ink/30"
              style={{ backgroundColor: AGE_BUCKET_COLORS[b] }}
            />
            <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
              {AGE_BUCKET_LABELS[b]}
            </span>
            <span className="font-headline text-[11px] font-black text-ink">
              {fmtUsd(data.byBucket[b].balance)}
            </span>
            <span className="text-[11px] text-fg-3">
              ({data.byBucket[b].count})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookRow({
  book,
  slug,
  maxOver60,
}: {
  book: ArboristBook;
  slug: string | null;
  maxOver60: number;
}) {
  const callable = callableInvoices(book);
  const pct = (book.over60Balance / (maxOver60 || 1)) * 100;
  const heading = (
    <span className="font-headline text-sm font-black uppercase text-bark-deep">
      {book.name}
    </span>
  );
  return (
    <li className="rounded-2 border-2 border-paper-edge bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {slug ? (
            <Link href={`/hub/arborists/${slug}`} className="hover:underline">
              {heading}
            </Link>
          ) : (
            heading
          )}
          <p className="mt-0.5 text-xs text-fg-3">
            {callable.length} open {callable.length === 1 ? 'invoice' : 'invoices'}{' '}
            &middot; {book.customerCount}{' '}
            {book.customerCount === 1 ? 'customer' : 'customers'} &middot; oldest{' '}
            {ageLabel(book.oldestDays)}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-baseline gap-4">
          <div className="text-right">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              61+ days
            </p>
            <p className="font-headline text-base font-black text-status-behind">
              {fmtUsd(book.over60Balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Total
            </p>
            <p className="font-headline text-base font-black text-ink">
              {fmtUsd(book.totalBalance)}
            </p>
          </div>
        </div>
      </div>
      {/* Bar is scaled to the 61+ column, which is what the list is ranked on —
          so the bar and the order always agree. */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper-edge/70">
        <div
          className="h-full rounded-full bg-status-behind"
          style={{ width: `${Math.max(pct, book.over60Balance > 0 ? 2 : 0)}%` }}
        />
      </div>
    </li>
  );
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await requireHubAccess('hub');
  // A sales arborist's collections list lives on their own roster page, not
  // here — this page shows everyone's. Bounce rather than render a blank shell.
  if (!canSeeAllReceivables(user.role)) redirect('/hub/arborists');

  const sp = await searchParams;
  const canUpload = canUploadReceivables(user.role);
  const [active, roster] = await Promise.all([
    loadActiveReceivables(),
    listRoster(),
  ]);

  // Map an arborist's first name back to their roster slug so each row links to
  // the page where the full list lives.
  const slugByKey = new Map(
    roster.map((m) => [m.salesperson_name.toLowerCase(), m.slug]),
  );
  // Anyone on the roster without a work email can't be shown their own list —
  // worth naming here, since the failure is silent on their page by design.
  const unmapped = roster.filter((m) => !m.work_email);

  const header = (
    <>
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Collections
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Money Still Out There
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Completed work that hasn&apos;t been paid for, oldest first, and whose
        book each invoice sits in.
      </p>
      <div className="mt-8">
        <HubSubNav active="/hub/receivables" />
      </div>
      {sp.saved && (
        <div className="mb-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          {decodeURIComponent(sp.saved)}
        </div>
      )}
      {sp.error && (
        <div className="mb-6 rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {decodeURIComponent(sp.error)}
        </div>
      )}
    </>
  );

  const uploadCard = canUpload ? (
    <section className="mt-12 rounded-card border-[3px] border-dashed border-paper-edge bg-bone p-5">
      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Manager tools
      </p>
      <h2 className="mt-1 font-headline text-2xl font-black uppercase text-bark-deep">
        Refresh this list
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-fg-2">
        Upload the{' '}
        <strong className="font-black text-ink">Job Completed Detail</strong>{' '}
        export (.xlsx) straight from the service software — no reformatting.
        Leave <em>Hide $0 invoices from completed jobs</em> on; fully-paid rows
        are dropped here anyway.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-fg-2">
        <strong className="font-black text-ink">
          A new upload replaces this list completely
        </strong>{' '}
        — every figure here and on every arborist&apos;s page is recalculated
        from the file. Nothing is merged across uploads.
      </p>
      <form
        action={uploadReceivablesData}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv"
          required
          aria-label="Job Completed Detail export"
          className="block w-full text-sm text-fg-2 file:mr-4 file:rounded-2 file:border-0 file:bg-bark-deep file:px-4 file:py-2 file:font-headline file:text-xs file:font-extrabold file:uppercase file:tracking-ribbon file:text-white hover:file:bg-bark"
        />
        <button type="submit" className="bt-btn bt-btn-primary justify-center sm:w-auto">
          Replace list
        </button>
      </form>
      <p className="mt-4 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
        The file needs these columns:{' '}
        <strong className="text-fg-2">
          Customer Name, Balance, Completion Date
        </strong>
        . It also reads Invoice #, Total, Customer Phone, Customer Email and Sold
        By when present. The export&apos;s grand-total row is ignored, and if a
        required column is missing the upload is refused rather than showing you
        zeroes.
      </p>
      {unmapped.length > 0 && (
        <p className="mt-3 rounded-2 border-2 border-status-warn bg-status-warn/10 px-3 py-2 text-xs text-bark-deep">
          <strong className="font-black">
            {unmapped.length} {unmapped.length === 1 ? 'arborist has' : 'arborists have'}{' '}
            no work email set
          </strong>{' '}
          ({unmapped.map((m) => m.name).join(', ')}), so they can&apos;t see
          their own list yet. Add it under{' '}
          <Link href="/admin/sales" className="font-bold underline">
            Admin → Sales → Roster
          </Link>
          .
        </p>
      )}
    </section>
  ) : null;

  if (!active) {
    return (
      <main className="bt-page">
        {header}
        <section className="rounded-card border-2 border-l-[7px] border-ink border-l-fg-3 bg-bone p-5">
          <p className="font-headline text-lg font-black uppercase text-bark-deep">
            No list uploaded yet
          </p>
          <p className="mt-2 max-w-2xl text-sm text-fg-2">
            {canUpload
              ? 'Upload the Job Completed Detail export below and every arborist will see their own open balances on their roster page.'
              : 'Once a manager uploads the Job Completed Detail export, open balances show up here and on each arborist’s roster page.'}
          </p>
        </section>
        {uploadCard}
      </main>
    );
  }

  const { data, uploadedAt } = active;
  const T = data.totals;
  const maxOver60 = Math.max(...data.books.map((b) => b.over60Balance), 1);
  // The single worst invoices across everyone — the shortlist a manager would
  // actually work down in a collections push.
  const worst = data.books
    .flatMap((b) => callableInvoices(b))
    .sort((a, b) => b.daysOld - a.daysOld || b.balance - a.balance)
    .slice(0, 10);

  return (
    <main className="bt-page">
      {header}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Outstanding"
          value={fmtUsd(T.balance)}
          note={`${T.invoiceCount} invoices · ${T.customerCount} customers`}
        />
        <Tile
          label="61+ days"
          value={fmtUsd(T.over60Balance)}
          tone="alarm"
          note={`${fmtPctOf(T.over60Balance, T.balance)} of the total`}
        />
        <Tile
          label="91+ days"
          value={fmtUsd(T.over90Balance)}
          tone="alarm"
          note="Hardest to collect"
        />
        <Tile label="Oldest" value={ageLabel(T.oldestDays)} note="Since completion" />
      </div>

      <section className="mt-10">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          How old the money is
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-2">
          Counted from each job&apos;s completion date. The export carries no
          payment terms, so this is age since the work was finished — not days
          past an invoice due date.
        </p>
        <div className="mt-4">
          <AgingBar data={data} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          Whose book it&apos;s in
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-2">
          Ranked by what&apos;s sat 61+ days, not by headline total — that&apos;s
          the money that actually needs a call. Open a name to see their full
          list.
        </p>
        <ul className="mt-4 space-y-2">
          {data.books.map((b) => (
            <BookRow
              key={b.name}
              book={b}
              slug={b.key ? (slugByKey.get(b.key) ?? null) : null}
              maxOver60={maxOver60}
            />
          ))}
        </ul>
        {data.books.some((b) => !b.key) && (
          <p className="mt-3 text-xs text-fg-3">
            <strong className="text-fg-2">Unassigned</strong> is work the export
            didn&apos;t attribute to a salesperson — nobody sees it on a personal
            page, so it needs an owner before it gets chased.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          The ten oldest, company-wide
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-2">
          If you only make ten calls this week, make these.
        </p>
        <div className="mt-4">
          <ReceivablesTable invoices={worst} />
        </div>
      </section>

      <p className="mt-10 border-t-2 border-paper-edge pt-3 text-xs text-fg-3">
        From {data.meta.sourceFilename ?? 'an export'} uploaded{' '}
        {fmtDateTime(uploadedAt)}
        {data.meta.uploadedBy && <> by {data.meta.uploadedBy}</>}. Read{' '}
        {data.meta.rowsRead} rows
        {data.meta.excludedPaid > 0 && (
          <>, dropped {data.meta.excludedPaid} with nothing owing</>
        )}
        {T.trivialCount > 0 && (
          <>
            , and held {T.trivialCount} balance
            {T.trivialCount === 1 ? '' : 's'} under $5 (
            {fmtUsdCents(T.trivialBalance)}) off the call lists
          </>
        )}
        .
      </p>

      {uploadCard}
    </main>
  );
}

/** "42%" — share of a total, with a graceful zero. */
function fmtPctOf(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}
