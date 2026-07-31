import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { isEntryComparable } from '@/lib/cost-analysis';
import { loadEntriesByStatus, type RemovalEntry, type JobSort } from '@/lib/removal-entries';
import { fmtUsd } from '@/lib/format';
import { removeJob, restoreJob } from './actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SP = {
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
  removed?: string;
  pricing?: string;
  ok?: string;
  error?: string;
};

const SORTS: JobSort[] = ['date', 'price', 'dbh', 'height', 'crown', 'species', 'seller', 'inv'];

/** A job enriched with whether it currently feeds the pricing figures. */
type Job = RemovalEntry & { comparable: boolean };

function buildQuery(sp: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...sp, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.sort) params.set('sort', merged.sort);
  if (merged.dir) params.set('dir', merged.dir);
  if (merged.page && merged.page !== '1') params.set('page', merged.page);
  if (merged.removed) params.set('removed', merged.removed);
  if (merged.pricing) params.set('pricing', merged.pricing);
  const s = params.toString();
  return `/cost-analysis/jobs${s ? `?${s}` : ''}`;
}

function fieldFor(j: Job, key: JobSort): string | number | null {
  switch (key) {
    case 'price':
      return j.price;
    case 'dbh':
      return j.dbh;
    case 'height':
      return j.height;
    case 'crown':
      return j.crown;
    case 'species':
      return j.species;
    case 'seller':
      return j.seller;
    case 'inv':
      return j.inv;
    case 'date':
    default:
      return j.date;
  }
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.email)) redirect('/access-denied');

  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as JobSort) ? sp.sort : 'date') as JobSort;
  const dir = sp.dir === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(sp.page) || 1);
  const showRemoved = sp.removed === '1';
  const pricingOnly = !showRemoved && sp.pricing === '1';
  const q = (sp.q ?? '').trim().toLowerCase();

  // Load every job of this status; the set is small enough to work in memory.
  const entries = await loadEntriesByStatus(showRemoved ? 'removed' : 'included');

  // Invoice -> count of included rows, for the "only tree on its invoice" rule.
  const counts = new Map<string, number>();
  if (!showRemoved) {
    for (const e of entries) if (e.inv) counts.set(e.inv, (counts.get(e.inv) ?? 0) + 1);
  }
  const enrich = (e: RemovalEntry): Job => ({
    ...e,
    comparable:
      !showRemoved && isEntryComparable(e) && e.inv != null && (counts.get(e.inv) ?? 0) === 1,
  });

  let jobs: Job[] = entries.map(enrich);
  const inPricingCount = jobs.filter((j) => j.comparable).length;

  if (q) {
    jobs = jobs.filter(
      (j) =>
        (j.inv ?? '').toLowerCase().includes(q) ||
        (j.species ?? '').toLowerCase().includes(q) ||
        (j.seller ?? '').toLowerCase().includes(q),
    );
  }
  if (pricingOnly) jobs = jobs.filter((j) => j.comparable);

  const mul = dir === 'asc' ? 1 : -1;
  jobs.sort((a, b) => {
    const av = fieldFor(a, sort);
    const bv = fieldFor(b, sort);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });

  const total = jobs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageJobs = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const returnTo = buildQuery(sp, {});

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/cost-analysis" className="hover:underline">
          Cost Analysis
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Manage Jobs
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Manage Jobs
      </h1>
      <p className="mt-4 max-w-3xl text-fg-2">
        Every job behind the Cost Analysis figures. Jobs that feed the{' '}
        <strong>pricing</strong> numbers show normally; the rest are{' '}
        <span className="text-fg-3 line-through">struck through</span> — they still count in the
        totals (job count, revenue) but not in the price medians. Search, sort, edit ✏️, or
        remove ✕; changes update the numbers immediately.
      </p>

      {sp.ok && (
        <div className="mt-6 rounded-card border-2 border-lime bg-lime/15 px-4 py-3 text-sm font-bold text-bark-deep">
          {sp.ok}
        </div>
      )}
      {sp.error && (
        <div className="mt-6 rounded-card border-2 border-orange bg-orange/10 px-4 py-3 text-sm font-bold text-orange">
          {sp.error}
        </div>
      )}

      {/* ---------- Controls ---------- */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Search invoice, species, seller…"
            className="w-64 rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-sm text-ink"
          />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          {showRemoved && <input type="hidden" name="removed" value="1" />}
          {pricingOnly && <input type="hidden" name="pricing" value="1" />}
          <button
            type="submit"
            className="rounded-card border-2 border-bark/25 bg-white px-4 py-2 text-sm font-bold text-ink hover:bg-lime/20"
          >
            Search
          </button>
          {sp.q && (
            <Link href={buildQuery(sp, { q: '', page: '1' })} className="text-sm text-fg-3 hover:underline">
              Clear
            </Link>
          )}
        </form>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {!showRemoved && (
            <Link
              href={buildQuery(sp, { pricing: pricingOnly ? '' : '1', page: '1' })}
              className={`rounded-card border-2 px-3 py-2 font-bold ${
                pricingOnly ? 'border-orange bg-orange/10 text-ink' : 'border-bark/20 text-fg-2 hover:bg-lime/20'
              }`}
            >
              {pricingOnly ? 'Pricing jobs only ✓' : 'Hide non-pricing'}
            </Link>
          )}
          <Link
            href={buildQuery(sp, { removed: showRemoved ? '' : '1', pricing: '', page: '1' })}
            className={`rounded-card border-2 px-3 py-2 font-bold ${
              showRemoved ? 'border-orange bg-orange/10 text-ink' : 'border-bark/20 text-fg-2 hover:bg-lime/20'
            }`}
          >
            {showRemoved ? 'Showing removed ✓' : 'Show removed'}
          </Link>
          <span className="text-fg-3">
            {total.toLocaleString()} shown
            {!showRemoved && !pricingOnly && !q && ` · ${inPricingCount.toLocaleString()} in pricing`}
          </span>
        </div>
      </div>

      {/* ---------- Table ---------- */}
      <section className="bt-card mt-4">
        {pageJobs.length === 0 ? (
          <p className="text-sm text-fg-3">
            {showRemoved
              ? 'No jobs have been removed. When you remove a job with ✕, it lands here so you can restore it.'
              : q || pricingOnly
              ? 'No jobs match.'
              : 'No jobs found. If you just set this up, make sure migration 066 has run.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                  <SortTh sp={sp} col="inv" label="Invoice" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="dbh" label="DBH" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="height" label="Height" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="crown" label="Crown" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="price" label="Price" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="species" label="Species" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="seller" label="Seller" sort={sort} dir={dir} />
                  <SortTh sp={sp} col="date" label="Date" sort={sort} dir={dir} />
                  <th className="py-1.5 pr-3 font-extrabold uppercase">Effect</th>
                  <th className="py-1.5 font-extrabold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageJobs.map((j) => (
                  <JobRow key={j.id} j={j} showRemoved={showRemoved} returnTo={returnTo} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <PageLink sp={sp} page={page - 1} disabled={page <= 1} label="← Prev" />
            <span className="text-fg-3">
              Page {page} of {totalPages}
            </span>
            <PageLink sp={sp} page={page + 1} disabled={page >= totalPages} label="Next →" />
          </div>
        )}
      </section>
    </main>
  );
}

