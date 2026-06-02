// ============================================================================
// Forecast-vs-actual data loader (server-only)
// ============================================================================
// Lines up what we *scheduled* for each day (the "Tomorrow's Schedule" log in
// `daily_schedules`) against what each crew *actually* booked that day
// (`production_entries`). Both are keyed by calendar date, so we group by
// date and bucket into the four work types the scheduler uses.
//
// Forecast dollars use the SAME "daily share" rule the schedule page shows:
// a multi-day job's revenue is spread evenly across its days, so a $9k job
// over 3 days contributes $3k to each of those days. (We only have the job's
// total + day count, not a per-day plan, so an even split is the honest
// approximation — and it matches the "Tomorrow's worth of work" figure the
// scheduler already sees.)
//
// Pure I/O + bucketing. No pace math here.
// ============================================================================

import { serverClient } from './supabase';
import { monthRange, type IsoDate } from './dates';
import type { CrewKind } from '@/types';
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
  type DayComparison,
  type ForecastVsActualData,
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
  ForecastVsActualData,
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

export async function loadForecastVsActual(
  year?: number,
  month?: number,
): Promise<ForecastVsActualData> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const supabase = await serverClient();
  const { start, end } = monthRange(y, m);

  const [schedulesRes, entriesRes, crewsRes] = await Promise.all([
    supabase
      .from('daily_schedules')
      .select('schedule_date, jobs')
      .gte('schedule_date', start)
      .lte('schedule_date', end),
    supabase
      .from('production_entries')
      .select('entry_date, crew_id, revenue')
      .gte('entry_date', start)
      .lte('entry_date', end),
    // All crews (including inactive) so historic entries from a now-retired
    // crew still map to the right work type.
    supabase.from('crews').select('id, kind'),
  ]);

  const crewKind = new Map<string, CrewKind>();
  for (const c of crewsRes.data ?? []) {
    crewKind.set(c.id as string, c.kind as CrewKind);
  }

  // Forecast: sum daily-share by date + category.
  const forecastByDate = new Map<IsoDate, Record<ForecastCategory, number>>();
  for (const row of schedulesRes.data ?? []) {
    const date = row.schedule_date as IsoDate;
    const jobs = Array.isArray(row.jobs) ? row.jobs : [];
    const bucket = forecastByDate.get(date) ?? zeroByCategory();
    for (const raw of jobs) {
      const js = jobShare(raw);
      if (js) bucket[js.category] += js.share;
    }
    forecastByDate.set(date, bucket);
  }

  // Actual: sum booked revenue by date + category (via crew kind).
  const actualByDate = new Map<IsoDate, Record<ForecastCategory, number>>();
  for (const row of entriesRes.data ?? []) {
    const date = row.entry_date as IsoDate;
    const kind = crewKind.get(row.crew_id as string) ?? 'production';
    const category = kindToCategory(kind);
    const bucket = actualByDate.get(date) ?? zeroByCategory();
    bucket[category] += Number(row.revenue) || 0;
    actualByDate.set(date, bucket);
  }

  // One row per date that has EITHER a forecast or an actual — so a day we
  // planned work but booked nothing (or vice versa) still shows up as the
  // discrepancy it is.
  const allDates = Array.from(
    new Set<IsoDate>([...forecastByDate.keys(), ...actualByDate.keys()]),
  ).sort();

  const totalsForecast = zeroByCategory();
  const totalsActual = zeroByCategory();

  const days: DayComparison[] = allDates.map((date) => {
    const forecast = forecastByDate.get(date) ?? zeroByCategory();
    const actual = actualByDate.get(date) ?? zeroByCategory();
    let forecastTotal = 0;
    let actualTotal = 0;
    for (const cat of FORECAST_CATEGORIES) {
      totalsForecast[cat] += forecast[cat];
      totalsActual[cat] += actual[cat];
      forecastTotal += forecast[cat];
      actualTotal += actual[cat];
    }
    return { date, forecast, actual, forecastTotal, actualTotal };
  });

  return {
    year: y,
    month: m,
    days,
    totals: {
      forecast: totalsForecast,
      actual: totalsActual,
      forecastTotal: FORECAST_CATEGORIES.reduce((s, c) => s + totalsForecast[c], 0),
      actualTotal: FORECAST_CATEGORIES.reduce((s, c) => s + totalsActual[c], 0),
    },
  };
}
