// ============================================================================
// Off-Season Work (OSW) pace tracker — data layer
// ============================================================================
// Server-only loaders + the pace math for the Off-Season dashboard. Bratt Tree
// pushes off-season tree work two ways:
//
//   * "discounted"  — the fall discounted push (the Nov/Dec window).
//   * "dormant"     — winter dormant-season work that MUST be done cold, like
//                     oaks, to limit disease spread (the Jan/March window).
//
// Each work type has a dollar goal and a booking window. Every day the office
// records the running total of off-season revenue booked so far and the
// discount dollars given. This module turns those raw snapshots into the
// numbers the dashboard shows: progress to goal, whether we're ahead of or
// behind an even "pace" line for today's date, and what the push has cost in
// discounts. See migration 062_off_season_pace.sql for the tables.
// ============================================================================

import { serverClient } from './supabase';

export type WorkType = 'discounted' | 'dormant';

export const WORK_TYPES: WorkType[] = ['discounted', 'dormant'];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  discounted: 'Discounted OSW',
  dormant: 'Dormant Season OSW',
};

export const WORK_TYPE_BLURB: Record<WorkType, string> = {
  discounted:
    'The fall discounted push — work we book into November/December, often at a discount.',
  dormant:
    'Dormant-season work that must happen cold (oaks and other disease-prone species) to limit spread — the January/March window.',
};

// ----------------------------------------------------------------------------
// Row shapes (plain objects; numerics coerced to real numbers).
// ----------------------------------------------------------------------------

export type Season = {
  id: string;
  label: string;
  isCurrent: boolean;
};

export type Target = {
  workType: WorkType;
  goalAmount: number;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string; // YYYY-MM-DD
};

export type SeriesPoint = {
  date: string; // YYYY-MM-DD
  booked: number; // cumulative booked revenue that day
  ramp: number; // even-pace goal target for that date
};

// Everything the dashboard needs for one work type.
export type TargetSummary = Target & {
  label: string;
  blurb: string;
  asOf: string; // the date the "booked" figure is measured as of
  booked: number; // booked revenue as of `asOf`
  expected: number; // even-pace target as of `asOf`
  pace: number; // booked - expected (positive = ahead of pace)
  pctToGoal: number; // booked / goal (ratio, e.g. 0.42)
  pctOfWindow: number; // how far through the booking window we are (ratio)
  discountGiven: number;
  discountPct: number; // discount / booked (ratio)
  hasStarted: boolean; // has the booking window opened yet?
  series: SeriesPoint[];
};

export type DashboardData = {
  season: Season;
  seasons: Season[]; // all seasons, for the switcher
  targets: TargetSummary[];
};

// ----------------------------------------------------------------------------
// Small date helpers. Dates are plain YYYY-MM-DD strings; we parse at local
// midnight so day math is stable regardless of server timezone.
// ----------------------------------------------------------------------------

function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function daysBetween(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Today as a YYYY-MM-DD string, in the server's local time. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The even-pace goal target for a given date: goal * fraction-of-window. */
function rampValue(target: Target, date: string): number {
  const total = daysBetween(target.windowStart, target.windowEnd);
  if (total <= 0) return target.goalAmount;
  const elapsed = clamp(daysBetween(target.windowStart, date), 0, total);
  return (target.goalAmount * elapsed) / total;
}

// ----------------------------------------------------------------------------
// Loaders
// ----------------------------------------------------------------------------

export async function loadSeasons(): Promise<Season[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('off_season_seasons')
    .select('id, label, is_current')
    .order('label', { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    isCurrent: !!r.is_current,
  }));
}

/**
 * Loads the full dashboard for one season. If `seasonId` is omitted, the
 * current season is used (or, if somehow none is flagged current, the first).
 */