function SortTh({
  sp,
  col,
  label,
  sort,
  dir,
}: {
  sp: SP;
  col: JobSort;
  label: string;
  sort: JobSort;
  dir: 'asc' | 'desc';
}) {
  const active = sort === col;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
  const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className="py-1.5 pr-3 font-extrabold uppercase">
      <Link
        href={buildQuery(sp, { sort: col, dir: nextDir, page: '1' })}
        className={`hover:underline ${active ? 'text-ink' : ''}`}
      >
        {label}
        {arrow}
      </Link>
    </th>
  );
}

function PageLink({ sp, page, disabled, label }: { sp: SP; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="text-fg-3/50">{label}</span>;
  return (
    <Link
      href={buildQuery(sp, { page: String(page) })}
      className="rounded-card border-2 border-bark/20 bg-white px-3 py-1.5 font-bold text-ink hover:bg-lime/20"
    >
      {label}
    </Link>
  );
}

/** Small "adj" tag when a field differs from its original snapshot. */
function AdjMark({ j, k, cur }: { j: Job; k: string; cur: unknown }) {
  if (!j.original || !(k in j.original)) return null;
  const orig = j.original[k];
  if (String(orig ?? '') === String(cur ?? '')) return null;
  return (
    <span className="ml-1 text-[10px] font-bold text-fg-3" title={`was ${orig ?? '—'}`}>
      adj
    </span>
  );
}

function JobRow({ j, showRemoved, returnTo }: { j: Job; showRemoved: boolean; returnTo: string }) {
  const adjusted = j.adjustedPrice != null;
  // Struck: an included job that does NOT feed pricing (totals-only or municipal).
  const struck = !showRemoved && !j.comparable;
  const valueCls = struck ? 'text-fg-3 line-through' : '';

  return (
    <tr className={`border-b border-bark/10 ${showRemoved ? 'opacity-50' : ''}`}>
      <td className={`py-2 pr-3 font-bold text-ink ${valueCls}`}>
        {j.inv ?? '—'}
        {!j.haul && <span className="ml-1 text-[10px] text-fg-3 no-underline">(no haul)</span>}
      </td>
      <td className={`py-2 pr-3 text-ink ${valueCls}`}>
        {j.dbh != null ? `${j.dbh}"` : '—'}
        <AdjMark j={j} k="dbh" cur={j.dbh} />
      </td>
      <td className={`py-2 pr-3 text-fg-2 ${valueCls}`}>
        {j.height != null ? `${j.height}′` : '—'}
        <AdjMark j={j} k="height" cur={j.height} />
      </td>
      <td className={`py-2 pr-3 text-fg-2 ${valueCls}`}>
        {j.crown != null ? `${j.crown}′` : '—'}
        <AdjMark j={j} k="crown" cur={j.crown} />
      </td>
      <td className={`py-2 pr-3 font-bold ${struck ? 'text-fg-3 line-through' : 'text-orange'}`}>
        {j.price != null ? fmtUsd(j.price) : '—'}
        {adjusted && (
          <span className="ml-1 text-[10px] font-bold text-fg-3 no-underline" title={`was ${fmtUsd(j.originalPrice ?? 0)}`}>
            adj
          </span>
        )}
      </td>
      <td className={`py-2 pr-3 text-fg-2 ${valueCls}`}>
        {j.species ?? '—'}
        <AdjMark j={j} k="species" cur={j.species} />
      </td>
      <td className={`py-2 pr-3 text-fg-2 ${valueCls}`}>
        {j.seller ?? '—'}
        <AdjMark j={j} k="seller" cur={j.seller} />
      </td>
      <td className="py-2 pr-3 text-fg-2">
        <span className={valueCls}>{j.date ?? '—'}</span>
        {j.updatedAt && (
          <div className="text-[10px] text-fg-3" title={j.reviewedBy ?? undefined}>
            edited {j.reviewedBy ? `by ${j.reviewedBy} ` : ''}
            {j.updatedAt.slice(0, 10)}
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        {showRemoved ? (
          <span className="rounded bg-paper-edge/50 px-2 py-0.5 text-[11px] font-bold text-fg-2">Removed</span>
        ) : j.muni ? (
          <span className="rounded bg-paper-edge/50 px-2 py-0.5 text-[11px] font-bold text-fg-2">Municipal</span>
        ) : j.comparable ? (
          <span className="rounded bg-lime/30 px-2 py-0.5 text-[11px] font-bold text-bark-deep">In pricing</span>
        ) : (
          <span className="rounded bg-paper-edge/50 px-2 py-0.5 text-[11px] font-bold text-fg-2">Not in pricing</span>
        )}
      </td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/cost-analysis/jobs/${j.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
            className="rounded px-2 py-1 text-base hover:bg-lime/30"
            title="Edit"
            aria-label="Edit job"
          >
            ✏️
          </Link>
          {showRemoved ? (
            <form action={restoreJob}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="rounded bg-lime/30 px-2 py-1 text-xs font-bold text-bark-deep hover:bg-lime/60"
              >
                Restore
              </button>
            </form>
          ) : (
            <form action={removeJob}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="rounded px-2 py-1 text-base text-fg-3 hover:bg-orange/20"
                title="Remove"
                aria-label="Remove job"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}
