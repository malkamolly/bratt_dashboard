import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { isEntryComparable } from '@/lib/cost-analysis';
import { loadReviewEntries, type RemovalEntry, type EntryStatus } from '@/lib/removal-entries';
import { fmtUsd } from '@/lib/format';
import { addEntry, setEntryStatus, includeAllPending } from './actions';
import UploadCard from './UploadCard';

export const dynamic = 'force-dynamic';

// How a given entry would land in the analysis, for the review badge.
function classify(e: RemovalEntry): { label: string; tone: 'good' | 'warn' | 'muted'; reason?: string } {
  if (e.muni) return { label: 'Municipal', tone: 'muted' };
  if (isEntryComparable(e)) return { label: 'In pricing', tone: 'good' };
  // Included but not comparable — say why, mirroring the clean-set rules.
  const reasons: string[] = [];
  if (e.stems > 1) reasons.push('multi-trunk');
  if (e.dbh == null) reasons.push('no DBH');
  if (e.height == null) reasons.push('missing height');
  if (e.crown == null || e.crown <= 0) reasons.push('missing crown');
  if (e.price == null) reasons.push('no price');
  return { label: 'Totals only', tone: 'warn', reason: reasons.join(', ') || 'below size floor' };
}

const BADGE: Record<'good' | 'warn' | 'muted', string> = {
  good: 'bg-lime/30 text-bark-deep',
  warn: 'bg-status-warn/40 text-ink',
  muted: 'bg-paper-edge/50 text-fg-2',
};

export default async function CostAnalysisDataPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.email)) redirect('/access-denied');

  const sp = await searchParams;
  const pending = await loadReviewEntries();

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
        Add &amp; Review Jobs
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Add &amp; Review Jobs
      </h1>
      {/* The include-before-it-counts rule is the one thing worth saying up top.
          It used to be repeated in the upload card and the queue heading too. */}
      <p className="mt-3 max-w-3xl text-fg-2">
        Nothing added here reaches the{' '}
        <Link href="/cost-analysis" className="font-bold text-orange hover:underline">
          Cost Analysis
        </Link>{' '}
        figures until you <strong>Include</strong> it below.{' '}
        <Link href="/cost-analysis/jobs" className="font-bold text-orange hover:underline">
          Manage all jobs &rarr;
        </Link>
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

      {/* ---------- Bulk upload ---------- */}
      <UploadCard />

      {/* ---------- Add form ----------
          Folded away by default: uploading is the normal path now, so eleven
          always-open fields were pushing the review queue off the screen. */}
      <details className="bt-card mt-6 group">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-headline text-lg font-black uppercase text-bark-deep hover:text-orange [&::-webkit-details-marker]:hidden">
          <span className="text-fg-3 transition-transform group-open:rotate-90">&#9656;</span>
          Add one job by hand
        </summary>
        <p className="mt-3 max-w-3xl text-sm text-fg-2">
          Invoice, price and DBH are required. Height and crown spread are optional
          &mdash; but a job only moves the pricing numbers with all three
          measurements. Each invoice can be entered once.
        </p>
        <form action={addEntry} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Invoice number *" name="inv" type="text" placeholder="222427511" required />
          <Field label="Price ($) *" name="price" type="number" step="0.01" placeholder="1248.40" required />
          <Field label="DBH — trunk diameter (in) *" name="dbh" type="number" step="0.1" placeholder="18" required />
          <Field label="Height (ft)" name="height" type="number" step="0.1" placeholder="30" />
          <Field label="Crown spread (ft)" name="crown" type="number" step="0.1" placeholder="25" />
          <Field label="Species" name="species" type="text" placeholder="Ash" />
          <Field label="Sold by (First + last initial)" name="seller" type="text" placeholder="Patrick W" />
          <Field label="Date completed" name="date" type="date" />
          <Field label="Trunks (leave 1 unless a clump)" name="stems" type="number" step="1" placeholder="1" />
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-bold text-fg-2">Hauling?</span>
            <select
              name="haul"
              className="rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-ink"
              defaultValue="yes"
            >
              <option value="yes">With hauling</option>
              <option value="no">No hauling</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="muni" className="h-4 w-4" />
            <span className="font-bold text-fg-2">Municipal job (exclude from pricing)</span>
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-card border-[3px] border-orange bg-orange px-6 py-2.5 font-headline text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-bark-deep"
            >
              Add to pending
            </button>
          </div>
        </form>
      </details>

      {/* ---------- Review queue ---------- */}
      <EntryList
        title="Pending review"
        subtitle="Include the ones you want counted; remove the rest."
        entries={pending}
        highlight
      />
    </main>
  );
}

