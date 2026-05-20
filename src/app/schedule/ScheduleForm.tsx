'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { fmtUsdCents } from '@/lib/format';
import { loadSchedule, saveSchedule, type Category, type SavedJob } from './actions';

// ============================================================================
// Two kinds of entries the scheduler can record:
//   1. A per-category SINGLE-DAY BUCKET: "PHC — 25 jobs — $5,581 total"
//      (count >= 0, days = 1, no label)
//   2. A MULTI-DAY JOB: "Smith oak removal — Field Crew — $7,083 — 2 days"
//      (count = 1, days >= 2)
// Both shapes are stored in the same `daily_schedules.jobs` JSONB array as
// `SavedJob` objects. They differ only in which fields are meaningful.
// ============================================================================

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'field-crew', label: 'Field Crew' },
  { value: 'phc', label: 'PHC' },
  { value: 'stump', label: 'Stump Grinding' },
  { value: 'clam-hauling', label: 'Clam / Hauling' },
];

const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

// ---- Form-state types (string inputs) --------------------------------------
type BucketRow = {
  id: string;
  category: Category;
  count: string;
  revenue: string;
};

type MultiDayRow = {
  id: string;
  category: Category;
  label: string;
  revenue: string;
  days: string;
};

function newBucket(category: Category): BucketRow {
  return { id: crypto.randomUUID(), category, count: '', revenue: '' };
}
function defaultBuckets(): BucketRow[] {
  return CATEGORIES.map((c) => newBucket(c.value));
}
function newMultiDay(): MultiDayRow {
  return {
    id: crypto.randomUUID(),
    category: 'field-crew',
    label: '',
    revenue: '',
    days: '2',
  };
}

// ---- Convert saved -> form state -------------------------------------------
function splitSaved(jobs: SavedJob[]): { buckets: BucketRow[]; multi: MultiDayRow[] } {
  // Buckets: one per category. If saved data has a bucket for a category use it,
  // else create an empty one so the four bucket rows always render.
  const buckets: BucketRow[] = CATEGORIES.map((c) => {
    const saved = jobs.find(
      (j) => j.category === c.value && j.days === 1 && !j.label,
    );
    if (saved) {
      return {
        id: saved.id,
        category: c.value,
        count: saved.count > 0 ? String(saved.count) : '',
        revenue: saved.revenue > 0 ? saved.revenue.toFixed(2) : '',
      };
    }
    return newBucket(c.value);
  });

  const multi: MultiDayRow[] = jobs
    .filter((j) => j.days > 1)
    .map((j) => ({
      id: j.id,
      category: j.category,
      label: j.label,
      revenue: j.revenue > 0 ? j.revenue.toFixed(2) : '',
      days: String(j.days),
    }));

  return { buckets, multi };
}

// ---- Convert form state -> save payload ------------------------------------
function buildPayload(buckets: BucketRow[], multi: MultiDayRow[]): SavedJob[] {
  const out: SavedJob[] = [];

  for (const b of buckets) {
    const count = parseInt(b.count, 10);
    const revenue = parseMoney(b.revenue);
    // Keep the bucket if there's anything in either field; otherwise drop noise.
    if ((Number.isFinite(count) && count > 0) || revenue > 0) {
      out.push({
        id: b.id,
        category: b.category,
        label: '',
        count: Number.isFinite(count) && count > 0 ? count : 0,
        revenue,
        days: 1,
      });
    }
  }

  for (const m of multi) {
    const revenue = parseMoney(m.revenue);
    const days = parseDays(m.days);
    if (revenue > 0 || m.label.trim().length > 0) {
      out.push({
        id: m.id,
        category: m.category,
        label: m.label.trim(),
        count: 1,
        revenue,
        days: days >= 2 ? days : 2,
      });
    }
  }

  return out;
}

