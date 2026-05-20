'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtUsdCents } from '@/lib/format';

type Category = 'field-crew' | 'phc' | 'stump' | 'clam-hauling';

type JobRow = {
  id: string;
  category: Category;
  label: string;
  revenue: string; // kept as a string so the input behaves nicely while typing
  days: string;
};

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'field-crew', label: 'Field Crew' },
  { value: 'phc', label: 'PHC' },
  { value: 'stump', label: 'Stump Grinding' },
  { value: 'clam-hauling', label: 'Clam / Hauling' },
];

const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
) as Record<Category, string>;

function newRow(category: Category = 'field-crew'): JobRow {
  return {
    id: crypto.randomUUID(),
    category,
    label: '',
    revenue: '',
    days: '1',
  };
}

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseDays(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Build YYYY-MM-DD in local time (not UTC)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatLongDate(iso: string): string {
  if (!iso) return '';
  // Parse as local date, not UTC, to avoid off-by-one
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ScheduleForm() {
  // Start blank to avoid SSR/CSR hydration mismatch on the date, then fill in on mount.
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [rows, setRows] = useState<JobRow[]>([newRow(), newRow('phc'), newRow('stump')]);

  useEffect(() => {
    setScheduleDate(tomorrowIso());
  }, []);

  function updateRow(id: string, patch: Partial<JobRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  // ---- Derived numbers --------------------------------------------------
  const computed = useMemo(() => {
    const enriched = rows.map((r) => {
      const revenue = parseMoney(r.revenue);
      const days = parseDays(r.days);
      const todayShare = days > 0 ? revenue / days : 0;
      return { ...r, revenueNum: revenue, daysNum: days, todayShare };
    });

    const validRows = enriched.filter((r) => r.revenueNum > 0);

    const grandTotal = validRows.reduce((sum, r) => sum + r.revenueNum, 0);
    const tomorrowTotal = validRows.reduce((sum, r) => sum + r.todayShare, 0);

    const byCategory = CATEGORIES.map((c) => {
      const inCat = validRows.filter((r) => r.category === c.value);
      return {
        value: c.value,
        label: c.label,
        count: inCat.length,
        tomorrowRevenue: inCat.reduce((sum, r) => sum + r.todayShare, 0),
        fullRevenue: inCat.reduce((sum, r) => sum + r.revenueNum, 0),
      };
    });

    const multiDay = validRows.filter((r) => r.daysNum > 1);

    return { enriched, validRows, grandTotal, tomorrowTotal, byCategory, multiDay };
  }, [rows]);

  // ---- Render -----------------------------------------------------------
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ============ Form ============ */}
      <section className="bt-card">
        <p className="bt-eyebrow">Step 1 — Enter the jobs</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Jobs on the schedule
        </h2>

        <label className="mt-5 block">
          <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Schedule date
          </span>
          <input
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>

        <div className="mt-6 space-y-3">
          {rows.map((row, idx) => {
            const revenue = parseMoney(row.revenue);
            const days = parseDays(row.days);
            const share = days > 0 ? revenue / days : 0;
            return (
              <div
                key={row.id}
                className="rounded-md border-2 border-ink/10 bg-white/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                    Job {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="text-xs font-bold text-orange hover:underline disabled:text-fg-3 disabled:no-underline"
                    disabled={rows.length <= 1}
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      Category
                    </span>
                    <select
                      value={row.category}
                      onChange={(e) =>
                        updateRow(row.id, { category: e.target.value as Category })
                      }
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      Customer / label (optional)
                    </span>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateRow(row.id, { label: e.target.value })}
                      placeholder="e.g. Smith — oak removal"
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      Total job revenue ($)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.revenue}
                      onChange={(e) => updateRow(row.id, { revenue: e.target.value })}
                      placeholder="0.00"
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      Total days for this job
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={row.days}
                      onChange={(e) => updateRow(row.id, { days: e.target.value })}
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    />
                  </label>
                </div>

                {days > 1 && revenue > 0 && (
                  <p className="mt-2 text-xs text-fg-2">
                    Multi-day job: {fmtUsdCents(revenue)} ÷ {days} days ={' '}
                    <strong className="text-bark-deep">{fmtUsdCents(share)}</strong> for tomorrow.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-4 bt-btn bt-btn-ghost"
        >
          + Add another job
        </button>
      </section>

      {/* ============ Summary ============ */}
      <section className="bt-card-orange">
        <p className="bt-eyebrow">Step 2 — Share with leadership</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Summary
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          {scheduleDate ? `Schedule for ${formatLongDate(scheduleDate)}` : ' '}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-bark p-4 text-cream">
            <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
              Tomorrow&rsquo;s worth of work
            </p>
            <p className="mt-1 font-headline text-3xl font-black">
              {fmtUsdCents(computed.tomorrowTotal)}
            </p>
            <p className="mt-1 text-xs text-cream/70">
              Multi-day jobs counted as their daily share.
            </p>
          </div>
          <div className="rounded-md border-2 border-bark/20 bg-white p-4">
            <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
              Full contract value of jobs on the schedule
            </p>
            <p className="mt-1 font-headline text-3xl font-black text-bark-deep">
              {fmtUsdCents(computed.grandTotal)}
            </p>
            <p className="mt-1 text-xs text-fg-2">
              {computed.validRows.length} job{computed.validRows.length === 1 ? '' : 's'} entered
              {computed.multiDay.length > 0
                ? ` · ${computed.multiDay.length} multi-day`
                : ''}
              .
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            By category (tomorrow)
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/10 text-left text-fg-2">
                <th className="py-2 font-headline text-[11px] font-extrabold uppercase tracking-ribbon">
                  Category
                </th>
                <th className="py-2 font-headline text-[11px] font-extrabold uppercase tracking-ribbon">
                  Jobs
                </th>
                <th className="py-2 text-right font-headline text-[11px] font-extrabold uppercase tracking-ribbon">
                  Tomorrow
                </th>
              </tr>
            </thead>
            <tbody>
              {computed.byCategory.map((c) => (
                <tr key={c.value} className="border-b border-ink/5">
                  <td className="py-2 font-headline font-bold text-bark-deep">{c.label}</td>
                  <td className="py-2">{c.count}</td>
                  <td className="py-2 text-right font-headline font-bold">
                    {fmtUsdCents(c.tomorrowRevenue)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 font-headline font-extrabold uppercase tracking-ribbon text-xs text-bark-deep">
                  Total
                </td>
                <td className="pt-3 font-headline font-extrabold">
                  {computed.validRows.length}
                </td>
                <td className="pt-3 text-right font-headline text-lg font-black text-bark-deep">
                  {fmtUsdCents(computed.tomorrowTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {computed.multiDay.length > 0 && (
          <div className="mt-6">
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Multi-day jobs
            </p>
            <ul className="mt-2 space-y-2">
              {computed.multiDay.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-ink/10 bg-white/60 p-3 text-sm"
                >
                  <p className="font-headline font-bold text-bark-deep">
                    {r.label || CATEGORY_LABEL[r.category]}
                    <span className="ml-2 font-normal text-fg-2">
                      ({CATEGORY_LABEL[r.category]})
                    </span>
                  </p>
                  <p className="text-fg-2">
                    {fmtUsdCents(r.revenueNum)} total over {r.daysNum} days ={' '}
                    <strong className="text-bark-deep">
                      {fmtUsdCents(r.todayShare)}
                    </strong>{' '}
                    counted tomorrow.
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {computed.validRows.length === 0 && (
          <p className="mt-6 rounded-md border-2 border-dashed border-ink/15 p-4 text-center text-sm text-fg-2">
            Add at least one job with revenue to see the summary.
          </p>
        )}
      </section>
    </div>
  );
}
