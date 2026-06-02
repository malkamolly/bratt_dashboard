// ============================================================================
// Forecast-vs-actual shared types + constants (client-safe)
// ============================================================================
// Kept separate from `forecast-actual-data.ts` so client components can import
// the category list + labels WITHOUT pulling in the server-only Supabase
// client (which imports `next/headers` and can't live in a client bundle).
// ============================================================================

// The four work types, shared with the schedule's categories.
export type ForecastCategory = 'field-crew' | 'phc' | 'stump' | 'clam-hauling';

export const FORECAST_CATEGORIES: ForecastCategory[] = [
  'field-crew',
  'phc',
  'stump',
  'clam-hauling',
];

export const FORECAST_CATEGORY_LABEL: Record<ForecastCategory, string> = {
  'field-crew': 'Field Crew',
  phc: 'PHC',
  stump: 'Stump Grinding',
  'clam-hauling': 'Clam / Hauling',
};

// One work type's projected-vs-actual for a single day.
export type DayComparisonRow = {
  category: ForecastCategory;
  projected: number; // from the saved schedule (daily share)
  actual: number; // from booked production
};

// The full picture for one day: a row per work type plus totals and a little
// context about the saved schedule.
export type DayComparison = {
  date: string; // ISO YYYY-MM-DD
  rows: DayComparisonRow[];
  projectedTotal: number;
  actualTotal: number;
  hasSchedule: boolean; // was a schedule saved for this day at all?
  hasActual: boolean; // was any production entered for this day?
  scheduleUpdatedBy: string | null;
  scheduleUpdatedAt: string | null;
};