// ---- Number parsing --------------------------------------------------------
function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function parseDays(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---- Date helpers ----------------------------------------------------------
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
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
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

// ---- Dirty-check canonicalization ------------------------------------------
function canonical(payload: SavedJob[]): string {
  // Sort by category then label for stable comparison across reorderings.
  const norm = payload
    .map((j) => ({
      category: j.category,
      label: j.label,
      count: j.count,
      revenue: j.revenue,
      days: j.days,
    }))
    .sort((a, b) =>
      a.category === b.category
        ? a.label.localeCompare(b.label)
        : a.category.localeCompare(b.category),
    );
  return JSON.stringify(norm);
}

// ============================================================================
// Component
// ============================================================================
export default function ScheduleForm() {
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [buckets, setBuckets] = useState<BucketRow[]>(defaultBuckets());
  const [multi, setMulti] = useState<MultiDayRow[]>([]);
  const [baseline, setBaseline] = useState<string>(canonical([]));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  const loadReqId = useRef(0);

  useEffect(() => {
    setScheduleDate(tomorrowIso());
  }, []);

  useEffect(() => {
    if (!scheduleDate) return;
    const reqId = ++loadReqId.current;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    loadSchedule(scheduleDate)
      .then((saved) => {
        if (reqId !== loadReqId.current) return;
        if (saved) {
          const { buckets: b, multi: m } = splitSaved(saved.jobs);
          setBuckets(b);
          setMulti(m);
          setBaseline(canonical(buildPayload(b, m)));
          setSavedAt(saved.updatedAt);
          setSavedBy(saved.updatedBy);
        } else {
          const b = defaultBuckets();
          setBuckets(b);
          setMulti([]);
          setBaseline(canonical(buildPayload(b, [])));
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

  const currentPayload = useMemo(() => buildPayload(buckets, multi), [buckets, multi]);
  const dirty = useMemo(() => canonical(currentPayload) !== baseline, [currentPayload, baseline]);

  function updateBucket(id: string, patch: Partial<BucketRow>) {
    setBuckets((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function updateMulti(id: string, patch: Partial<MultiDayRow>) {
    setMulti((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function addMulti() {
    setMulti((ms) => [...ms, newMultiDay()]);
  }
  function removeMulti(id: string) {
    setMulti((ms) => ms.filter((m) => m.id !== id));
  }

  function tryChangeDate(next: string) {
    if (!next) return;
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Switch dates and lose them?');
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
    startSaveTransition(async () => {
      const result = await saveSchedule(scheduleDate, currentPayload);
      if (result.ok) {
        setBaseline(canonical(currentPayload));
        setSavedAt(result.updatedAt);
        setSavedBy(result.updatedBy);
      } else {
        setSaveError(result.error);
      }
    });
  }

  // ---- Derived numbers for the summary ----
  const computed = useMemo(() => {
    const enriched = currentPayload.map((j) => ({
      ...j,
      todayShare: j.days > 0 ? j.revenue / j.days : 0,
    }));

    const tomorrowTotal = enriched.reduce((s, j) => s + j.todayShare, 0);
    const grandTotal = enriched.reduce((s, j) => s + j.revenue, 0);
    const totalJobs = enriched.reduce((s, j) => s + j.count, 0);

    const byCategory = CATEGORIES.map((c) => {
      const inCat = enriched.filter((j) => j.category === c.value);
      return {
        value: c.value,
        label: c.label,
        count: inCat.reduce((s, j) => s + j.count, 0),
        tomorrowRevenue: inCat.reduce((s, j) => s + j.todayShare, 0),
      };
    });

    const multiDayJobs = enriched.filter((j) => j.days > 1);

    return { enriched, tomorrowTotal, grandTotal, totalJobs, byCategory, multiDayJobs };
  }, [currentPayload]);

  // ---- Save-status text ----
  let statusEl: React.ReactNode;
  if (loading) statusEl = <span className="text-fg-2">Loading…</span>;
  else if (saveError) statusEl = <span className="text-orange">Save failed: {saveError}</span>;
  else if (isSaving) statusEl = <span className="text-fg-2">Saving…</span>;
  else if (dirty) statusEl = <span className="text-orange">Unsaved changes</span>;
  else if (savedAt)
    statusEl = (
      <span className="text-fg-2">
        Saved {formatSavedAt(savedAt)}
        {savedBy ? ` by ${savedBy}` : ''}
      </span>
    );
  else statusEl = <span className="text-fg-2">Not saved yet</span>;

  // ---- Render ----
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ============ Form ============ */}
      <section className="bt-card">
        <p className="bt-eyebrow">Step 1 — Enter the jobs</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Jobs on the schedule
        </h2>

        {/* Date picker */}
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

        {/* ---- Single-day buckets per category ---- */}
        <div className="mt-7">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Single-day jobs (by category)
          </p>
          <p className="mt-1 text-xs text-fg-3">
            Enter the count and the total revenue for all of those jobs combined.
          </p>

          <div className="mt-3 space-y-2">
            {buckets.map((b) => (
              <div
                key={b.id}
                className="rounded-md border-2 border-ink/10 bg-white/60 p-3"
              >
                <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3 sm:grid-cols-[1fr_120px_160px]">
                  <p className="font-headline font-extrabold uppercase tracking-ribbon text-sm text-bark-deep">
                    {CATEGORY_LABEL[b.category]}
                  </p>

                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      How many?
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={b.count}
                      onChange={(e) => updateBucket(b.id, { count: e.target.value })}
                      placeholder="0"
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2">
                      Total revenue ($)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={b.revenue}
                      onChange={(e) => updateBucket(b.id, { revenue: e.target.value })}
                      placeholder="0.00"
                      className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Multi-day individual jobs ---- */}
        <div className="mt-7">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Multi-day jobs (one per row)
          </p>
          <p className="mt-1 text-xs text-fg-3">
            Each job&rsquo;s total revenue is divided by its days to figure out tomorrow&rsquo;s share.
          </p>

          {multi.length === 0 ? (
            <p className="mt-3 rounded-md border-2 border-dashed border-ink/15 p-4 text-center text-sm text-fg-2">
              No multi-day jobs scheduled.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {multi.map((m, idx) => {
                const revenue = parseMoney(m.revenue);
                const days = parseDays(m.days);
                const share = days > 0 ? revenue / days : 0;
                return (
                  <div
                    key={m.id}
                    className="rounded-md border-2 border-ink/10 bg-white/60 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
                        Multi-day job {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMulti(m.id)}
                        className="text-xs font-bold text-orange hover:underline"
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
                          value={m.category}
                          onChange={(e) =>
                            updateMulti(m.id, { category: e.target.value as Category })
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
                          value={m.label}
                          onChange={(e) => updateMulti(m.id, { label: e.target.value })}
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
                          value={m.revenue}
                          onChange={(e) => updateMulti(m.id, { revenue: e.target.value })}
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
                          min={2}
                          step={1}
                          value={m.days}
                          onChange={(e) => updateMulti(m.id, { days: e.target.value })}
                          className="mt-1 block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
                        />
                      </label>
                    </div>

                    {revenue > 0 && days > 1 && (
                      <p className="mt-2 text-xs text-fg-2">
                        {fmtUsdCents(revenue)} ÷ {days} days ={' '}
                        <strong className="text-bark-deep">{fmtUsdCents(share)}</strong> for tomorrow.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={addMulti}
            className="mt-3 bt-btn bt-btn-ghost"
          >
            + Add multi-day job
          </button>
        </div>

        {/* ---- Save controls ---- */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t-2 border-ink/10 pt-4">
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
              {computed.totalJobs} job{computed.totalJobs === 1 ? '' : 's'}
              {computed.multiDayJobs.length > 0
                ? ` · ${computed.multiDayJobs.length} multi-day`
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
                <td className="pt-3 font-headline font-extrabold">{computed.totalJobs}</td>
                <td className="pt-3 text-right font-headline text-lg font-black text-bark-deep">
                  {fmtUsdCents(computed.tomorrowTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {computed.multiDayJobs.length > 0 && (
          <div className="mt-6">
            <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Multi-day jobs
            </p>
            <ul className="mt-2 space-y-2">
              {computed.multiDayJobs.map((j) => (
                <li
                  key={j.id}
                  className="rounded-md border border-ink/10 bg-white/60 p-3 text-sm"
                >
                  <p className="font-headline font-bold text-bark-deep">
                    {j.label || CATEGORY_LABEL[j.category]}
                    <span className="ml-2 font-normal text-fg-2">
                      ({CATEGORY_LABEL[j.category]})
                    </span>
                  </p>
                  <p className="text-fg-2">
                    {fmtUsdCents(j.revenue)} total over {j.days} days ={' '}
                    <strong className="text-bark-deep">{fmtUsdCents(j.todayShare)}</strong>{' '}
                    counted tomorrow.
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {computed.totalJobs === 0 && (
          <p className="mt-6 rounded-md border-2 border-dashed border-ink/15 p-4 text-center text-sm text-fg-2">
            Add at least one job to see the summary.
          </p>
        )}
      </section>
    </div>
  );
}