function EntryList({
  title,
  subtitle,
  entries,
  highlight = false,
}: {
  title: string;
  subtitle: string;
  entries: RemovalEntry[];
  highlight?: boolean;
}) {
  return (
    <section className={`bt-card mt-8 ${highlight ? 'border-orange' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            {title}
            {entries.length > 0 && <span className="ml-2 text-fg-3">({entries.length})</span>}
          </h2>
          <p className="mb-4 max-w-2xl text-sm text-fg-2">{subtitle}</p>
        </div>
        {/* A 100-row upload is unreviewable one button at a time. */}
        {entries.length > 1 && (
          <form action={includeAllPending}>
            <button
              type="submit"
              className="rounded-card border-2 border-lime bg-lime/30 px-4 py-2 font-headline text-xs font-black uppercase tracking-wide text-bark-deep transition-colors hover:bg-lime/60"
            >
              Include all {entries.length}
            </button>
          </form>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-fg-3">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                <th className="py-1.5 pr-3 font-extrabold uppercase">Invoice</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Date</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">DBH</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Height</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Crown</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Price</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Species</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Seller</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">Effect</th>
                <th className="py-1.5 font-extrabold uppercase">Review</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const c = classify(e);
                // What the spreadsheet parser had to interpret, if anything. The
                // leading sentence is boilerplate on every uploaded row.
                const detail = e.note?.replace(/^Uploaded from spreadsheet\.\s*/, '').trim();
                return (
                  <Fragment key={e.id}>
                    <tr className="border-b border-bark/10 align-middle">
                      <td className="py-2 pr-3 font-bold text-ink">
                        {e.inv}
                        {!e.haul && <span className="ml-1 text-[10px] text-fg-3">(no haul)</span>}
                      </td>
                      <td className="py-2 pr-3 text-fg-2">{e.date ?? '—'}</td>
                      <td className="py-2 pr-3 text-ink">
                        {e.dbh != null ? `${e.dbh}"` : '—'}
                        {e.stems > 1 && (
                          <span className="ml-1 whitespace-nowrap text-[10px] font-bold text-fg-3">
                            ×{e.stems} trunks
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-fg-2">
                        {e.height != null ? `${e.height}′` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-fg-2">
                        {e.crown != null ? `${e.crown}′` : '—'}
                      </td>
                      <td className="py-2 pr-3 font-bold text-orange">
                        {e.price != null ? fmtUsd(e.price) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-fg-2">{e.species ?? '—'}</td>
                      <td className="py-2 pr-3 text-fg-2">{e.seller ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${BADGE[c.tone]}`}>
                          {c.label}
                        </span>
                        {c.reason && <span className="ml-1 text-[10px] text-fg-3">{c.reason}</span>}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/cost-analysis/jobs/${e.id}/edit?returnTo=${encodeURIComponent('/cost-analysis/data')}`}
                            className="rounded px-1.5 py-1 text-base hover:bg-lime/30"
                            title="Edit before including"
                            aria-label="Edit job"
                          >
                            ✏️
                          </Link>
                          <StatusButton id={e.id} status="included" current={e.status} label="Include" tone="good" />
                          <StatusButton id={e.id} status="removed" current={e.status} label="Remove" tone="bad" />
                        </div>
                      </td>
                    </tr>
                    {/* Uploaded rows carry the parser's reading of the description
                        text, so you can check it against what the seller typed.
                        Held to one truncated line — at 100 rows a wrapping note
                        doubles the length of the whole queue. Full text on hover. */}
                    {detail && (
                      <tr className="border-b border-bark/10">
                        <td colSpan={10} className="max-w-0 truncate pb-2 pr-3 text-[11px] text-fg-3" title={detail}>
                          {detail}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusButton({
  id,
  status,
  current,
  label,
  tone,
}: {
  id: string;
  status: EntryStatus;
  current: EntryStatus;
  label: string;
  tone: 'good' | 'bad';
}) {
  const active = current === status;
  const cls = active
    ? 'cursor-default bg-bark/10 text-fg-3'
    : tone === 'good'
    ? 'bg-lime/30 text-bark-deep hover:bg-lime/60'
    : 'bg-paper-edge/50 text-fg-2 hover:bg-orange/20';
  return (
    <form action={setEntryStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={active}
        className={`rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}
      >
        {active ? `✓ ${label}d` : label}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  step,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type: string;
  step?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-bold text-fg-2">{label}</span>
      <input
        type={type}
        name={name}
        step={step}
        placeholder={placeholder}
        required={required}
        className="rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-ink placeholder:text-fg-3/60"
      />
    </label>
  );
}