export async function loadDashboard(
  seasonId?: string,
): Promise<DashboardData | null> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  if (seasons.length === 0) return null;

  const season =
    (seasonId && seasons.find((s) => s.id === seasonId)) ||
    seasons.find((s) => s.isCurrent) ||
    seasons[0];

  const [targetsRes, entriesRes] = await Promise.all([
    supabase
      .from('off_season_targets')
      .select('work_type, goal_amount, window_start, window_end')
      .eq('season_id', season.id),
    supabase
      .from('off_season_entries')
      .select('work_type, entry_date, scheduled_revenue, discount_given')
      .eq('season_id', season.id)
      .order('entry_date', { ascending: true }),
  ]);

  const today = todayIso();

  const targets: TargetSummary[] = WORK_TYPES.map((workType) => {
    const t = (targetsRes.data ?? []).find((r) => r.work_type === workType);
    const target: Target = {
      workType,
      goalAmount: t ? Number(t.goal_amount) : 0,
      windowStart: (t?.window_start as string) ?? today,
      windowEnd: (t?.window_end as string) ?? today,
    };

    const rows = (entriesRes.data ?? [])
      .filter((r) => r.work_type === workType)
      .map((r) => ({
        date: r.entry_date as string,
        booked: Number(r.scheduled_revenue),
        discount: Number(r.discount_given),
      }));

    // "As of" date: for the current season, today; for a completed season,
    // the end of the window (so it shows the final result).
    const asOf = season.isCurrent
      ? today
      : target.windowEnd;

    // Latest snapshot on or before `asOf`.
    const upTo = rows.filter((r) => r.date <= asOf);
    const latest = upTo.length > 0 ? upTo[upTo.length - 1] : null;
    const booked = latest?.booked ?? 0;
    const discountGiven = latest?.discount ?? 0;

    const expected = rampValue(target, asOf);
    const totalDays = daysBetween(target.windowStart, target.windowEnd);
    const pctOfWindow =
      totalDays <= 0
        ? 1
        : clamp(daysBetween(target.windowStart, asOf) / totalDays, 0, 1);

    const series: SeriesPoint[] = rows.map((r) => ({
      date: r.date,
      booked: r.booked,
      ramp: rampValue(target, r.date),
    }));

    return {
      ...target,
      label: WORK_TYPE_LABELS[workType],
      blurb: WORK_TYPE_BLURB[workType],
      asOf,
      booked,
      expected,
      pace: booked - expected,
      pctToGoal: target.goalAmount > 0 ? booked / target.goalAmount : 0,
      pctOfWindow,
      discountGiven,
      discountPct: booked > 0 ? discountGiven / booked : 0,
      hasStarted: today >= target.windowStart,
      series,
    };
  });

  return { season, seasons, targets };
}

// ----------------------------------------------------------------------------
// Entry-form loader: existing values for one date in the current season.
// ----------------------------------------------------------------------------

export type EntryValues = Record<
  WorkType,
  { scheduled: number | null; discount: number | null }
>;

export type EntrySeason = {
  season: Season;
  date: string;
  values: EntryValues;
};

export async function loadEntrySeason(date: string): Promise<EntrySeason | null> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  const season = seasons.find((s) => s.isCurrent) ?? seasons[0];
  if (!season) return null;

  const { data } = await supabase
    .from('off_season_entries')
    .select('work_type, scheduled_revenue, discount_given')
    .eq('season_id', season.id)
    .eq('entry_date', date);

  const values: EntryValues = {
    discounted: { scheduled: null, discount: null },
    dormant: { scheduled: null, discount: null },
  };
  for (const r of data ?? []) {
    const wt = r.work_type as WorkType;
    if (wt in values) {
      values[wt] = {
        scheduled: Number(r.scheduled_revenue),
        discount: Number(r.discount_given),
      };
    }
  }

  return { season, date, values };
}

// ----------------------------------------------------------------------------
// Settings loader: seasons + their targets, for the admin settings screen.
// ----------------------------------------------------------------------------

export type SeasonSettings = Season & { targets: Target[] };

export async function loadSettings(): Promise<SeasonSettings[]> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  if (seasons.length === 0) return [];

  const { data } = await supabase
    .from('off_season_targets')
    .select('season_id, work_type, goal_amount, window_start, window_end');

  return seasons.map((s) => ({
    ...s,
    targets: WORK_TYPES.map((workType) => {
      const t = (data ?? []).find(
        (r) => r.season_id === s.id && r.work_type === workType,
      );
      return {
        workType,
        goalAmount: t ? Number(t.goal_amount) : 0,
        windowStart: (t?.window_start as string) ?? '',
        windowEnd: (t?.window_end as string) ?? '',
      };
    }),
  }));
}
