import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { isEntryComparable } from '@/lib/cost-analysis';
import { loadAllEntries, type RemovalEntry, type EntryStatus } from '@/lib/removal-entries';
import { fmtUsd } from '@/lib/format';
import { addEntry, setEntryStatus } from './actions';

export const dynamic = 'force-dynamic';

// How a given entry would land in the analysis, for the review badge.
function classify(e: RemovalEntry): { label: string; tone: 'good' | 'warn' | 'muted'; reason?: string } {
  if (e.muni) return { label: 'Excluded — municipal', tone: 'muted' };
  if (isEntryComparable(e)) return { label: 'Counts toward pricing', tone: 'good' };
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
  const entries = await loadAllEntries();
  const pending = entries.filter((e) => e.status === 'pending');
  const included = entries.filter((e) => e.status === 'included');
  const excluded = entries.filter((e) => e.status === 'excluded');

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
      <p className="mt-4 max-w-3xl text-fg-2">
        Add completed removals here. Every job lands in <strong>Pending</strong>{' '}
        and is invisible to the numbers until you <strong>Include</strong> it.
        Only included jobs feed the{' '}
        <Link href="/cost-analysis" className="font-bold text-orange hover:underline">
          Cost Analysis
        </Link>{' '}
        figures &mdash; the pricing calculator itself is unaffected. Exclude a job
        anytime to pull it back out.
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

      {/* ---------- Add form ---------- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">Add a job</h2>
        <p className="mt-2 max-w-3xl text-sm text-fg-2">
          Invoice number and price are required, plus trunk size (DBH). Height and
          crown spread are optional &mdash; but a job only moves the pricing
          numbers when it has all three measurements. Every invoice can be entered
          once.
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
      </section>

      {/* ---------- Review lists ---------- */}
      <EntryList
        title="Pending — awaiting your review"
        subtitle="These are NOT in the numbers yet. Include the ones you want counted."
        entries={pending}
        highlight
      />
      <EntryList
        title={`Included (${included.length}) — feeding the analysis`}
        subtitle="Counted in the Cost Analysis figures. Exclude to pull one back out."
        entries={included}
      />
      <EntryList
        title={`Excluded (${excluded.length})`}
        subtitle="Kept on record but never counted. Include one to bring it back."
        entries={excluded}
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
      <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">{title}</h2>
      <p className="mb-4 text-sm text-fg-2">{subtitle}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-fg-3">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                <th className="py-1.5 pr-3 font-extrabold uppercase">Invoice</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">DBH</th>
                <th className="py-1.5 pr-3 font-extrabold uppercase">H × Crown</th>
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
                return (
                  <tr key={e.id} className="border-b border-bark/10 align-middle">
                    <td className="py-2 pr-3 font-bold text-ink">
                      {e.inv}
                      {!e.haul && <span className="ml-1 text-[10px] text-fg-3">(no haul)</span>}
                    </td>
                    <td className="py-2 pr-3 text-ink">{e.dbh != null ? `${e.dbh}"` : '—'}</td>
                    <td className="py-2 pr-3 text-fg-2">
                      {e.height != null ? `${e.height}′` : '—'} × {e.crown != null ? `${e.crown}′` : '—'}
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
                      <div className="flex gap-1.5">
                        <StatusButton id={e.id} status="included" current={e.status} label="Include" tone="good" />
                        <StatusButton id={e.id} status="excluded" current={e.status} label="Exclude" tone="bad" />
                      </div>
                    </td>
                  </tr>
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
