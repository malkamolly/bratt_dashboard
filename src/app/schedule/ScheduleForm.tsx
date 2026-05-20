'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { fmtUsdCents } from '@/lib/format';
import { loadSchedule, saveSchedule, type Category, type SavedJob } from './actions';

type JobRow = {
  id: string;
  category: Category;
  label: string;
  revenue: string; // kept as string for nice input behavior
  days: string;
};

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'field-crew', label: 'Field Crew' },
  { value: 'phc', label: 'PHC' },
  { value: 'stump', label: 'Stump Grinding' },
  { value: 'clam-hauling', label: 'Clam / Hauling' },
];

const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
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

function defaultRows(): JobRow[] {
  return [newRow(), newRow('phc'), newRow('stump')];
}

function rowsFromSaved(jobs: SavedJob[]): JobRow[] {
  if (jobs.length === 0) return defaultRows();
  return jobs.map((j) => ({
    id: j.id,
    category: j.category,
    label: j.label,
    revenue: j.revenue > 0 ? j.revenue.toFixed(2) : '',
    days: String(j.days),
  }));
}

function rowsToPayload(rows: JobRow[]): SavedJob[] {
  // Drop fully-empty rows (no revenue and no label) so we don't store noise.
  return rows
    .map((r) => ({
      id: r.id,
      category: r.category,
      label: r.label.trim(),
      revenue: parseMoney(r.revenue),
      days: parseDays(r.days),
    }))
    .filter((j) => j.revenue > 0 || j.label.length > 0);
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatLongDate(iso: string): string {
  if (!iso) return '';
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

function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Stable JSON representation used for dirty-checking.
function canonical(rows: JobRow[]): string {
  return JSON.stringify(
    rowsToPayload(rows).map((j) => ({
      category: j.category,
      label: j.label,
      revenue: j.revenue,
      days: j.days,
    })),
  );
}

export default function ScheduleForm() {
  // Start blank to avoid SSR/CSR hydration mismatch on the date; set on mount.
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [rows, setRows] = useState<JobRow[]>(defaultRows());
  const [baseline, setBaseline] = useState<string>(canonical(defaultRows()));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  // Guard against stale loads when the date changes quickly.
  const loadReqId = useRef(0);

  // Initial mount: set tomorrow's date (triggers the load effect below).
  useEffect(() => {
    setScheduleDate(tomorrowIso());
  }, []);

  // Load saved schedule whenever the date changes.
  useEffect(() => {
    if (!scheduleDate) return;
    const reqId = ++loadReqId.current;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    loadSchedule(scheduleDate)
      .then((saved) => {
        if (reqId !== loadReqId.current) return; // stale
        if (saved) {
          const nextRows = rowsFromSaved(saved.jobs);
          setRows(nextRows);
          setBaseline(canonical(nextRows));
          setSavedAt(saved.updatedAt);
          setSavedBy(saved.updatedBy);
        } else {
          const blank = defaultRows();
          setRows(blank);
          setBaseline(canonical(blank));
          setSavedAt(null);
          setSavedBy(null);
        }
      })
      .catch((err: unknown) => {
        if (reqId !== loadReqId.current) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load.');
      })
      .finally(() => {
        if (reqId === loadReqId.current) setLoading(false);
      });
  }, [scheduleDate]);

  const dirty = useMemo(() => canonical(rows) !== baseline, [rows, baseline]);

  function updateRow(id: string, patch: Partial<JobRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  function tryChangeDate(next: string) {
    if (!next) return;
    if (dirty) {
      const ok = window.confirm(
        'You have unsaved changes. Switch dates and lose them?',
      );
      if (!ok) return;
    }
    setScheduleDate(next);
  }

  function shiftDate(deltaDays: number) {
    if (!scheduleDate) return;
    const [y, m, d] = scheduleDate.split('-').map((s) => parseInt(s, 10));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    tryChangeDate(`${yyyy}-${mm}-${dd}`);
  }

  function onSave() {
    if (!scheduleDate) return;
    setSaveError(null);
    const payload = rowsToPayload(rows);
    startSaveTransition(async () => {
      const result = await saveSchedule(scheduleDate, payload);
      if (result.ok) {
        setBaseline(canonical(rows));
        setSavedAt(result.updatedAt);
        setSavedBy(result.updatedBy);
      } else {
        setSaveError(result.error);
      }
    });
  }

  // ---- Derived numbers for the summary -----------------------------------
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

  // ---- Save status text --------------------------------------------------
  let statusEl: React.ReactNode;
  if (loading) {
    statusEl = <span className="text-fg-2">Loading…</span>;
  } else if (saveError) {
    statusEl = <span className="text-orange">Save failed: {saveError}</span>;
  } else if (isSaving) {
    statusEl = <span className="text-fg-2">Saving…</span>;
  } else if (dirty) {
    statusEl = <span className="text-orange">Unsaved changes</span>;
  } else if (savedAt) {
    statusEl = (
      <span className="text-fg-2">
        Saved {formatSavedAt(savedAt)}
        {savedBy ? ` by ${savedBy}` : ''}
      </span>
    );
  } else {
    statusEl = <span className="text-fg-2">Not saved yet</span>;
  }

  // ---- Render ------------------------------------------------------------
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ============ Form ============ */}
      <section className="bt-card">
        <p className="bt-eyebrow">Step 1 — Enter the jobs</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Jobs on the schedule
        </h2>

        <div className="mt-5">
          <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Schedule date
          </span>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-sm hover:border-orange"
              aria-label="Previous day"
            >
              &larr;
            </button>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => tryChangeDate(e.target.value)}
              className="block flex-1 rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-sm hover:border-orange"
              aria-label="Next day"
            >
              &rarr;
            </button>
          </div>
          {loadError && (
            <p className="mt-2 text-xs text-orange">Load failed: {loadError}</p>
          )}
        </div>

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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={addRow} className="bt-btn bt-btn-ghost">
            + Add another job
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || isSaving || loading || !scheduleDate}
            className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save schedule'}
          </button>
          <span className="ml-auto text-xs">{statusEl}</span>
        </div>
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
