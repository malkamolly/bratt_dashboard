// ============================================================================
// Forecast-vs-actual shared types + constants (client-safe)
// ============================================================================
// Kept separate from `forecast-actual-data.ts` so the client chart component
// can import the category list, labels, and row shapes WITHOUT pulling in the
// server-only Supabase client (which imports `next/headers` and can't live in
// a client bundle).
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

export type DayComparison = {
  date: string; // ISO YYYY-MM-DD
  forecast: Record<ForecastCategory, number>;
  actual: Record<ForecastCategory, number>;
  forecastTotal: number;
  actualTotal: number;
};

export type ForecastVsActualData = {
  year: number;
  month: number;
  days: DayComparison[];
  totals: {
    forecast: Record<ForecastCategory, number>;
    actual: Record<ForecastCategory, number>;
    forecastTotal: number;
    actualTotal: number;
  };
};
