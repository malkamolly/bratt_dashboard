'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { fmtUsdCents } from '@/lib/format';
import { nextWorkdayIso } from '@/lib/workdays';
import {
  loadSchedule,
  saveSchedule,
  type Category,
  type FieldCrewSub,
  type SavedJob,
} from './actions';

// ============================================================================
// Two kinds of entries the scheduler can record:
//   1. A per-(sub)category SINGLE-DAY BUCKET: "PHC — 25 jobs — $5,581 total"
//      (count >= 0, days = 1, no label)
//   2. A MULTI-DAY JOB: "Smith oak removal — Field Crew · Removal — $7,083 — 2 days"
//      (count = 1, days >= 2)
// Field Crew entries carry a subcategory (Tree Work / Removal / Re-Work); other
// categories don't.
// Both shapes are stored together in the same daily_schedules.jobs JSONB array.
// ============================================================================

const CATEGORY_LABEL: Record<Category, string> = {
  'field-crew': 'Field Crew',
  phc: 'PHC',
  stump: 'Stump Grinding',
  'clam-hauling': 'Clam / Hauling',
};

const SUBCATEGORY_LABEL: Record<FieldCrewSub, string> = {
  'tree-work': 'Tree Work',
  removal: 'Removal',
  rework: 'Re-Work',
};

const FIELD_CREW_SUBS: FieldCrewSub[] = ['tree-work', 'removal', 'rework'];

// The fixed list of single-day buckets that always render in the form.
// Field Crew is split into three sub-buckets; the others have one each.
type BucketKey =
  | { category: 'field-crew'; subcategory: FieldCrewSub }
  | { category: Exclude<Category, 'field-crew'>; subcategory: null };

const BUCKET_KEYS: BucketKey[] = [
  { category: 'field-crew', subcategory: 'tree-work' },
  { category: 'field-crew', subcategory: 'removal' },
  { category: 'field-crew', subcategory: 'rework' },
  { category: 'phc', subcategory: null },
  { category: 'stump', subcategory: null },
  { category: 'clam-hauling', subcategory: null },
];

function bucketLabel(k: BucketKey): string {
  if (k.category === 'field-crew') {
    return `Field Crew · ${SUBCATEGORY_LABEL[k.subcategory]}`;
  }
  return CATEGORY_LABEL[k.category];
}

// Combined category+subcategory dropdown options for multi-day jobs.
// One dropdown shows everything ("Field Crew · Tree Work", "PHC", etc.) so
// the form doesn't need a second conditional dropdown for Field Crew jobs.
type CombinedKey =
  | 'field-crew:tree-work'
  | 'field-crew:removal'
  | 'field-crew:rework'
  | 'phc'
  | 'stump'
  | 'clam-hauling';

const COMBINED_OPTIONS: { key: CombinedKey; label: string }[] = [
  { key: 'field-crew:tree-work', label: 'Field Crew · Tree Work' },
  { key: 'field-crew:removal', label: 'Field Crew · Removal' },
  { key: 'field-crew:rework', label: 'Field Crew · Re-Work' },
  { key: 'phc', label: 'PHC' },
  { key: 'stump', label: 'Stump Grinding' },
  { key: 'clam-hauling', label: 'Clam / Hauling' },
];

function combinedKeyFor(category: Category, subcategory: FieldCrewSub | null): CombinedKey {
  if (category === 'field-crew') {
    return `field-crew:${subcategory ?? 'tree-work'}` as CombinedKey;
  }
  return category as CombinedKey;
}

function parseCombinedKey(
  key: string,
): { category: Category; subcategory: FieldCrewSub | null } {
  if (key.startsWith('field-crew:')) {
    const sub = key.slice('field-crew:'.length) as FieldCrewSub;
    return { category: 'field-crew', subcategory: sub };
  }
  return { category: key as Category, subcategory: null };
}

// ---- Form-state types (string inputs) --------------------------------------
type BucketRow = {
  id: string;
  category: Category;
  subcategory: FieldCrewSub | null;
  count: string;
  revenue: string;
};

type MultiDayRow = {
  id: string;
  category: Category;
  subcategory: FieldCrewSub | null;
  label: string;
  revenue: string;
  days: string;
};

function newBucket(k: BucketKey): BucketRow {
  return {
    id: crypto.randomUUID(),
    category: k.category,
    subcategory: k.subcategory,
    count: '',
    revenue: '',
  };
}
function defaultBuckets(): BucketRow[] {
  return BUCKET_KEYS.map(newBucket);
}
function newMultiDay(): MultiDayRow {
  return {
    id: crypto.randomUUID(),
    category: 'field-crew',
    subcategory: 'tree-work',
    label: '',
    revenue: '',
    days: '2',
  };
}

