// ============================================================================
// Forecast-vs-actual data loader (server-only)
// ============================================================================
// For a SINGLE day, lines up what we scheduled (the "Tomorrow's Schedule" log
// in `daily_schedules`) against what each crew actually booked that day
// (`production_entries`), bucketed into the four work types.
//
// Projected dollars use the SAME "daily share" rule the schedule page shows:
// a multi-day job's revenue is spread evenly across its days, so a $9k job
// over 3 days contributes $3k to each of those days. (We only have the job's
// total + day count, not a per-day plan, so an even split is the honest
// approximation — and it matches the "Tomorrow's worth of work" figure the
// scheduler already sees.)
//
// Pure I/O + bucketing. No pace math here.
// ============================================================================

import { serverClient } from './supabase';
import type { CrewKind } from '@/types';
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
  type DayComparison,
  type DayComparisonRow,
} from './forecast-actual-types';

// Re-export the client-safe pieces so server callers can keep importing
// everything (loader + constants/types) from this one module.
export {
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
} from './forecast-actual-types';
export type {
  ForecastCategory,
  DayComparison,
  DayComparisonRow,
} from './forecast-actual-types';

// Map a crew's `kind` (on the actuals side) onto a schedule category. Clam
// crews book under their own category; everything production-ish (including
// the rare 'unassigned' crew) rolls into Field Crew so no actual revenue is
// silently dropped from the comparison.
function kindToCategory(kind: CrewKind): ForecastCategory {
  switch (kind) {
    case 'phc':
      return 'phc';
    case 'stump':
      return 'stump';
    case 'clam':
      return 'clam-hauling';
    case 'production':
    case 'unassigned':
    default:
      return 'field-crew';
  }
}

function zeroByCategory(): Record<ForecastCategory, number> {
  return { 'field-crew': 0, phc: 0, stump: 0, 'clam-hauling': 0 };
}

// Loosely validate one stored schedule job; we only need category/revenue/days
// for the comparison. Anything malformed is skipped rather than throwing.
function jobShare(raw: unknown): { category: ForecastCategory; share: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  const category = j.category as ForecastCategory;
  if (!FORECAST_CATEGORIES.includes(category)) return null;
  const revenueRaw = typeof j.revenue === 'number' ? j.revenue : Number(j.revenue);
  const revenue = Number.isFinite(revenueRaw) && revenueRaw > 0 ? revenueRaw : 0;
  const daysRaw = typeof j.days === 'number' ? j.days : Number(j.days);
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.floor(daysRaw) : 1;
  return { category, share: revenue / days };
}

export async function loadDayComparison(dateIso: string): Promise<DayComparison> {
  const supabase = await serverClient();

  const [scheduleRes, entriesRes, crewsRes] = await Promise.all([
    supabase
      .from('daily_schedules')
      .select('jobs, updated_at, updated_by')
      .eq('schedule_date', dateIso)
      .maybeSingle(),
    supabase
      .from('production_entries')
      .select('crew_id, revenue')
      .eq('entry_date', dateIso),
    // All crews (including inactive) so historic entries from a now-retired
    // crew still map to the right work type.
    supabase.from('crews').select('id, kind'),
  ]);

  const crewKind = new Map<string, CrewKind>();
  for (const c of crewsRes.data ?? []) {
    crewKind.set(c.id as string, c.kind as CrewKind);
  }

  // Projected: sum the daily share of every scheduled job, by category.
  const projected = zeroByCategory();
  const jobs = Array.isArray(scheduleRes.data?.jobs) ? scheduleRes.data.jobs : [];
  for (const raw of jobs) {
    const js = jobShare(raw);
    if (js) projected[js.category] += js.share;
  }
  const hasSchedule = !!scheduleRes.data;

  // Actual: sum booked revenue, mapped to a category via crew kind.
  const actual = zeroByCategory();
  const entries = entriesRes.data ?? [];
  for (const row of entries) {
    const kind = crewKind.get(row.crew_id as string) ?? 'production';
    actual[kindToCategory(kind)] += Number(row.revenue) || 0;
  }
  const hasActual = entries.length > 0;

  const rows: DayComparisonRow[] = FORECAST_CATEGORIES.map((category) => ({
    category,
    projected: projected[category],
    actual: actual[category],
  }));

  return {
    date: dateIso,
    rows,
    projectedTotal: rows.reduce((s, r) => s + r.projected, 0),
    actualTotal: rows.reduce((s, r) => s + r.actual, 0),
    hasSchedule,
    hasActual,
    scheduleUpdatedBy: (scheduleRes.data?.updated_by as string | null) ?? null,
    scheduleUpdatedAt: (scheduleRes.data?.updated_at as string | null) ?? null,
  };
}