// ---- Convert saved -> form state -------------------------------------------
function splitSaved(jobs: SavedJob[]): { buckets: BucketRow[]; multi: MultiDayRow[] } {
  const buckets: BucketRow[] = BUCKET_KEYS.map((k) => {
    const match = jobs.find(
      (j) =>
        j.category === k.category &&
        (j.subcategory ?? null) === k.subcategory &&
        j.days === 1 &&
        !j.label,
    );
    if (match) {
      return {
        id: match.id,
        category: k.category,
        subcategory: k.subcategory,
        count: match.count > 0 ? String(match.count) : '',
        revenue: match.revenue > 0 ? match.revenue.toFixed(2) : '',
      };
    }
    return newBucket(k);
  });

  const multi: MultiDayRow[] = jobs
    .filter((j) => j.days > 1)
    .map((j) => ({
      id: j.id,
      category: j.category,
      subcategory:
        j.category === 'field-crew'
          ? (j.subcategory ?? 'tree-work')
          : null,
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
    if ((Number.isFinite(count) && count > 0) || revenue > 0) {
      out.push({
        id: b.id,
        category: b.category,
        subcategory: b.category === 'field-crew' ? b.subcategory : null,
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
        subcategory:
          m.category === 'field-crew'
            ? (m.subcategory ?? 'tree-work')
            : null,
        label: m.label.trim(),
        count: 1,
        revenue,
        days: days >= 2 ? days : 2,
      });
    }
  }

  return out;
}

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function parseDays(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// "Tomorrow" for scheduling purposes — the next actual workday after today,
// skipping weekends and observed holidays. See src/lib/workdays.ts.
function tomorrowIso(): string {
  return nextWorkdayIso();
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

function canonical(payload: SavedJob[]): string {
  const norm = payload
    .map((j) => ({
      category: j.category,
      subcategory: j.subcategory ?? null,
      label: j.label,
      count: j.count,
      revenue: j.revenue,
      days: j.days,
    }))
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      const sa = a.subcategory ?? '';
      const sb = b.subcategory ?? '';
      if (sa !== sb) return sa.localeCompare(sb);
      return a.label.localeCompare(b.label);
    });
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
    setMulti((ms) =>
      ms.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        // Keep subcategory in sync with category. If category becomes
        // Field Crew and there's no subcategory yet, default to tree-work.
        // If category leaves Field Crew, clear subcategory.
        if (next.category === 'field-crew' && !next.subcategory) {
          next.subcategory = 'tree-work';
        } else if (next.category !== 'field-crew') {
          next.subcategory = null;
        }
        return next;
      }),
    );
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

    const byCategory = (['field-crew', 'phc', 'stump', 'clam-hauling'] as Category[]).map(
      (cat) => {
        const inCat = enriched.filter((j) => j.category === cat);
        const subBreakdown =
          cat === 'field-crew'
            ? FIELD_CREW_SUBS.map((sub) => {
                const inSub = inCat.filter((j) => j.subcategory === sub);
                return {
                  key: sub,
                  label: SUBCATEGORY_LABEL[sub],
                  count: inSub.reduce((s, j) => s + j.count, 0),
                  tomorrowRevenue: inSub.reduce((s, j) => s + j.todayShare, 0),
                };
              })
            : [];
        return {
          value: cat,
          label: CATEGORY_LABEL[cat],
          count: inCat.reduce((s, j) => s + j.count, 0),
          tomorrowRevenue: inCat.reduce((s, j) => s + j.todayShare, 0),
          subBreakdown,
        };
      },
    );

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
        <h2 className="mt-1 font-headline text-xl font-black uppercase text-bark-deep">
          Jobs on the schedule
        </h2>

        {/* Date picker */}
        <div className="mt-4">
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

        {/* ---- Single-day buckets per (sub)category ---- */}
        <div className="mt-5">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Single-day jobs (by category)
          </p>

          {/* Column headers, shown once instead of per-row labels. */}
          <div className="mt-2 grid grid-cols-[1fr_72px_120px] items-end gap-2 px-2 sm:grid-cols-[1fr_88px_140px]">
            <span />
            <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              How many?
            </span>
            <span className="text-right font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Total revenue
            </span>
          </div>

          <div className="mt-1 divide-y-2 divide-ink/5 rounded-md border-2 border-ink/10 bg-white/60">
            {buckets.map((b) => {
              const isFieldCrewSub = b.category === 'field-crew' && b.subcategory != null;
              return (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_72px_120px] items-center gap-2 px-2 py-1.5 sm:grid-cols-[1fr_88px_140px]"
                >
                  <p
                    className={
                      isFieldCrewSub
                        ? 'pl-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep'
                        : 'font-headline text-sm font-extrabold uppercase tracking-ribbon text-bark-deep'
                    }
                  >
                    {isFieldCrewSub ? (
                      <>
                        <span className="text-fg-3">↳ </span>
                        {SUBCATEGORY_LABEL[b.subcategory as FieldCrewSub]}
                      </>
                    ) : (
                      bucketLabel(b as BucketKey)
                    )}
                  </p>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={b.count}
                    onChange={(e) => updateBucket(b.id, { count: e.target.value })}
                    placeholder="0"
                    aria-label={`${bucketLabel(b as BucketKey)} — how many`}
                    className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={b.revenue}
                    onChange={(e) => updateBucket(b.id, { revenue: e.target.value })}
                    placeholder="0.00"
                    aria-label={`${bucketLabel(b as BucketKey)} — total revenue`}
                    className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Multi-day individual jobs ---- */}
        <div className="mt-5">
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Multi-day jobs (one per row)
          </p>

          {multi.length === 0 ? (
            <p className="mt-2 text-xs text-fg-3">
              None yet. Each job&rsquo;s total revenue is divided by its days to figure out tomorrow&rsquo;s share.
            </p>
          ) : (
            <>
              {/* Column headers — shown once, not per row. */}
              <div className="mt-2 grid grid-cols-[150px_minmax(0,1fr)_100px_56px_20px] items-end gap-2 px-2">
                <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Category
                </span>
                <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Customer / label
                </span>
                <span className="text-right font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Revenue
                </span>
                <span className="text-right font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                  Days
                </span>
                <span />
              </div>

              <div className="mt-1 divide-y-2 divide-ink/5 rounded-md border-2 border-ink/10 bg-white/60">
                {multi.map((m) => {
                  const revenue = parseMoney(m.revenue);
                  const days = parseDays(m.days);
                  const share = days > 0 ? revenue / days : 0;
                  const combinedKey = combinedKeyFor(m.category, m.subcategory);
                  return (
                    <div key={m.id} className="px-2 py-1.5">
                      <div className="grid grid-cols-[150px_minmax(0,1fr)_100px_56px_20px] items-center gap-2">
                        <select
                          value={combinedKey}
                          onChange={(e) => {
                            const parsed = parseCombinedKey(e.target.value);
                            updateMulti(m.id, parsed);
                          }}
                          aria-label="Category"
                          className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
                        >
                          {COMBINED_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={m.label}
                          onChange={(e) => updateMulti(m.id, { label: e.target.value })}
                          placeholder="optional"
                          aria-label="Customer / label"
                          className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={m.revenue}
                          onChange={(e) => updateMulti(m.id, { revenue: e.target.value })}
                          placeholder="0.00"
                          aria-label="Total job revenue"
                          className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
                        />
                        <input
                          type="number"
                          min={2}
                          step={1}
                          value={m.days}
                          onChange={(e) => updateMulti(m.id, { days: e.target.value })}
                          aria-label="Total days"
                          className="block w-full rounded-md border-2 border-ink/20 bg-white px-2 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeMulti(m.id)}
                          aria-label="Remove this job"
                          className="text-lg font-bold leading-none text-orange hover:text-orange-press"
                        >
                          ×
                        </button>
                      </div>
                      {revenue > 0 && days > 1 && (
                        <p className="mt-1 pl-1 text-[11px] text-fg-2">
                          {fmtUsdCents(revenue)} ÷ {days} days ={' '}
                          <strong className="text-bark-deep">{fmtUsdCents(share)}</strong> for tomorrow.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
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
                <Fragment key={c.value}>
                  <tr className="border-b border-ink/5">
                    <td className="py-2 font-headline font-bold text-bark-deep">{c.label}</td>
                    <td className="py-2">{c.count}</td>
                    <td className="py-2 text-right font-headline font-bold">
                      {fmtUsdCents(c.tomorrowRevenue)}
                    </td>
                  </tr>
                  {c.subBreakdown.map((sub) => (
                    <tr key={sub.key} className="border-b border-ink/5">
                      <td className="py-1 pl-4 text-xs text-fg-2">
                        <span className="text-fg-3">↳ </span>
                        {sub.label}
                      </td>
                      <td className="py-1 text-xs text-fg-2">{sub.count}</td>
                      <td className="py-1 text-right text-xs text-fg-2">
                        {fmtUsdCents(sub.tomorrowRevenue)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
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
              {computed.multiDayJobs.map((j) => {
                const catLabel =
                  j.category === 'field-crew' && j.subcategory
                    ? `Field Crew · ${SUBCATEGORY_LABEL[j.subcategory]}`
                    : CATEGORY_LABEL[j.category];
                return (
                  <li
                    key={j.id}
                    className="rounded-md border border-ink/10 bg-white/60 p-3 text-sm"
                  >
                    <p className="font-headline font-bold text-bark-deep">
                      {j.label || catLabel}
                      <span className="ml-2 font-normal text-fg-2">({catLabel})</span>
                    </p>
                    <p className="text-fg-2">
                      {fmtUsdCents(j.revenue)} total over {j.days} days ={' '}
                      <strong className="text-bark-deep">{fmtUsdCents(j.todayShare)}</strong>{' '}
                      counted tomorrow.
                    </p>
                  </li>
                );
              })}
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
